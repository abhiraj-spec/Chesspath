"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import { PIECE_SVG } from "./pieces";
import { PIECE_NAMES, colorName } from "@/lib/chess/core";
import { prefersReducedMotion, useSettings } from "@/lib/settings";
import { cn } from "@/lib/util";

export type HighlightKind = "hint" | "good" | "bad" | "target" | "selected";
export interface BoardHighlight {
  square: Square;
  kind: HighlightKind;
}
export interface BoardArrow {
  from: Square;
  to: Square;
  kind?: "main" | "alt" | "bad";
}
export interface BoardMove {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

export interface ChessboardProps {
  fen: string;
  orientation?: Color;
  /** Which side the user may move. "none" makes the board read-only. Defaults to the side to move. */
  movable?: Color | "both" | "none";
  onMove?: (move: BoardMove) => void;
  lastMove?: { from: Square; to: Square } | null;
  highlights?: BoardHighlight[];
  arrows?: BoardArrow[];
  /** Square-selection mode (for "click the squares" exercises). Disables moving. */
  onSquareSelect?: (square: Square) => void;
  selectedSquares?: Square[];
  /** Accessible name for the board, e.g. "Lesson board". */
  label: string;
  /** Overrides for settings-driven display options. */
  showCoordinates?: boolean;
  showLegalMoves?: boolean;
  showLastMove?: boolean;
  className?: string;
  /** Tells the board which side is "the user" for announcements. */
  testId?: string;
}

const FILES = "abcdefgh";

function sqAt(fileIdx: number, rankIdx: number): Square {
  return `${FILES[fileIdx]}${rankIdx + 1}` as Square;
}
function fileOf(sq: Square) {
  return FILES.indexOf(sq[0]);
}
function rankOf(sq: Square) {
  return Number(sq[1]) - 1;
}

/** Convert a board-relative point into a square (orientation-aware). */
function pointToSquare(x: number, y: number, size: number, orientation: Color): Square | null {
  if (x < 0 || y < 0 || x >= size || y >= size) return null;
  const col = Math.floor((x / size) * 8);
  const row = Math.floor((y / size) * 8);
  const fileIdx = orientation === "w" ? col : 7 - col;
  const rankIdx = orientation === "w" ? 7 - row : row;
  return sqAt(fileIdx, rankIdx);
}

/** Visual (col,row) of a square for the current orientation. */
function squareToCell(sq: Square, orientation: Color) {
  const f = fileOf(sq);
  const r = rankOf(sq);
  return orientation === "w" ? { col: f, row: 7 - r } : { col: 7 - f, row: r };
}

export function Chessboard({
  fen,
  orientation = "w",
  movable,
  onMove,
  lastMove,
  highlights = [],
  arrows = [],
  onSquareSelect,
  selectedSquares = [],
  label,
  showCoordinates,
  showLegalMoves,
  showLastMove,
  className,
  testId,
}: ChessboardProps) {
  const settings = useSettings();
  const coords = showCoordinates ?? settings.coordinates;
  const legalHints = showLegalMoves ?? settings.showLegalMoves;
  const lastHints = showLastMove ?? settings.showLastMove;
  const dragEnabled = settings.dragToMove;

  const boardRef = useRef<HTMLDivElement>(null);
  const liveId = useId();
  const [selected, setSelected] = useState<Square | null>(null);
  const [cursor, setCursor] = useState<Square>(orientation === "w" ? "e2" : "e7");
  const [keyboardActive, setKeyboardActive] = useState(false);
  const [drag, setDrag] = useState<{ from: Square; x: number; y: number; active: boolean; startX: number; startY: number } | null>(null);
  const [hoverSquare, setHoverSquare] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square; color: Color } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const skipAnimRef = useRef<string | null>(null);
  const pieceRefs = useRef(new Map<Square, HTMLImageElement>());
  const wasSelectedOnDown = useRef(false);

  const position = useMemo(() => {
    try {
      const chess = new Chess(fen);
      const pieces = new Map<Square, { type: PieceSymbol; color: Color }>();
      for (const row of chess.board()) for (const p of row) if (p) pieces.set(p.square, { type: p.type, color: p.color });
      const turn = chess.turn();
      const moves = chess.moves({ verbose: true });
      let kingInCheck: Square | null = null;
      if (chess.inCheck()) kingInCheck = chess.findPiece({ type: "k", color: turn })[0] ?? null;
      return { pieces, turn, moves, kingInCheck, ok: true as const };
    } catch {
      return { pieces: new Map<Square, { type: PieceSymbol; color: Color }>(), turn: "w" as Color, moves: [], kingInCheck: null, ok: false as const };
    }
  }, [fen]);

