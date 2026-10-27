"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Download, FileUp, Microscope, Trash2, Upload } from "lucide-react";
import { useGames } from "@/hooks/data";
import { parsePgn, splitPgn, toPgn } from "@/lib/chess/pgn";
import { deleteGame, saveGame } from "@/lib/db/repo";
import type { ChessGameRecord } from "@/lib/db/types";
import { Badge, Card, Dialog, EmptyState, PageHeader, Select, Skeleton } from "@/components/ui/primitives";
import { Button, ButtonLink, IconButton } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { downloadText, formatDate, uid } from "@/lib/util";
import { describeResult } from "@/lib/chess/status";
import { fenError, START_FEN } from "@/lib/chess/core";
import { useRouter } from "next/navigation";

const SAMPLE = `[Event "Example"]
[White "Morphy"]
[Black "Duke & Count"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

export function LibraryView() {
  const games = useGames();
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [side, setSide] = useState<"w" | "b" | "none">("w");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<ChessGameRecord | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fenText, setFenText] = useState("");
  const [fenErr, setFenErr] = useState<string | null>(null);

  const openFen = () => {
    const f = fenText.trim();
    if (!f) return;
    const err = fenError(f);
    if (err) {
      setFenErr(err);
      return;
    }
    router.push(`/analysis/?fen=${encodeURIComponent(f)}`);
  };

  const importText = async (raw: string) => {
    setErrors([]);
    const parts = splitPgn(raw);
    if (parts.length === 0) {
      setErrors(["Paste a game in PGN format, or choose a .pgn file."]);
      return;
    }
    setBusy(true);
    const errs: string[] = [];
    let firstId: string | null = null;
    let ok = 0;
    for (const [i, part] of parts.slice(0, 200).entries()) {
      const r = parsePgn(part);
      if (!r.ok) {
        errs.push(parts.length > 1 ? `Game ${i + 1}: ${r.error}` : r.error);
        continue;
      }
      const id = uid("imp_");
      firstId ??= id;
      const h = r.game.headers;
      await saveGame({
        id,
        whitePlayer: h.White && h.White !== "?" ? h.White : "White",
        blackPlayer: h.Black && h.Black !== "?" ? h.Black : "Black",
        result: r.game.result,
        status: "finished",
        pgn: toPgn({ startFen: r.game.startFen, moves: r.game.moves, result: r.game.result, headers: h }),
        startingFen: r.game.startFen,
        moves: r.game.moves,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        source: "import",
        analysisStatus: "none",
        headers: h,
        userColor: side === "none" ? undefined : side,
      });
      ok++;
    }
    setBusy(false);
    setErrors(errs);
    if (ok > 0) {
      setText("");
      toast(`Imported ${ok} game${ok === 1 ? "" : "s"}.`, { tone: "success" });
      if (ok === 1 && firstId && errs.length === 0) router.push(`/analysis/?game=${firstId}`);
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2_000_000) {
      setErrors(["That file is larger than 2 MB. Split it into smaller files."]);
      return;
    }
    await importText(await f.text());
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div>
      <PageHeader eyebrow="Analysis" title="Review games" description="Import a game or pick one you played here. Stockfish analyses it on your device and ChessPath explains the key moments in plain language." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="p-5">
          <h2 className="t-card">Import a game (PGN)</h2>
          <label htmlFor="pgn-input" className="t-small mt-1 block text-muted">
            Paste PGN text. You can export it from most chess sites.
          </label>
          <textarea
            id="pgn-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder={'[White "You"]\n[Black "Opponent"]\n\n1. e4 e5 2. Nf3 Nc6 …'}
            aria-invalid={errors.length > 0}
            aria-describedby={errors.length ? "pgn-errors" : undefined}
            className="t-notation mt-2 w-full rounded-[var(--radius-md)] border border-border-strong bg-surface p-3 text-fg"
          />
          <div className="mt-3 sm:w-56">
            <Select label="Which side did you play?" value={side} onChange={(v) => setSide(v as "w" | "b" | "none")} options={[{ value: "w", label: "White" }, { value: "b", label: "Black" }, { value: "none", label: "Neither (just studying)" }]} />
          </div>
          {errors.length > 0 && (
            <ul id="pgn-errors" role="alert" className="t-small mt-3 space-y-1 rounded-[var(--radius-md)] bg-danger-soft p-3 text-danger">
              {errors.slice(0, 5).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
              {errors.length > 5 && <li>…and {errors.length - 5} more.</li>}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => importText(text)} loading={busy} disabled={!text.trim()} icon={<Upload className="h-4 w-4" aria-hidden />}>
              Import
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()} icon={<FileUp className="h-4 w-4" aria-hidden />}>
              Upload .pgn file
            </Button>
            <input ref={fileRef} type="file" accept=".pgn,text/plain,application/x-chess-pgn" className="sr-only" aria-label="Upload a PGN file" onChange={(e) => onFile(e.target.files?.[0])} />
            <Button variant="ghost" onClick={() => setText(SAMPLE)}>
              Use an example game
            </Button>
          </div>
        </Card>

        <Card className="p-5 lg:col-start-1">
          <h2 className="t-card">Analyse a position (FEN)</h2>
          <label htmlFor="fen-input" className="t-small mt-1 block text-muted">
            Paste a FEN to set up any position, then explore it with Stockfish.
          </label>
          <input
            id="fen-input"
            value={fenText}
            onChange={(e) => {
              setFenText(e.target.value);
              setFenErr(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") openFen();
            }}
            spellCheck={false}
            autoComplete="off"
            placeholder="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
            aria-invalid={Boolean(fenErr)}
            aria-describedby={fenErr ? "fen-error" : undefined}
            className="t-notation mt-2 w-full rounded-[var(--radius-md)] border border-border-strong bg-surface px-3 py-2 text-fg"
          />
          {fenErr && (
            <p id="fen-error" role="alert" className="t-small mt-2 rounded-[var(--radius-md)] bg-danger-soft p-3 text-danger">
              {fenErr}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={openFen} disabled={!fenText.trim()} icon={<Microscope className="h-4 w-4" aria-hidden />}>
              Analyse position
            </Button>
            <Button variant="ghost" onClick={() => router.push(`/analysis/?fen=${encodeURIComponent(START_FEN)}`)}>
              Start from the initial position
            </Button>
          </div>
        </Card>

        <Card className="p-5 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <h2 className="t-card">Saved games</h2>
          {games === undefined ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : games.length === 0 ? (
            <EmptyState
              className="mt-3"
              icon={<Microscope className="h-7 w-7" aria-hidden />}
              title="No games yet"
              description="Games you play against the computer are saved here automatically. You can also import games from elsewhere."
              action={<ButtonLink href="/play/" variant="secondary">Play a game</ButtonLink>}
            />
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {games.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/analysis/?game=${g.id}`} className="t-body font-medium text-fg hover:text-accent">
                      {g.whitePlayer} vs {g.blackPlayer}
                    </Link>
                    <p className="t-small text-muted">
                      {g.status === "in-progress" ? "In progress" : g.result === "*" ? "Unfinished" : describeResult(g.result, g.terminalReason)} · {Math.ceil(g.moves.length / 2)} moves · {formatDate(g.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge tone={g.source === "computer" ? "neutral" : "info"}>{g.source === "computer" ? "vs computer" : "imported"}</Badge>
                    {g.analysisStatus === "complete" && <Badge tone="success">Analysed</Badge>}
                    {g.analysisStatus === "partial" && <Badge tone="warning">Partly analysed</Badge>}
                    <IconButton label={`Download PGN of ${g.whitePlayer} vs ${g.blackPlayer}`} size="sm" onClick={() => downloadText(`${g.whitePlayer}-vs-${g.blackPlayer}.pgn`.replace(/\s+/g, "_"), g.pgn, "application/x-chess-pgn")}>
                      <Download className="h-4 w-4" aria-hidden />
                    </IconButton>
                    <IconButton label={`Delete ${g.whitePlayer} vs ${g.blackPlayer}`} size="sm" onClick={() => setToDelete(g)}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Dialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        title="Delete this game?"
        description={toDelete ? `${toDelete.whitePlayer} vs ${toDelete.blackPlayer} and its analysis will be removed from this device. This cannot be undone.` : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (toDelete) await deleteGame(toDelete.id);
                setToDelete(null);
                toast("Game deleted.");
              }}
            >
              Delete
            </Button>
          </>
        }
      />
    </div>
  );
}
