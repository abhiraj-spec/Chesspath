/** Lazily loaded ECO index (Lichess chess-openings, CC0) keyed by FEN without move counters. */
type Entry = [eco: string, name: string, ply: number];
let cache: Record<string, Entry> | null = null;

export async function loadOpeningIndex(): Promise<Record<string, Entry>> {
  if (!cache) cache = (await import("@/content/openings/eco-index.json")).default as unknown as Record<string, Entry>;
  return cache;
}

export function positionKey(fen: string) {
  return fen.split(" ").slice(0, 4).join(" ");
}

/** Deepest named opening position reached in a sequence of FENs (after each ply). */
export function identifyOpening(index: Record<string, Entry>, fens: string[]): { eco: string; name: string; ply: number; bookPlies: number } | undefined {
  let found: { eco: string; name: string; ply: number } | undefined;
  let bookPlies = 0;
  let stillBook = true;
  fens.forEach((f, i) => {
    const e = index[positionKey(f)];
    if (e) {
      found = { eco: e[0], name: e[1], ply: i + 1 };
      if (stillBook) bookPlies = i + 1;
    } else {
      // Transpositions back into theory are still named, but "book" moves must be consecutive.
      stillBook = false;
    }
  });
  return found ? { ...found, bookPlies } : undefined;
}