  const canMoveColor = useCallback(
    (c: Color) => {
      if (onSquareSelect) return false;
      const m = movable ?? position.turn;
      if (m === "none") return false;
      if (m === "both") return c === position.turn;
      return m === c && c === position.turn;
    },
    [movable, position.turn, onSquareSelect],
  );

  const destsFrom = useCallback(
    (from: Square | null): Square[] => {
      if (!from) return [];
      const p = position.pieces.get(from);
      if (!p || !canMoveColor(p.color)) return [];
      return [...new Set(position.moves.filter((m) => m.from === from).map((m) => m.to))];
    },
    [position, canMoveColor],
  );

  const selectedDests = useMemo(() => destsFrom(selected), [destsFrom, selected]);

  // Clear transient state when the position changes (adjusting state during render).
  const [seenFen, setSeenFen] = useState(fen);
  if (seenFen !== fen) {
    setSeenFen(fen);
    setSelected(null);
    setPromotion(null);
    setDrag(null);
  }

  // Animate the last move (unless the user just dragged it into place).
  useLayoutEffect(() => {
    if (!lastMove || prefersReducedMotion()) return;
    const key = `${lastMove.from}${lastMove.to}${fen}`;
    if (skipAnimRef.current === `${lastMove.from}${lastMove.to}`) {
      skipAnimRef.current = null;
      return;
    }
    const el = pieceRefs.current.get(lastMove.to);
    if (!el || typeof el.animate !== "function") return;
    const a = squareToCell(lastMove.from, orientation);
    const b = squareToCell(lastMove.to, orientation);
    const dx = (a.col - b.col) * 100;
    const dy = (a.row - b.row) * 100;
    el.animate([{ transform: `translate(${dx}%, ${dy}%)` }, { transform: "translate(0, 0)" }], {
      duration: 170,
      easing: "cubic-bezier(.2,.7,.3,1)",
    });
    void key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen]);

  const attemptMove = useCallback(
    (from: Square, to: Square, viaDrag: boolean) => {
      const candidates = position.moves.filter((m) => m.from === from && m.to === to);
      if (candidates.length === 0) return false;
      const piece = position.pieces.get(from);
      if (!piece || !canMoveColor(piece.color)) return false;
      if (candidates.some((m) => m.promotion)) {
        setPromotion({ from, to, color: piece.color });
        setSelected(null);
        return true;
      }
      if (viaDrag) skipAnimRef.current = `${from}${to}`;
      setSelected(null);
      onMove?.({ from, to });
      return true;
    },
    [position, canMoveColor, onMove],
  );

  const choosePromotion = (p: PieceSymbol | null) => {
    if (!promotion) return;
    const { from, to } = promotion;
    setPromotion(null);
    if (p) onMove?.({ from, to, promotion: p });
    boardRef.current?.focus();
  };

  // ----- Pointer handling (mouse, touch, pen) -----

