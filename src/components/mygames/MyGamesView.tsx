"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Cpu, ExternalLink, RefreshCw, Search, Square, Trash2 } from "lucide-react";
import { MiniBoard } from "@/components/board/MiniBoard";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Badge, Callout, Card, Dialog, PageHeader, PageSkeleton, ProgressBar, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useAnalyses, useGames, useKv } from "@/hooks/data";
import { useEngine } from "@/hooks/useEngine";
import { loadOpeningIndex } from "@/lib/analysis/openingIndex";
import { runAnalysis } from "@/lib/analysis/runner";
import { CcError, fetchRecentGames, normaliseUsername } from "@/lib/chesscom/api";
import { buildFindings, engineStats, summarise, type AnalysedGame, type Finding, type FindingExample, type Tally } from "@/lib/chesscom/insights";
import { toCcGames } from "@/lib/chesscom/parse";
import { CC_KEY, clearImport, recordId, saveImport, toGameRecord } from "@/lib/chesscom/store";
import type { CcEnd, CcGame, CcImport } from "@/lib/chesscom/types";
import { getDb } from "@/lib/db/db";
import { saveAnalysis, saveGame } from "@/lib/db/repo";
import { EngineError } from "@/lib/engine/client";
import { cn, formatDate } from "@/lib/util";

/** Depth of the first pass. Possible mistakes are re-checked at depth 18 before they are reported. */
const SCAN_DEPTH = 10;
/** Games shorter than this are not worth an engine pass. */
const MIN_SCAN_PLIES = 16;

const END_TEXT: Record<CcEnd, string> = {
  checkmate: "Checkmate",
  resignation: "Resignation",
  timeout: "On time",
  abandoned: "Abandoned",
  stalemate: "Stalemate",
  repetition: "Repetition",
  agreed: "Agreed draw",
  insufficient: "Insufficient material",
  "fifty-move": "Fifty-move rule",
  "timeout-draw": "Time out vs insufficient material",
  other: "Other",
};

type Phase = { kind: "idle" } | { kind: "fetching"; text: string } | { kind: "error"; text: string };

