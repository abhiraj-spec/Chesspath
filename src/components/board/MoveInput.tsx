"use client";

import { useId, useState } from "react";
import { Chess } from "chess.js";
import { parseUci } from "@/lib/chess/core";
import type { BoardMove } from "./Chessboard";

/** Type a move in algebraic (Nf3, exd5, O-O, e8=Q) or coordinate (g1f3) notation. */
export function MoveInput({ fen, onMove, disabled }: { fen: string; onMove: (m: BoardMove) => void; disabled?: boolean }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = value.trim();
    if (!text) return;
    const c = new Chess(fen);
    try {
      const u = parseUci(text.toLowerCase());
      const m = u ? c.move(u) : c.move(text.replace(/0/g, "O"));
      onMove({ from: m.from, to: m.to, promotion: m.promotion });
      setValue("");
      setError(null);
    } catch {
      setError(`“${text}” is not a legal move here.`);
    }
  };
  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-start gap-2">
      <label htmlFor={id} className="sr-only">
        Type a move
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        placeholder="Type a move, e.g. Nf3"
        autoComplete="off"
        spellCheck={false}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-err` : undefined}
        className="t-notation h-10 min-w-0 flex-1 rounded-[var(--radius-md)] border border-border-strong bg-surface px-3 text-fg disabled:opacity-50"
      />
      <button type="submit" disabled={disabled} className="h-10 rounded-[var(--radius-md)] bg-surface-2 px-4 text-[0.875rem] font-medium hover:bg-surface-3 disabled:opacity-50">
        Play
      </button>
      {error && (
        <p id={`${id}-err`} role="alert" className="t-small w-full text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
