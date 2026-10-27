// Promise-based UCI wrapper around the Stockfish npm build, for Node scripts (content validation).
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function createEngine(flavor = "lite-single") {
  const enginePath = require("stockfish").findEngine(flavor);
  const child = spawn(process.execPath, [enginePath], { stdio: "pipe" });
  let buf = "";
  let waiters = [];
  const lines = [];
  child.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      lines.push(line);
      waiters = waiters.filter((w) => !w(line));
    }
  });
  const send = (cmd) => child.stdin.write(cmd + "\n");
  const waitFor = (pred) => new Promise((res) => waiters.push((l) => (pred(l) ? (res(l), true) : false)));

  async function init() {
    send("uci");
    await waitFor((l) => l === "uciok");
    send("isready");
    await waitFor((l) => l === "readyok");
  }

  /** Analyse a FEN; returns [{ multipv, move, score:{cp|mate} (side to move POV), pv }]. */
  async function analyse(fen, { depth = 16, multipv = 2 } = {}) {
    send(`setoption name MultiPV value ${multipv}`);
    send("ucinewgame");
    send("isready");
    await waitFor((l) => l === "readyok");
    send(`position fen ${fen}`);
    const infos = new Map();
    const done = waitFor((l) => l.startsWith("bestmove") || /CRITICAL ERROR/.test(l));
    const start = lines.length;
    send(`go depth ${depth}`);
    const end = await done;
    if (/CRITICAL ERROR/.test(end)) throw new Error(`Stockfish rejected the position ${fen}: ${end}`);
    for (const l of lines.slice(start)) {
      const m = /^info .*?depth (\d+) .*?multipv (\d+) .*?score (cp|mate) (-?\d+).*? pv (.+)$/.exec(l);
      if (!m) continue;
      if (/ (lowerbound|upperbound) /.test(l)) continue;
      infos.set(+m[2], { depth: +m[1], multipv: +m[2], score: m[3] === "cp" ? { cp: +m[4] } : { mate: +m[4] }, pv: m[5].split(" "), move: m[5].split(" ")[0] });
    }
    return [...infos.values()].sort((a, b) => a.multipv - b.multipv);
  }

  return { init, analyse, quit: () => { send("quit"); child.kill(); } };
}

/** Comparable value of a score (side-to-move POV); mates dominate. */
export function scoreValue(s) {
  if (s.mate !== undefined) return s.mate > 0 ? 100000 - s.mate * 100 : -100000 - s.mate * 100;
  return s.cp;
}
