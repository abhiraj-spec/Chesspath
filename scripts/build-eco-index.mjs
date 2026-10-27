// Builds src/content/openings/eco-index.json from the Lichess chess-openings TSV files (CC0)
// in data/openings/. Maps a position key (FEN without move counters) to { eco, name, ply }.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "data/openings");
const index = {};
let lines = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith(".tsv")).sort()) {
  const rows = readFileSync(join(dir, f), "utf8").split("\n").slice(1).filter(Boolean);
  for (const row of rows) {
    const [eco, name, pgn] = row.split("\t");
    const c = new Chess();
    try {
      c.loadPgn(pgn);
    } catch {
      console.error("bad line", eco, name);
      continue;
    }
    const key = c.fen().split(" ").slice(0, 4).join(" ");
    const ply = c.history().length;
    // Keep the most specific (longest) name for a position.
    if (!index[key] || index[key][2] < ply) index[key] = [eco, name, ply];
    lines++;
  }
}
writeFileSync(join(root, "src/content/openings/eco-index.json"), JSON.stringify(index));
console.log(`Indexed ${lines} lines, ${Object.keys(index).length} positions`);
