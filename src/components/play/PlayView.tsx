"use client";

import { ActionDock } from "@/components/ui/ActionDock";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { AlertTriangle, Download, Flag, FlipVertical2, Handshake, Loader2, Microscope, Plus, RotateCcw, Swords, Undo2, BookOpen, Copy } from "lucide-react";
import { Chessboard, type BoardMove } from "@/components/board/Chessboard";
import { PanelCard, TrainerLayout } from "@/components/board/TrainerLayout";
import { CapturedRow, MoveList, useMoveKeys } from "@/components/board/MoveList";
import { Button, ButtonLink, IconButton } from "@/components/ui/Button";
import { Callout, Card, Dialog, PageHeader, PageSkeleton, Segmented } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useEngine } from "@/hooks/useEngine";
import { useActivityTimer } from "@/hooks/useActivityTimer";
import { LEVELS, chooseMove, levelConfig } from "@/lib/engine/strength";
import { EngineError } from "@/lib/engine/client";
import { buildLine, createLineCache, fenAt, type Line } from "@/lib/chess/line";
import { CopyFenButton } from "@/components/board/CopyFenButton";
import { describeResult, lineStatus, type GameResult, type TerminalReason } from "@/lib/chess/status";
import { pgnFromLine, toPgn } from "@/lib/chess/pgn";
import { colorName, moveToUci, START_FEN } from "@/lib/chess/core";
import { getGame, kvDelete, kvGet, kvSet, logEvent, saveGame } from "@/lib/db/repo";
import type { ChessGameRecord } from "@/lib/db/types";
import { useSettings, updateSettings } from "@/lib/settings";
import { playMoveSound, playSound } from "@/lib/sound";
import { downloadText, uid } from "@/lib/util";
import { scoreToNumber } from "@/lib/engine/uci";
import { MoveInput } from "@/components/board/MoveInput";
// Shared by this screen: each new move costs one move of work instead of a full replay.
const playLine = createLineCache();
/** Longest the computer may think about one move. */
const COMPUTER_MAX_THINK_MS = 3000;

const ACTIVE_KEY = "play:active";

interface GameState {
  id: string;
  moves: string[];
  userColor: "w" | "b";
  level: number;
  status: "in-progress" | "finished";
  result: GameResult;
  reason?: TerminalReason;
  takebacks: number;
  createdAt: number;
}

