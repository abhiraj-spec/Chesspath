import { PIECE_SVG } from "./pieces";

/** Static, decorative board preview (no interaction, hidden from assistive technology). */
export function MiniBoard({ fen, orientation = "w" }: { fen: string; orientation?: "w" | "b" }) {
  const rows = fen.split(" ")[0].split("/");
  const grid: (string | null)[][] = rows.map((r) => {
    const out: (string | null)[] = [];
    for (const ch of r) {
      if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) out.push(null);
      else out.push(ch);
    }
    return out;
  });
  const cells = [];
  for (let vr = 0; vr < 8; vr++)
    for (let vc = 0; vc < 8; vc++) {
      const r = orientation === "w" ? vr : 7 - vr;
      const c = orientation === "w" ? vc : 7 - vc;
      const p = grid[r][c];
      const light = (r + c) % 2 === 0;
      cells.push(
        <div key={`${vr}-${vc}`} className="relative" style={{ background: light ? "var(--sq-light)" : "var(--sq-dark)" }}>
          {p && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={PIECE_SVG[`${p === p.toUpperCase() ? "w" : "b"}${p.toUpperCase()}`]} alt="" className="absolute inset-0 h-full w-full" draggable={false} />
          )}
        </div>,
      );
    }
  return (
    <div aria-hidden className="grid aspect-square w-full grid-cols-8 grid-rows-8 overflow-hidden rounded-[var(--radius-sm)]">
      {cells}
    </div>
  );
}