export function MyGamesView() {
  const imp = useKv<CcImport>(CC_KEY);
  const analyses = useAnalyses();
  const saved = useGames();
  const toast = useToast();
  const router = useRouter();
  const { engine } = useEngine(false);

  const [name, setName] = useState("");
  const [count, setCount] = useState("100");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [confirmRemove, setConfirmRemove] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const [scanCount, setScanCount] = useState("5");
  const [scan, setScan] = useState<{ game: number; of: number; done: number; total: number; opp: string } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const [shown, setShown] = useState(10);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      cancelRef.current = true;
      engine.cancelAll();
    },
    [engine],
  );

  const analysed: AnalysedGame[] = useMemo(() => {
    if (!imp || !analyses) return [];
    const byId = new Map(analyses.filter((a) => a.complete).map((a) => [a.gameId, a]));
    return imp.games.flatMap((game) => {
      const analysis = byId.get(recordId(game));
      return analysis ? [{ game, analysis }] : [];
    });
  }, [imp, analyses]);
  const analysedIds = useMemo(() => new Set(analysed.map((a) => a.game.id)), [analysed]);
  const summary = useMemo(() => (imp?.games.length ? summarise(imp.games) : null), [imp]);
  const findings = useMemo(() => (imp?.games.length ? buildFindings(imp.games, analysed) : []), [imp, analysed]);
  const eng = useMemo(() => (analysed.length ? engineStats(analysed).stats : null), [analysed]);

  if (imp === undefined || analyses === undefined || saved === undefined) return <PageSkeleton />;

  const find = async (rawName: string) => {
    const username = normaliseUsername(rawName);
    if (!username) {
      setPhase({ kind: "error", text: "That does not look like a Chess.com username. Use the name from your profile link (letters, numbers, - and _)." });
      return;
    }
    const limit = Number(count);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase({ kind: "fetching", text: "Asking Chess.com for your games…" });
    try {
      const { games: raws, skipped: variants } = await fetchRecentGames(username, limit, { signal: ctrl.signal }, (p) =>
        setPhase({ kind: "fetching", text: `Downloading: ${p.games} game${p.games === 1 ? "" : "s"} so far (month ${p.monthsDone} of up to ${p.monthsTotal})…` }),
      );
      setPhase({ kind: "fetching", text: `Reading ${raws.length} games…` });
      const index = await loadOpeningIndex().catch(() => null);
      const { games, skipped } = await toCcGames(raws, username, index, (done) => setPhase({ kind: "fetching", text: `Reading games: ${done} of ${raws.length}…` }));
      if (ctrl.signal.aborted) return;
      if (games.length === 0) {
        setPhase({ kind: "error", text: `No standard chess games were found for “${username}”. The account exists, but it has no finished public games ChessPath can read.` });
        return;
      }
      await saveImport({ username, fetchedAt: Date.now(), requested: limit, skipped: skipped + variants, games });
      setPhase({ kind: "idle" });
      setName("");
      setShown(10);
      toast(`Found ${games.length} game${games.length === 1 ? "" : "s"}.`, { tone: "success" });
    } catch (e) {
      if (e instanceof CcError && e.kind === "cancelled") setPhase({ kind: "idle" });
      else setPhase({ kind: "error", text: e instanceof CcError ? e.message : "Something went wrong while reading your games. Try again." });
    } finally {
      abortRef.current = null;
    }
  };

  const ensureRecord = async (g: CcGame) => {
    const existing = await getDb().games.get(recordId(g));
    if (existing) return existing;
    const rec = toGameRecord(g);
    await saveGame(rec);
    return rec;
  };

  const open = async (g: CcGame, ply?: number) => {
    await ensureRecord(g);
    router.push(`/analysis/?game=${encodeURIComponent(recordId(g))}${ply ? `&ply=${ply}` : ""}`);
  };

  const pending = (imp?.games ?? []).filter((g) => g.plies >= MIN_SCAN_PLIES && !analysedIds.has(g.id));

  const startScan = async () => {
    const targets = pending.slice(0, Number(scanCount));
    if (!targets.length) return;
    cancelRef.current = false;
    setScanError(null);
    try {
      for (const [i, g] of targets.entries()) {
        if (cancelRef.current) break;
        setScan({ game: i + 1, of: targets.length, done: 0, total: g.plies + 1, opp: g.oppName });
        const game = await ensureRecord(g);
        const existing = (await getDb().analyses.get(game.id)) ?? null;
        await runAnalysis({
          game,
          engine,
          depth: SCAN_DEPTH,
          existing,
          save: saveAnalysis,
          isCancelled: () => cancelRef.current,
          onProgress: (done, total) => setScan({ game: i + 1, of: targets.length, done, total, opp: g.oppName }),
        });
      }
    } catch (e) {
      if (!(e instanceof EngineError && e.kind === "cancelled")) setScanError(e instanceof Error ? e.message : "The engine stopped unexpectedly. Try again.");
    } finally {
      setScan(null);
    }
  };

  const stopScan = () => {
    cancelRef.current = true;
    engine.cancelAll();
  };

  const fetching = phase.kind === "fetching";

  return (
    <div>
      <PageHeader eyebrow="My games" title="Learn from your Chess.com games" description="Enter your Chess.com username. ChessPath reads your recent public games, finds the patterns that cost you points, and points you to the lessons and puzzles that fix them." />

      <Card className="p-5">
        {imp ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1 basis-64">
              <h2 className="t-card break-words">{imp.username} on Chess.com</h2>
              <p className="t-small mt-0.5 text-muted">
                {imp.games.length} game{imp.games.length === 1 ? "" : "s"}
                {summary?.from ? ` from ${formatDate(summary.from)} to ${formatDate(summary.to)}` : ""} · downloaded {formatDate(imp.fetchedAt)}
                {imp.skipped > 0 ? ` · ${imp.skipped} left out (variants or unreadable)` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" loading={fetching} disabled={Boolean(scan)} onClick={() => find(imp.username)} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
                Get new games
              </Button>
              <Button variant="ghost" size="sm" disabled={fetching || Boolean(scan)} onClick={() => setConfirmRemove(true)} icon={<Trash2 className="h-4 w-4" aria-hidden />}>
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void find(name);
            }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
              <div className="min-w-0">
                <label htmlFor="cc-username" className="t-label text-muted">
                  Chess.com username
                </label>
                <input
                  id="cc-username"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (phase.kind === "error") setPhase({ kind: "idle" });
                  }}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="for example: magnuscarlsen"
                  aria-invalid={phase.kind === "error"}
                  aria-describedby={phase.kind === "error" ? "cc-error" : "cc-help"}
                  className="t-body mt-1 w-full rounded-[var(--radius-md)] border border-border-strong bg-surface px-3 py-2 text-fg"
                />
              </div>
              <Select label="How many games" value={count} onChange={setCount} options={[{ value: "50", label: "Last 50 games" }, { value: "100", label: "Last 100 games" }, { value: "200", label: "Last 200 games" }, { value: "300", label: "Last 300 games" }]} />
              <Button type="submit" loading={fetching} disabled={!name.trim()} icon={<Search className="h-4 w-4" aria-hidden />}>
                Find my games
              </Button>
            </div>
            <p id="cc-help" className="t-small mt-3 text-muted">
              No password is needed: ChessPath only reads games that are already public. Your browser asks Chess.com directly, and the games are stored on this device only.{" "}
              <Link href="/privacy/" className="underline hover:text-fg">
                Privacy
              </Link>
            </p>
          </form>
        )}
        {fetching && (
          <div className="mt-3 flex flex-wrap items-center gap-3" role="status" aria-live="polite">
            <p className="t-small text-muted">{phase.text}</p>
            <Button variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>
              Cancel
            </Button>
          </div>
        )}
        {phase.kind === "error" && (
          <p id="cc-error" role="alert" className="t-small mt-3 rounded-[var(--radius-md)] bg-danger-soft p-3 text-danger">
            {phase.text}
          </p>
        )}
      </Card>

      {!imp && (
        <Card className="mt-6 p-5">
          <h2 className="t-card">What you will get</h2>
          <ul className="t-small mt-2 list-disc space-y-1.5 pl-5 text-muted">
            <li>Your results by colour, by time control and by opening.</li>
            <li>How your losses end: checkmate, resignation or the clock.</li>
            <li>A Stockfish check of your most recent games, on this device, to find the kinds of mistake you repeat.</li>
            <li>A short study plan: the lessons and puzzles in ChessPath that match those mistakes.</li>
          </ul>
          <p className="t-small mt-3 text-subtle">
            Have games from somewhere else? You can also <Link href="/analysis/" className="underline hover:text-fg">import a PGN file</Link> and analyse games one at a time.
          </p>
        </Card>
      )}

      {imp && summary && (
        <div className="mt-6 space-y-6">
          {/* ---------- Study plan ---------- */}
          <section aria-labelledby="plan-title">
            <h2 id="plan-title" className="t-section mb-1">
              What to work on
            </h2>
            <p className="t-small mb-3 text-muted">
              Most important first. Each point shows the numbers behind it.{" "}
              {analysed.length === 0 ? "So far this uses your results only: run the Stockfish check below to find the mistakes inside the games." : `${analysed.length} game${analysed.length === 1 ? " has" : "s have"} been checked with Stockfish.`}
            </p>
            {findings.length === 0 ? (
              <Callout tone="info" title="No clear pattern yet">
                <p className="t-small">
                  {analysed.length === 0
                    ? "Your results alone do not point at one weakness. Run the Stockfish check below: it looks inside the games for mistakes you repeat."
                    : "Nothing stood out strongly enough to report. Check more games, or carry on with your curriculum."}
                </p>
              </Callout>
            ) : (
              <ol className="space-y-3" data-testid="findings">
                {findings.map((f, i) => (
                  <FindingCard key={f.id} finding={f} rank={i + 1} games={imp.games} onOpen={open} />
                ))}
              </ol>
            )}
          </section>

          {/* ---------- Engine check ---------- */}
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <Cpu className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
              <div className="min-w-0 flex-1">
                <h2 className="t-card">Check your games with Stockfish</h2>
                <p className="t-small mt-1 text-muted">
                  Stockfish replays each game on this device and looks for mistakes. It starts with your newest games. Expect about a minute per game on a computer and several on a phone; keep this page open while it runs. Progress is saved after every game.
                </p>
              </div>
            </div>
            {eng && (
              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="engine-stats">
                <Stat label="Games checked" value={String(eng.games)} />
                <Stat label="Approx. accuracy" value={eng.accuracy !== null ? `${eng.accuracy}%` : "–"} />
                <Stat label="Blunders per game" value={(eng.blunders / eng.games).toFixed(1)} />
                <Stat label="Mistakes per game" value={(eng.mistakes / eng.games).toFixed(1)} />
              </dl>
            )}
            {scan ? (
              <div className="mt-4" role="status">
                <p className="t-small mb-1.5 font-medium text-fg">
                  Checking game {scan.game} of {scan.of}, against {scan.opp}
                </p>
                <ProgressBar label={`Progress through game ${scan.game}`} value={scan.done} max={scan.total} showValue />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button variant="secondary" size="sm" onClick={stopScan} icon={<Square className="h-4 w-4" aria-hidden />}>
                    Stop
                  </Button>
                  <p className="t-small text-muted">Stopping keeps everything checked so far.</p>
                </div>
              </div>
            ) : pending.length > 0 ? (
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div className="w-44">
                  <Select label="Games to check" value={scanCount} onChange={setScanCount} options={[{ value: "3", label: "Next 3 games" }, { value: "5", label: "Next 5 games" }, { value: "10", label: "Next 10 games" }, { value: "20", label: "Next 20 games" }]} />
                </div>
                <Button onClick={startScan} disabled={fetching} icon={<Cpu className="h-4 w-4" aria-hidden />}>
                  {analysed.length ? "Check more games" : "Start the check"}
                </Button>
                <p className="t-small text-muted">{pending.length} not checked yet.</p>
              </div>
            ) : (
              <p className="t-small mt-4 text-muted">All your downloaded games have been checked.</p>
            )}
            {scanError && (
              <p role="alert" className="t-small mt-3 rounded-[var(--radius-md)] bg-danger-soft p-3 text-danger">
                {scanError}
              </p>
            )}
            <p className="t-small mt-3 text-subtle">
              Stockfish 19 (lite), depth {SCAN_DEPTH}, with possible mistakes re-checked at depth 18 before they are counted. An engine can still misjudge a position, and a handful of games is a small sample: treat this as guidance.
            </p>
          </Card>

          {/* ---------- Results ---------- */}
          <section aria-labelledby="results-title">
            <h2 id="results-title" className="t-section mb-3">
              Your results
            </h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <h3 className="t-card">Score</h3>
                <table className="t-small mt-3 w-full">
                  <thead>
                    <tr className="text-left text-muted">
                      <th scope="col" className="pb-1 font-medium"></th>
                      <th scope="col" className="pb-1 pl-3 text-right font-medium">Games</th>
                      <th scope="col" className="pb-1 pl-3 text-right font-medium">Won</th>
                      <th scope="col" className="pb-1 pl-3 text-right font-medium">Drawn</th>
                      <th scope="col" className="pb-1 pl-3 text-right font-medium">Lost</th>
                      <th scope="col" className="pb-1 pl-3 text-right font-medium">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <TallyRow label="All games" t={summary.total} strong />
                    <TallyRow label="As White" t={summary.white} />
                    <TallyRow label="As Black" t={summary.black} />
                    {summary.timeClasses.map((c) => (
                      <TallyRow key={c.key} label={`${c.key.charAt(0).toUpperCase()}${c.key.slice(1)}${c.rating ? ` (rated ${c.rating})` : ""}`} t={c.tally} />
                    ))}
                  </tbody>
                </table>
                <p className="t-small mt-3 text-subtle">Score counts a win as 1 and a draw as ½.</p>
              </Card>
              <Card className="p-5">
                <h3 className="t-card">How your games ended</h3>
                <EndList title={`Losses (${summary.total.losses})`} ends={summary.lossEnds} total={summary.total.losses} />
                <EndList title={`Wins (${summary.total.wins})`} ends={summary.winEnds} total={summary.total.wins} />
                {summary.total.draws > 0 && <EndList title={`Draws (${summary.total.draws})`} ends={summary.drawEnds} total={summary.total.draws} />}
              </Card>
              <Card className="p-5 lg:col-span-2">
                <h3 className="t-card">Your openings</h3>
                {summary.openings.length === 0 ? (
                  <p className="t-small mt-2 text-muted">No named openings were recognised in these games.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
                    {(["w", "b"] as const).map((c) => (
                      <div key={c} className="min-w-0">
                        <h4 className="t-label mt-3 text-muted">As {c === "w" ? "White" : "Black"}</h4>
                        <ul className="mt-1 divide-y divide-border">
                          {summary.openings
                            .filter((o) => o.color === c)
                            .slice(0, 6)
                            .map((o) => (
                              <li key={o.family} className="flex items-baseline gap-3 py-1.5">
                                <span className="t-small min-w-0 flex-1 break-words text-fg">
                                  {o.course ? (
                                    <Link href={`/openings/${o.course}/`} className="underline decoration-border-strong underline-offset-2 hover:text-accent">
                                      {o.family}
                                    </Link>
                                  ) : (
                                    o.family
                                  )}
                                </span>
                                <span className="t-small shrink-0 text-muted">
                                  {o.tally.games} game{o.tally.games === 1 ? "" : "s"} · {o.tally.score}%
                                </span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
                <p className="t-small mt-3 text-subtle">Linked openings have a course in ChessPath. With only a few games, a score says little: look at the ones you play most.</p>
              </Card>
            </div>
          </section>

          {/* ---------- Game list ---------- */}
          <section aria-labelledby="games-title">
            <h2 id="games-title" className="t-section mb-3">
              Your games
            </h2>
            <Card className="p-2 sm:p-3">
              <ul className="divide-y divide-border" data-testid="cc-games">
                {imp.games.slice(0, shown).map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-2 py-2.5">
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="t-body break-words font-medium text-fg">
                        {g.userColor === "w" ? "White" : "Black"} against {g.oppName}
                        {g.oppRating ? <span className="font-normal text-muted"> ({g.oppRating})</span> : null}
                      </p>
                      <p className="t-small break-words text-muted">
                        {g.opening ? `${g.opening.name} · ` : ""}
                        {Math.ceil(g.plies / 2)} moves · {g.timeClass} · {g.endedAt ? formatDate(g.endedAt) : "date unknown"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={g.outcome === "win" ? "success" : g.outcome === "loss" ? "danger" : "neutral"}>
                        {g.outcome === "win" ? "Won" : g.outcome === "loss" ? "Lost" : "Draw"} · {END_TEXT[g.end].toLowerCase()}
                      </Badge>
                      {analysedIds.has(g.id) && <Badge tone="info">Checked</Badge>}
                      <Button variant="secondary" size="sm" onClick={() => open(g)} aria-label={`Review the game against ${g.oppName}`}>
                        Review
                      </Button>
                      {g.url && (
                        <a href={g.url} target="_blank" rel="noopener noreferrer" className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] text-muted hover:bg-surface-2 hover:text-fg" aria-label={`Open the game against ${g.oppName} on Chess.com`}>
                          <ExternalLink className="h-4 w-4" aria-hidden />
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {imp.games.length > shown && (
                <div className="p-2">
                  <Button variant="ghost" size="sm" onClick={() => setShown((s) => s + 25)}>
                    Show more ({imp.games.length - shown} left)
                  </Button>
                </div>
              )}
            </Card>
          </section>
        </div>
      )}

      <Dialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title="Remove these games?"
        description="The downloaded game list and its statistics will be removed from this device. Games you already reviewed stay in your saved games."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmRemove(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await clearImport();
                setConfirmRemove(false);
                toast("Games removed.");
              }}
            >
              Remove
            </Button>
          </>
        }
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-surface-2 p-3">
      <dt className="t-small text-muted">{label}</dt>
      <dd className="t-card mt-0.5 text-fg">{value}</dd>
    </div>
  );
}

function TallyRow({ label, t, strong }: { label: string; t: Tally; strong?: boolean }) {
  if (t.games === 0) return null;
  return (
    <tr className={cn(strong && "font-semibold text-fg")}>
      <th scope="row" className={cn("py-1.5 pr-2 text-left", strong ? "font-semibold" : "font-normal")}>
        {label}
      </th>
      <td className="py-1.5 pl-3 text-right tabular-nums">{t.games}</td>
      <td className="py-1.5 pl-3 text-right tabular-nums">{t.wins}</td>
      <td className="py-1.5 pl-3 text-right tabular-nums">{t.draws}</td>
      <td className="py-1.5 pl-3 text-right tabular-nums">{t.losses}</td>
      <td className="py-1.5 pl-3 text-right tabular-nums">{t.score}%</td>
    </tr>
  );
}

function EndList({ title, ends, total }: { title: string; ends: Partial<Record<CcEnd, number>>; total: number }) {
  const rows = (Object.entries(ends) as [CcEnd, number][]).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return null;
  return (
    <div className="mt-3">
      <h4 className="t-label text-muted">{title}</h4>
      <ul className="mt-1 space-y-1.5">
        {rows.map(([end, count]) => (
          <li key={end}>
            <div className="t-small flex justify-between gap-3">
              <span className="text-fg">{END_TEXT[end]}</span>
              <span className="tabular-nums text-muted">
                {count} · {Math.round((count / total) * 100)}%
              </span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <div className="h-full rounded-full bg-accent" style={{ width: `${(count / total) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FindingCard({ finding: f, rank, games, onOpen }: { finding: Finding; rank: number; games: CcGame[]; onOpen: (g: CcGame, ply?: number) => void }) {
  return (
    <Card as="li" className="p-5">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-sm font-semibold text-on-brand" aria-hidden>
          {rank}
        </span>
        <h3 className="t-card min-w-0 flex-1 basis-40 break-words">{f.title}</h3>
        <Badge tone={f.source === "engine" ? "accent" : "neutral"}>{f.source === "engine" ? "Found by Stockfish" : "From your results"}</Badge>
      </div>
      <p className="t-small mt-2 text-fg">{f.evidence}</p>
      <p className="t-small mt-1 text-muted">{f.advice}</p>
      {f.examples.length > 0 && (
        <div className="mt-3">
          <h4 className="t-label text-muted">From your own games</h4>
          <ul className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {f.examples.map((e) => (
              <ExampleCard key={`${e.gameId}-${e.ply}`} example={e} onOpen={() => {
                const g = games.find((x) => x.id === e.gameId);
                if (g) onOpen(g, e.ply);
              }} />
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {f.actions.map((a, i) => (
          <ButtonLink key={a.href + a.label} href={a.href} variant={i === 0 ? "primary" : "secondary"} size="sm" icon={i === 0 ? <ArrowRight className="h-4 w-4" aria-hidden /> : undefined}>
            {a.label}
          </ButtonLink>
        ))}
      </div>
    </Card>
  );
}

function ExampleCard({ example: e, onOpen }: { example: FindingExample; onOpen: () => void }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <li className="flex gap-3 rounded-[var(--radius-md)] border border-border p-3">
      <div className="w-24 shrink-0">
        <MiniBoard fen={e.fen} orientation={e.orientation} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="t-small break-words text-fg">
          {e.orientation === "w" ? "White" : "Black"} to move. You played <span className="t-notation font-semibold">{e.played}</span>.
        </p>
        <p className="t-small mt-0.5 break-words text-muted">{e.label.replace(/^.*? against /, "Against ")}</p>
        {revealed ? (
          <p className="t-small mt-1 text-fg" aria-live="polite">
            Stockfish preferred <span className="t-notation font-semibold">{e.better}</span>.
          </p>
        ) : (
          <p className="t-small mt-1 text-muted">Can you find something better?</p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {!revealed && (
            <Button variant="secondary" size="sm" onClick={() => setRevealed(true)}>
              Show the better move
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onOpen}>
            Open the game
          </Button>
        </div>
      </div>
    </li>
  );
}
