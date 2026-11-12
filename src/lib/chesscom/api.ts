import type { RawCcGame } from "./types";

/**
 * Client for Chess.com's public data API (https://api.chess.com/pub). It needs no account or
 * key and only returns games that are already public. Requests go straight from the learner's
 * browser to Chess.com: ChessPath has no server.
 */
const BASE = "https://api.chess.com/pub";

/** Pause between requests: Chess.com asks for serial, unhurried access. */
const PAUSE_MS = 350;

export type CcErrorKind = "invalid-username" | "not-found" | "rate-limited" | "offline" | "blocked" | "server" | "cancelled";

export class CcError extends Error {
  constructor(
    public readonly kind: CcErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "CcError";
  }
}

/** Chess.com usernames: letters, digits, underscores and hyphens. */
export function normaliseUsername(input: string): string | null {
  // Accept a pasted profile link such as https://www.chess.com/member/Name
  const fromUrl = /chess\.com\/(?:member|players?|stats\/[a-z-]+)\/([A-Za-z0-9_-]+)/i.exec(input)?.[1];
  const name = (fromUrl ?? input).trim().replace(/^@/, "");
  return /^[A-Za-z0-9_-]{2,30}$/.test(name) ? name.toLowerCase() : null;
}

export interface FetchDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function getJson<T>(url: string, deps: FetchDeps, username: string): Promise<T> {
  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    if (deps.signal?.aborted) throw new CcError("cancelled", "Cancelled.");
    let res: Response;
    try {
      res = await doFetch(url, { signal: deps.signal, headers: { Accept: "application/json" } });
    } catch (e) {
      if (deps.signal?.aborted || (e instanceof DOMException && e.name === "AbortError")) throw new CcError("cancelled", "Cancelled.");
      throw new CcError("offline", "Could not reach Chess.com. Check your internet connection and try again.");
    }
    if (res.ok) {
      try {
        return (await res.json()) as T;
      } catch {
        throw new CcError("server", "Chess.com sent a reply ChessPath could not read. Try again in a minute.");
      }
    }
    if (res.status === 404) throw new CcError("not-found", `Chess.com has no player called “${username}”. Check the spelling: it is the name in your profile link, chess.com/member/your-name.`);
    if (res.status === 429 && attempt < 2) {
      // Too many requests: wait and retry (at most twice).
      await sleep(4000 * (attempt + 1));
      continue;
    }
    if (res.status === 429) throw new CcError("rate-limited", "Chess.com is asking us to slow down. Wait a minute and try again.");
    if (res.status === 403) throw new CcError("blocked", "Chess.com refused the request from this network. Try again later, or from another connection.");
    throw new CcError("server", `Chess.com returned an error (${res.status}). Try again in a minute.`);
  }
}

export interface FetchProgress {
  monthsDone: number;
  monthsTotal: number;
  games: number;
}

const STANDARD_START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq";

/** Standard chess from the normal starting position (no variants such as Chess960). */
export function isStandardGame(g: RawCcGame): boolean {
  return g.rules === "chess" && Boolean(g.pgn) && (!g.initial_setup || g.initial_setup.startsWith(STANDARD_START));
}

/**
 * Fetch a player's most recent standard games, newest first. Months are downloaded one at a
 * time, newest first, stopping as soon as `limit` games have been collected. Variants do not
 * count towards the limit; `skipped` says how many were left out.
 */
export async function fetchRecentGames(username: string, limit: number, deps: FetchDeps = {}, onProgress?: (p: FetchProgress) => void): Promise<{ games: RawCcGame[]; skipped: number }> {
  const sleep = deps.sleep ?? defaultSleep;
  const name = normaliseUsername(username);
  if (!name) throw new CcError("invalid-username", "That does not look like a Chess.com username. Use letters, numbers, - and _ only.");
  const { archives } = await getJson<{ archives?: string[] }>(`${BASE}/player/${name}/games/archives`, deps, name);
  // Only follow links of the expected shape on the expected host.
  const months = (archives ?? []).filter((u) => new RegExp(`^${BASE}/player/[^/]+/games/\\d{4}/\\d{2}$`, "i").test(u)).reverse();
  const out: RawCcGame[] = [];
  let skipped = 0;
  for (let i = 0; i < months.length && out.length < limit; i++) {
    if (i > 0) await sleep(PAUSE_MS);
    const { games } = await getJson<{ games?: RawCcGame[] }>(months[i], deps, name);
    const sorted = [...(games ?? [])].sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0));
    for (const g of sorted) {
      if (out.length >= limit) break;
      if (isStandardGame(g)) out.push(g);
      else skipped++;
    }
    onProgress?.({ monthsDone: i + 1, monthsTotal: months.length, games: out.length });
  }
  return { games: out, skipped };
}