  const localPoint = (e: React.PointerEvent) => {
    const rect = boardRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, size: rect.width };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (promotion) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const { x, y, size } = localPoint(e);
    const sq = pointToSquare(x, y, size, orientation);
    if (!sq) return;
    setKeyboardActive(false);
    setCursor(sq);
    if (onSquareSelect) {
      onSquareSelect(sq);
      return;
    }
    if (selected && selected !== sq && selectedDests.includes(sq)) {
      attemptMove(selected, sq, false);
      return;
    }
    const piece = position.pieces.get(sq);
    if (piece && canMoveColor(piece.color)) {
      wasSelectedOnDown.current = selected === sq;
      setSelected(sq);
      if (dragEnabled) {
        boardRef.current?.setPointerCapture?.(e.pointerId);
        setDrag({ from: sq, x, y, startX: x, startY: y, active: false });
      }
      e.preventDefault();
    } else {
      setSelected(null);
      if (piece) {
        const pName = `${colorName(piece.color)} ${PIECE_NAMES[piece.type]}`;
        setAnnouncement(position.turn !== piece.color ? `${pName} on ${sq}. It is ${colorName(position.turn)}'s turn.` : `${pName} on ${sq} cannot be moved here.`);
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const { x, y, size } = localPoint(e);
    const moved = Math.hypot(x - drag.startX, y - drag.startY) > Math.max(4, size / 80);
    setDrag({ ...drag, x, y, active: drag.active || moved });
    setHoverSquare(pointToSquare(x, y, size, orientation));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const { x, y, size } = localPoint(e);
    const target = pointToSquare(x, y, size, orientation);
    const d = drag;
    setDrag(null);
    setHoverSquare(null);
    if (d.active) {
      if (target && target !== d.from && destsFrom(d.from).includes(target)) attemptMove(d.from, target, true);
    } else if (wasSelectedOnDown.current && target === d.from) {
      // Clicking an already-selected piece toggles the selection off.
      setSelected(null);
    }
  };

  const onPointerCancel = () => {
    setDrag(null);
    setHoverSquare(null);
  };

  // ----- Keyboard handling -----

  const describeSquare = (sq: Square) => {
    const p = position.pieces.get(sq);
    return p ? `${sq}, ${colorName(p.color).toLowerCase()} ${PIECE_NAMES[p.type]}` : `${sq}, empty`;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (promotion) return;
    const dirs: Record<string, [number, number]> = {
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    if (e.key in dirs) {
      e.preventDefault();
      setKeyboardActive(true);
      let [df, dr] = dirs[e.key];
      if (orientation === "b") {
        df = -df;
        dr = -dr;
      }
      const f = Math.min(7, Math.max(0, fileOf(cursor) + df));
      const r = Math.min(7, Math.max(0, rankOf(cursor) + dr));
      const next = sqAt(f, r);
      setCursor(next);
      const isDest = selected && selectedDests.includes(next);
      setAnnouncement(`${describeSquare(next)}${isDest ? ", legal move" : ""}`);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setKeyboardActive(true);
      if (onSquareSelect) {
        onSquareSelect(cursor);
        return;
      }
      if (selected && selectedDests.includes(cursor)) {
        attemptMove(selected, cursor, false);
        return;
      }
      const p = position.pieces.get(cursor);
      if (p && canMoveColor(p.color)) {
        const dests = destsFrom(cursor);
        setSelected(cursor);
        setAnnouncement(
          dests.length
            ? `${colorName(p.color)} ${PIECE_NAMES[p.type]} on ${cursor} selected. Legal moves: ${dests.join(", ")}. Move the cursor to a destination and press Enter.`
            : `${colorName(p.color)} ${PIECE_NAMES[p.type]} on ${cursor} has no legal moves.`,
        );
      } else if (selected) {
        setAnnouncement(`${cursor} is not a legal move for the selected piece.`);
      } else {
        setAnnouncement(`${describeSquare(cursor)}. ${p ? "This piece cannot move now." : "Select one of your pieces first."}`);
      }
      return;
    }
    if (e.key === "Escape" && selected) {
      e.preventDefault();
      setSelected(null);
      setAnnouncement("Selection cleared.");
    }
  };

  const onFocus = () => {
    setAnnouncement(
      `${label}. ${colorName(position.turn)} to move. Use arrow keys to move the cursor, Enter to select a piece and Enter again on a destination. Cursor on ${describeSquare(cursor)}.`,
    );
  };

  // ----- Rendering -----

  const highlightMap = new Map<Square, HighlightKind[]>();
  for (const h of highlights) highlightMap.set(h.square, [...(highlightMap.get(h.square) ?? []), h.kind]);

  const cells: React.ReactNode[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const fileIdx = orientation === "w" ? col : 7 - col;
      const rankIdx = orientation === "w" ? 7 - row : row;
      const sq = sqAt(fileIdx, rankIdx);
      const light = (fileIdx + rankIdx) % 2 === 1;
      const piece = position.pieces.get(sq);
      const isLast = lastHints && lastMove && (lastMove.from === sq || lastMove.to === sq);
      const isSel = selected === sq || selectedSquares.includes(sq);
      const isDest = legalHints && selectedDests.includes(sq);
      const isCheck = position.kingInCheck === sq;
      const hl = highlightMap.get(sq) ?? [];
      const isDragFrom = drag?.active && drag.from === sq;
      const isHover = drag?.active && hoverSquare === sq && destsFrom(drag.from).includes(sq);
      const isCursor = keyboardActive && cursor === sq;

      cells.push(
        <div
          key={sq}
          data-square={sq}
          className="relative"
          style={{
            background: light ? "var(--sq-light)" : "var(--sq-dark)",
            // Only squares holding a draggable piece block touch scrolling, so the page can still be
            // scrolled by swiping across the rest of the board.
            touchAction: dragEnabled && piece && canMoveColor(piece.color) ? "none" : undefined,
          }}
        >
          {isLast && <div className="absolute inset-0" style={{ background: "var(--sq-last)" }} />}
          {isSel && <div className="absolute inset-0" style={{ background: "var(--sq-selected)" }} />}
          {selectedSquares.includes(sq) && <div className="pointer-events-none absolute inset-[6%] rounded-[12%]" style={{ boxShadow: "inset 0 0 0 4px var(--accent), inset 0 0 0 6px rgb(255 255 255 / 0.7)" }} />}
          {hl.includes("hint") && <div className="absolute inset-0" style={{ background: "var(--sq-hint)" }} />}
          {hl.includes("good") && <div className="absolute inset-0" style={{ background: "var(--sq-good)" }} />}
          {hl.includes("bad") && <div className="absolute inset-0" style={{ background: "var(--sq-bad)" }} />}
          {hl.includes("selected") && <div className="absolute inset-0" style={{ background: "var(--sq-selected)" }} />}
          {isCheck && (
            <div
              className="absolute inset-0"
              style={{ background: "radial-gradient(circle, rgb(220 38 38 / 0.85) 0%, rgb(220 38 38 / 0.4) 45%, transparent 72%)" }}
            />
          )}
          {isHover && <div className="absolute inset-0" style={{ boxShadow: "inset 0 0 0 4px rgb(255 255 255 / 0.65)" }} />}
          {hl.includes("target") && (
            <div className="pointer-events-none absolute inset-[18%] rounded-full" style={{ boxShadow: "0 0 0 3px var(--accent)", background: "color-mix(in srgb, var(--accent) 12%, transparent)" }} />
          )}
          {coords && col === 0 && (
            <span
              className="pointer-events-none absolute left-[3%] top-[1%] select-none text-[clamp(9px,2.1cqw,13px)] font-semibold leading-none"
              style={{ color: light ? "var(--sq-coord-light)" : "var(--sq-coord-dark)" }}
              aria-hidden
            >
              {rankIdx + 1}
            </span>
          )}
          {coords && row === 7 && (
            <span
              className="pointer-events-none absolute bottom-[2%] right-[4%] select-none text-[clamp(9px,2.1cqw,13px)] font-semibold leading-none"
              style={{ color: light ? "var(--sq-coord-light)" : "var(--sq-coord-dark)" }}
              aria-hidden
            >
              {FILES[fileIdx]}
            </span>
          )}
          {piece && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={(el) => {
                if (el) pieceRefs.current.set(sq, el);
                else pieceRefs.current.delete(sq);
              }}
              src={PIECE_SVG[`${piece.color}${piece.type.toUpperCase()}`]}
              alt=""
              draggable={false}
              className={cn("pointer-events-none absolute inset-0 h-full w-full select-none", isDragFrom && "opacity-30")}
            />
          )}
          {isDest && !piece && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-[28%] w-[28%] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: "var(--sq-dot)" }} />
          )}
          {isDest && piece && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: "radial-gradient(transparent 0%, transparent 79%, var(--sq-dot) 80%)" }}
            />
          )}
          {isCursor && <div className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 0 3px var(--focus), inset 0 0 0 5px rgb(255 255 255 / 0.8)" }} />}
        </div>,
      );
    }
  }

  const dragPiece = drag?.active ? position.pieces.get(drag.from) : undefined;

  return (
    <div className={cn("relative w-full select-none", className)} style={{ containerType: "inline-size" }} data-testid={testId}>
      <div
        ref={boardRef}
        role="application"
        aria-roledescription="chessboard"
        aria-label={`${label}. ${orientation === "w" ? "White" : "Black"} at the bottom.`}
        aria-describedby={liveId}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={() => setKeyboardActive(false)}
        className="relative grid aspect-square w-full grid-cols-8 grid-rows-8 overflow-hidden rounded-[var(--radius-md)] shadow-[var(--shadow-raised)] outline-offset-4"
        style={{ touchAction: drag ? "none" : "manipulation", cursor: drag?.active ? "grabbing" : "default" }}
        data-fen={fen}
        data-orientation={orientation}
      >
        {cells}
        {arrows.length > 0 && <ArrowLayer arrows={arrows} orientation={orientation} />}
        {dragPiece && drag && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={PIECE_SVG[`${dragPiece.color}${dragPiece.type.toUpperCase()}`]}
            alt=""
            draggable={false}
            className="pointer-events-none absolute z-20 h-[12.5%] w-[12.5%] select-none"
            style={{ left: drag.x, top: drag.y, transform: "translate(-50%, -55%) scale(1.12)", filter: "drop-shadow(0 6px 8px rgb(0 0 0 / 0.3))" }}
          />
        )}
        {!position.ok && (
          <div className="absolute inset-0 grid grid-cols-1 place-items-center bg-surface/90 p-4 text-center t-small text-danger">This position could not be displayed.</div>
        )}
      </div>
      {promotion && <PromotionPicker color={promotion.color} onChoose={choosePromotion} />}
      <div id={liveId} aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}