export function PlayView() {
  const settings = useSettings();
  const router = useRouter();
  const toast = useToast();
  const { engine, status: engineStatus, restart } = useEngine();
  const [loaded, setLoaded] = useState(false);
  const [game, setGame] = useState<GameState | null>(null);
  const [cursor, setCursor] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<"w" | "b">("w");
  const [confirm, setConfirm] = useState<null | "resign" | "new">(null);
  const [drawMsg, setDrawMsg] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ color: "w" | "b" | "random"; level: number }>({ color: "w", level: settings.defaultDifficulty });
  const gen = useRef(0);

  useActivityTimer("game", game?.id, Boolean(game && game.status === "in-progress"));

  // Resume an unfinished game after a reload.
  useEffect(() => {
    void (async () => {
      try {
        const id = await kvGet<string>(ACTIVE_KEY);
        const rec = id ? await getGame(id) : undefined;
        if (rec && rec.status === "in-progress" && rec.computer) {
          const { line, error } = buildLine(rec.startingFen, rec.moves);
          const moves = error ? line.plies.map((p) => p.uci) : rec.moves;
          setGame({ id: rec.id, moves, userColor: rec.computer.userColor, level: rec.computer.level, status: "in-progress", result: "*", takebacks: rec.takebacks ?? 0, createdAt: rec.createdAt });
          setCursor(moves.length);
          setOrientation(settings.orientation === "white" ? "w" : rec.computer.userColor);
        }
      } catch {
        /* start fresh */
      }
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => engine.cancelAll(), [engine]);

  const line: Line = useMemo(() => playLine(START_FEN, game?.moves ?? []), [game?.moves]);
  const liveFen = fenAt(line, line.plies.length);
  const viewing = cursor < line.plies.length;
  const shownFen = fenAt(line, cursor);
  const lastPly = cursor > 0 ? line.plies[cursor - 1] : undefined;
  const turn = liveFen.split(" ")[1] as "w" | "b";

  const persist = useCallback(async (g: GameState) => {
    const l = playLine(START_FEN, g.moves);
    const cfg = levelConfig(g.level);
    const white = g.userColor === "w" ? "You" : `Stockfish (${cfg.name})`;
    const black = g.userColor === "b" ? "You" : `Stockfish (${cfg.name})`;
    const rec: ChessGameRecord = {
      id: g.id,
      whitePlayer: white,
      blackPlayer: black,
      result: g.result,
      terminalReason: g.reason,
      status: g.status,
      pgn: pgnFromLine(l, { result: g.result, headers: { White: white, Black: black, Event: "ChessPath game vs computer", Termination: g.reason ? describeResult(g.result, g.reason) : undefined } }),
      startingFen: START_FEN,
      moves: g.moves,
      createdAt: g.createdAt,
      updatedAt: Date.now(),
      source: "computer",
      computer: { level: g.level, userColor: g.userColor },
      analysisStatus: "none",
      takebacks: g.takebacks,
    };
    await saveGame(rec);
  }, []);

  const finish = useCallback(
    async (g: GameState, result: GameResult, reason: TerminalReason) => {
      const done: GameState = { ...g, status: "finished", result, reason };
      // Invalidate any computer move still pending (e.g. during its short "thinking" pause),
      // so it cannot be played after a resignation or agreed draw and reopen the game.
      gen.current++;
      setGame(done);
      engine.cancelAll();
      setThinking(false);
      playSound("end");
      await persist(done).catch(() => {});
      await kvDelete(ACTIVE_KEY).catch(() => {});
      await logEvent("game_completed", g.id, { result, reason, level: g.level });
    },
    [engine, persist],
  );

  const applyMove = useCallback(
    async (g: GameState, uci: string): Promise<GameState | null> => {
      const l = playLine(START_FEN, g.moves);
      const c = new Chess(fenAt(l, l.plies.length));
      let m;
      try {
        m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      } catch {
        return null;
      }
      playMoveSound(m.san);
      const next: GameState = { ...g, moves: [...g.moves, moveToUci(m)] };
      const st = lineStatus(playLine(START_FEN, next.moves));
      setGame(next);
      setCursor(next.moves.length);
      if (st.over) {
        await finish(next, st.result, st.reason!);
        return null;
      }
      await persist(next).catch(() => {});
      return next;
    },
    [finish, persist],
  );

  // Ask Stockfish for a move whenever it is the computer's turn.
  const requestEngineMove = useCallback(
    async (g: GameState) => {
      const myGen = ++gen.current;
      setThinking(true);
      setEngineError(null);
      const started = Date.now();
      try {
        const l = playLine(START_FEN, g.moves);
        const fen = fenAt(l, l.plies.length);
        const cfg = levelConfig(g.level);
        // The time cap only matters on slow phones: elsewhere the depth is reached well before it.
        const res = await engine.analyse({ fen, depth: cfg.depth, multipv: cfg.multipv, movetimeMs: COMPUTER_MAX_THINK_MS });
        if (myGen !== gen.current) return; // stale: position changed (undo, new game)
        const legal = new Chess(fen).moves({ verbose: true }).map((m) => moveToUci(m));
        const choice = chooseMove(res.lines, legal, cfg, fen.split(" ")[1] as "w" | "b");
        const wait = Math.max(0, 350 - (Date.now() - started));
        await new Promise((r) => setTimeout(r, wait));
        if (myGen !== gen.current) return;
        await applyMove(g, choice.move);
      } catch (e) {
        if (myGen !== gen.current) return;
        if (e instanceof EngineError && e.kind === "cancelled") return;
        setEngineError(e instanceof Error ? e.message : "The engine did not respond.");
      } finally {
        if (myGen === gen.current) setThinking(false);
      }
    },
    [engine, applyMove],
  );

  useEffect(() => {
    if (!game || game.status !== "in-progress" || thinking || engineError) return;
    if (turn === game.userColor) return;
    // Deferred so state updates happen outside the effect body; cleared if the game changes first.
    const t = setTimeout(() => void requestEngineMove(game), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, turn]);

  const onUserMove = async (mv: BoardMove) => {
    if (!game || game.status !== "in-progress" || thinking || viewing || turn !== game.userColor) return;
    await applyMove(game, `${mv.from}${mv.to}${mv.promotion ?? ""}`);
  };

  const startGame = async () => {
    gen.current++;
    engine.cancelAll();
    engine.newGame();
    const color = setup.color === "random" ? (Math.random() < 0.5 ? "w" : "b") : setup.color;
    const g: GameState = { id: uid("g_"), moves: [], userColor: color, level: setup.level, status: "in-progress", result: "*", takebacks: 0, createdAt: Date.now() };
    updateSettings({ defaultDifficulty: setup.level as 1 | 2 | 3 | 4 | 5 });
    setGame(g);
    setCursor(0);
    setEngineError(null);
    setDrawMsg(null);
    setOrientation(settings.orientation === "white" ? "w" : color);
    await persist(g).catch(() => {});
    await kvSet(ACTIVE_KEY, g.id).catch(() => {});
  };

  const undo = async () => {
    if (!game || game.status !== "in-progress" || game.moves.length === 0) return;
    gen.current++;
    engine.cancelAll();
    setThinking(false);
    const l = playLine(START_FEN, game.moves);
    // Remove moves back to the user's previous turn.
    let n = game.moves.length;
    const lastColor = l.plies[n - 1].color;
    n -= lastColor === game.userColor ? 1 : 2;
    if (n < 0) return;
    if (n === game.moves.length) return;
    const g = { ...game, moves: game.moves.slice(0, Math.max(0, n)), takebacks: game.takebacks + 1 };
    setGame(g);
    setCursor(g.moves.length);
    setEngineError(null);
    await persist(g).catch(() => {});
  };

  const resign = async () => {
    if (!game) return;
    setConfirm(null);
    await finish(game, game.userColor === "w" ? "0-1" : "1-0", "resignation");
  };

  const offerDraw = async () => {
    if (!game || thinking) return;
    if (game.moves.length < 20) {
      setDrawMsg("Stockfish declines: draw offers are considered after move 10.");
      return;
    }
    setDrawMsg("Stockfish is considering your offer…");
    try {
      const res = await engine.analyse({ fen: liveFen, depth: 12 });
      const v = scoreToNumber(res.lines[0]?.score ?? { cp: 0 }) * (game.userColor === "w" ? -1 : 1); // computer's POV
      if (v <= 30) {
        setDrawMsg(null);
        await finish(game, "1/2-1/2", "agreement");
      } else {
        setDrawMsg(`Stockfish declines: it evaluates the position as better for itself (${(v / 100).toFixed(1)} pawns at depth ${res.depth}).`);
      }
    } catch {
      setDrawMsg("The engine could not evaluate the offer. Try again.");
    }
  };

  const retryEngine = async () => {
    setEngineError(null);
    await restart();
    if (game && game.status === "in-progress" && turn !== game.userColor) void requestEngineMove(game);
  };

  const exportPgn = () => {
    if (!game) return;
    const cfg = levelConfig(game.level);
    const white = game.userColor === "w" ? "You" : `Stockfish (${cfg.name})`;
    const black = game.userColor === "b" ? "You" : `Stockfish (${cfg.name})`;
    const pgn = toPgn({ startFen: START_FEN, moves: game.moves, result: game.result, headers: { White: white, Black: black, Event: "ChessPath game vs computer" } });
    downloadText(`chesspath-${new Date(game.createdAt).toISOString().slice(0, 10)}.pgn`, pgn, "application/x-chess-pgn");
  };
  const copyPgn = async () => {
    if (!game) return;
    try {
      await navigator.clipboard.writeText(toPgn({ startFen: START_FEN, moves: game.moves, result: game.result }));
      toast("PGN copied to the clipboard.", { tone: "success" });
    } catch {
      toast("Copying is not available here. Use Download instead.", { tone: "error" });
    }
  };

  useMoveKeys(Boolean(game), cursor, line.plies.length, setCursor);

  if (!loaded) return <PageSkeleton />;

  // ---------- Setup ----------
  if (!game) {
    const cfg = levelConfig(setup.level);
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader eyebrow="Play" title="Play against the computer" description="Your opponent is Stockfish running on your device. Choose your side and a level, then start." />
        <Card className="p-5 sm:p-6">
          <h2 className="t-card">Your side</h2>
          <Segmented
            className="mt-2"
            label="Choose your side"
            value={setup.color}
            onChange={(v) => setSetup((s) => ({ ...s, color: v }))}
            options={[
              { value: "w", label: "White" },
              { value: "b", label: "Black" },
              { value: "random", label: "Random" },
            ]}
          />
          <h2 className="t-card mt-6">Difficulty</h2>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Difficulty">
            {LEVELS.map((l) => (
              <button
                key={l.level}
                type="button"
                role="radio"
                aria-checked={setup.level === l.level}
                onClick={() => setSetup((s) => ({ ...s, level: l.level }))}
                className={`rounded-[var(--radius-md)] border px-3 py-2.5 text-left text-[0.875rem] font-medium ${setup.level === l.level ? "border-accent bg-accent-soft text-accent-soft-fg" : "border-border bg-surface hover:border-border-strong"}`}
              >
                {l.name}
              </button>
            ))}
          </div>
          <p className="t-small mt-2 text-muted" aria-live="polite">
            {cfg.description}
          </p>
          <p className="t-small mt-1 text-subtle">Levels are descriptive. ChessPath doesn&apos;t assign Elo ratings to them.</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={startGame} icon={<Swords className="h-5 w-5" aria-hidden />}>
              Start game
            </Button>
            {engineStatus === "failed" && <span className="t-small text-danger">The engine failed to load. Starting a game will try again.</span>}
          </div>
        </Card>
      </div>
    );
  }

  // ---------- Game ----------
  const cfg = levelConfig(game.level);
  const over = game.status === "finished";
  const youWon = (game.result === "1-0" && game.userColor === "w") || (game.result === "0-1" && game.userColor === "b");
  const statusText = over
    ? describeResult(game.result, game.reason)
    : thinking
      ? "Stockfish is thinking…"
      : turn === game.userColor
        ? `Your move (${colorName(game.userColor)})`
        : "Waiting for Stockfish";
  const topColor = orientation === "w" ? "b" : "w";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="t-section">
          You ({colorName(game.userColor)}) vs Stockfish · {cfg.name}
        </h1>
        <Button variant="secondary" size="sm" onClick={() => (over ? setGame(null) : setConfirm("new"))} icon={<Plus className="h-4 w-4" aria-hidden />}>
          New game
        </Button>
      </div>
      <TrainerLayout
        board={
          <>
            <CapturedRow fen={shownFen} color={topColor} />
            <Chessboard
              fen={shownFen}
              orientation={orientation}
              movable={!over && !thinking && !viewing ? game.userColor : "none"}
              onMove={onUserMove}
              lastMove={lastPly ? { from: lastPly.from, to: lastPly.to } : null}
              label="Game board"
              testId="game-board"
            />
            <CapturedRow fen={shownFen} color={orientation} />
            {settings.moveTextInput && !over && !viewing && (
              <MoveInput fen={liveFen} disabled={thinking || turn !== game.userColor} onMove={(m) => void onUserMove(m)} />
            )}
          </>
        }
        panel={
          <PanelCard>
            <p className="flex items-center gap-2 t-body font-medium text-fg" aria-live="polite" data-testid="game-status">
              {thinking && <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden />}
              {statusText}
            </p>
            {viewing && (
              <p className="t-small mt-1 text-muted">
                Viewing move {cursor} of {line.plies.length}.{" "}
                <button type="button" className="font-medium text-accent underline" onClick={() => setCursor(line.plies.length)}>
                  Back to the current position
                </button>
              </p>
            )}
            {engineError && (
              <Callout tone="danger" className="mt-3" icon={<AlertTriangle className="h-5 w-5 text-danger" aria-hidden />} title="The engine stopped responding">
                <p className="t-small">{engineError} Your game is saved and nothing was changed.</p>
                <Button size="sm" className="mt-2" onClick={retryEngine}>
                  Restart engine and continue
                </Button>
              </Callout>
            )}
            {drawMsg && <Callout tone="info" className="mt-3">{drawMsg}</Callout>}

            {over && (
              <div className="animate-fade-in mt-3 rounded-[var(--radius-md)] border border-border bg-surface-2 p-4" data-testid="game-over">
                <p className="t-section">{game.result === "1/2-1/2" ? "Draw" : youWon ? "You won!" : "Stockfish won"}</p>
                <p className="t-small mt-1 text-muted">{describeResult(game.result, game.reason)}. The game is saved in your library.</p>
                <ActionDock dockOnly note={`${game.result === "1/2-1/2" ? "Draw" : youWon ? "You won!" : "Stockfish won"}: ${describeResult(game.result, game.reason)}.`}>
                  <ButtonLink href={`/analysis/?game=${game.id}`} size="lg" icon={<Microscope className="h-4 w-4" aria-hidden />}>
                    Review game
                  </ButtonLink>
                  <Button variant="secondary" size="lg" onClick={() => setGame(null)} icon={<RotateCcw className="h-4 w-4" aria-hidden />}>
                    Play again
                  </Button>
                </ActionDock>
                <div className="mt-3 grid grid-cols-1 gap-2 max-lg:hidden">
                  <ButtonLink href={`/analysis/?game=${game.id}`} icon={<Microscope className="h-4 w-4" aria-hidden />}>
                    Review this game
                  </ButtonLink>
                  <Button variant="secondary" onClick={() => setGame(null)} icon={<RotateCcw className="h-4 w-4" aria-hidden />}>
                    Play again
                  </Button>
                  <ButtonLink href="/learn/" variant="ghost" icon={<BookOpen className="h-4 w-4" aria-hidden />}>
                    Back to learning
                  </ButtonLink>
                </div>
                <p className="t-small mt-2 text-subtle">Review runs Stockfish over every move (about a minute) and explains the key moments.</p>
              </div>
            )}

            <MoveList line={line} cursor={cursor} onSelect={setCursor} className="mt-4" />

            <div className="mt-3 flex flex-wrap gap-2">
              {!over && (
                <>
                  <Button variant="secondary" size="sm" onClick={undo} disabled={game.moves.length === 0 || (game.moves.length === 1 && game.userColor === "b")} icon={<Undo2 className="h-4 w-4" aria-hidden />}>
                    Take back
                  </Button>
                  <Button variant="secondary" size="sm" onClick={offerDraw} disabled={thinking} icon={<Handshake className="h-4 w-4" aria-hidden />}>
                    Offer draw
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setConfirm("resign")} icon={<Flag className="h-4 w-4" aria-hidden />}>
                    Resign
                  </Button>
                </>
              )}
              <IconButton label="Flip board" size="sm" variant="secondary" onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}>
                <FlipVertical2 className="h-4 w-4" aria-hidden />
              </IconButton>
              <IconButton label="Download PGN" size="sm" variant="secondary" onClick={exportPgn}>
                <Download className="h-4 w-4" aria-hidden />
              </IconButton>
              <IconButton label="Copy PGN" size="sm" variant="secondary" onClick={copyPgn}>
                <Copy className="h-4 w-4" aria-hidden />
              </IconButton>
              <CopyFenButton fen={shownFen} variant="secondary" />
            </div>
            {game.takebacks > 0 && <p className="t-small mt-2 text-subtle">Takebacks used: {game.takebacks}</p>}
          </PanelCard>
        }
      />
      <Dialog
        open={confirm === "resign"}
        onClose={() => setConfirm(null)}
        title="Resign this game?"
        description="The game will be recorded as a loss. You can still review it afterwards."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Keep playing
            </Button>
            <Button variant="danger" onClick={resign}>
              Resign
            </Button>
          </>
        }
      />
      <Dialog
        open={confirm === "new"}
        onClose={() => setConfirm(null)}
        title="Leave this game?"
        description="The unfinished game stays in your library, but it won't be resumed automatically."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                setConfirm(null);
                gen.current++;
                engine.cancelAll();
                // The abandoned game stays in the library as unfinished.
                if (game) await persist({ ...game, status: "finished", result: "*" }).catch(() => {});
                await kvDelete(ACTIVE_KEY).catch(() => {});
                setGame(null);
                router.refresh();
              }}
            >
              New game
            </Button>
          </>
        }
      />
    </div>
  );
}
