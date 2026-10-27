import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { OPENINGS } from "@/content/openings/library";
import index from "@/content/openings/eco-index.json";
import { identifyOpening } from "@/lib/analysis/openingIndex";

const idx = index as unknown as Record<string, [string, string, number]>;

describe("opening library", () => {
  it("covers the required openings", () => {
    const names = OPENINGS.map((o) => o.name).join(" | ");
    for (const n of ["Italian", "Ruy Lopez", "Scotch", "Queen's Gambit", "London", "King's Indian", "Sicilian", "French", "Caro-Kann", "Scandinavian", "English"]) expect(names).toContain(n);
  });
  for (const o of OPENINGS) {
    for (const v of o.variations) {
      it(`${o.name} / ${v.name}: legal moves and a name confirmed by the Lichess database`, () => {
        const c = new Chess();
        const fens: string[] = [];
        for (const mv of v.moves) {
          expect(() => c.move(mv.san), `${v.id}: ${mv.san}`).not.toThrow();
          expect(mv.note.length).toBeGreaterThan(3);
          fens.push(c.fen());
        }
        const found = identifyOpening(idx, fens);
        expect(found, v.id).toBeDefined();
        expect(found!.name, `${v.id} -> ${found!.name}`).toMatch(new RegExp(v.expectName));
      });
    }
  }
});