function ArrowLayer({ arrows, orientation }: { arrows: BoardArrow[]; orientation: Color }) {
  const center = (sq: Square) => {
    const c = squareToCell(sq, orientation);
    return { x: c.col + 0.5, y: c.row + 0.5 };
  };
  const colors = { main: "var(--arrow)", alt: "var(--arrow-alt)", bad: "var(--arrow-bad)" };
  return (
    <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full" viewBox="0 0 8 8" aria-hidden>
      <defs>
        {(["main", "alt", "bad"] as const).map((k) => (
          <marker key={k} id={`arrowhead-${k}`} markerWidth="3" markerHeight="3" refX="1.6" refY="1.5" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L3,1.5 L0,3 z" fill={colors[k]} />
          </marker>
        ))}
      </defs>
      {arrows.map((a, i) => {
        const s = center(a.from);
        const e = center(a.to);
        const len = Math.hypot(e.x - s.x, e.y - s.y);
        const shorten = 0.42;
        const ex = e.x - ((e.x - s.x) / len) * shorten;
        const ey = e.y - ((e.y - s.y) / len) * shorten;
        const k = a.kind ?? "main";
        return (
          <line
            key={i}
            x1={s.x}
            y1={s.y}
            x2={ex}
            y2={ey}
            stroke={colors[k]}
            strokeWidth={0.16}
            strokeLinecap="round"
            markerEnd={`url(#arrowhead-${k})`}
          />
        );
      })}
    </svg>
  );
}

function PromotionPicker({ color, onChoose }: { color: Color; onChoose: (p: PieceSymbol | null) => void }) {
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);
  const options: PieceSymbol[] = ["q", "r", "b", "n"];
  return (
    <div
      className="absolute inset-0 z-30 grid grid-cols-1 place-items-center rounded-[var(--radius-md)] bg-black/45 p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Choose a piece for promotion"
      onKeyDown={(e) => {
        if (e.key === "Escape") onChoose(null);
      }}
    >
      <div className="w-full max-w-xs rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-overlay)]">
        <p className="t-card mb-1 text-fg">Promote your pawn</p>
        <p className="t-small mb-3 text-muted">Choose the piece your pawn becomes. A queen is usually strongest.</p>
        <div className="grid grid-cols-4 gap-2">
          {options.map((p, i) => (
            <button
              key={p}
              ref={i === 0 ? firstRef : undefined}
              type="button"
              onClick={() => onChoose(p)}
              className="flex aspect-square flex-col items-center justify-center rounded-[var(--radius-md)] border border-border bg-surface-2 hover:border-accent hover:bg-accent-soft"
              aria-label={`Promote to ${PIECE_NAMES[p]}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={PIECE_SVG[`${color}${p.toUpperCase()}`]} alt="" className="h-4/5 w-4/5" draggable={false} />
            </button>
          ))}
        </div>
        <button type="button" onClick={() => onChoose(null)} className="t-small mt-3 w-full rounded-[var(--radius-sm)] py-2 text-muted hover:bg-surface-2">
          Cancel
        </button>
      </div>
    </div>
  );
}
