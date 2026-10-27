import { afterAll, describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { formatScore, parseBestMove, parseInfo, scoreToNumber, toWhitePov, winProbability } from "@/lib/engine/uci";
import { EngineClient, EngineError, type WorkerLike } from "@/lib/engine/client";
import { chooseMove, LEVELS, levelConfig } from "@/lib/engine/strength";
import { seededRandom } from "@/lib/util";
import { nodeStockfishWorker } from "./node-worker";

describe("UCI parsing", () => {
  it("parses info lines with cp scores and pv", () => {
    const i = parseInfo("info depth 14 seldepth 20 multipv 2 score cp -35 nodes 12345 nps 100000 time 120 pv e7e5 g1f3 b8c6");
    expect(i).toMatchObject({ depth: 14, multipv: 2, score: { cp: -35 }, pv: ["e7e5", "g1f3", "b8c6"], timeMs: 120 });
  });
  it("parses mate scores and bounds", () => {
    expect(parseInfo("info depth 5 multipv 1 score mate -2 nodes 10 pv h7h6")?.score).toEqual({ mate: -2 });
    expect(parseInfo("info depth 9 multipv 1 score cp 20 lowerbound nodes 10 pv e2e4")?.bound).toBe("lower");
  });
  it("ignores non-search info", () => {
    expect(parseInfo("info string NNUE evaluation using nn.nnue")).toBeNull();
    expect(parseInfo("info depth 3 currmove e2e4 currmovenumber 1")).toBeNull();
  });
  it("parses bestmove including no-move", () => {
    expect(parseBestMove("bestmove e2e4 ponder e7e5")).toEqual({ best: "e2e4", ponder: "e7e5" });
    expect(parseBestMove("bestmove (none)")?.best).toBeNull();
  });
  it("normalises to White's point of view", () => {
    expect(toWhitePov({ cp: 50 }, "b")).toEqual({ cp: -50, mate: undefined });
    expect(toWhitePov({ mate: 3 }, "b").mate).toBe(-3);
  });
  it("orders mate scores beyond centipawns and prefers faster mates", () => {
    expect(scoreToNumber({ mate: 1 })).toBeGreaterThan(scoreToNumber({ mate: 5 }));
    expect(scoreToNumber({ mate: 5 })).toBeGreaterThan(scoreToNumber({ cp: 3000 }));
    expect(scoreToNumber({ mate: -1 })).toBeLessThan(scoreToNumber({ mate: -6 }));
  });
  it("formats scores", () => {
    expect(formatScore({ cp: 125 })).toBe("+1.25");
    expect(formatScore({ cp: -40 })).toBe("−0.40");
    expect(formatScore({ mate: -2 })).toBe("#-2");
  });
  it("win probability is monotonic and 50% at equality", () => {
    expect(winProbability({ cp: 0 })).toBeCloseTo(0.5);
    expect(winProbability({ cp: 300 })).toBeGreaterThan(winProbability({ cp: 100 }));
    expect(winProbability({ mate: 2 })).toBe(1);
  });
});

describe("strength levels", () => {
  const legal = ["e2e4", "d2d4", "a2a3", "g1f3"];
  const lines = [
    { multipv: 1, depth: 10, score: { cp: 40 }, pv: ["e2e4"], preliminary: false },
    { multipv: 2, depth: 10, score: { cp: 35 }, pv: ["d2d4"], preliminary: false },
    { multipv: 3, depth: 10, score: { cp: -150 }, pv: ["a2a3"], preliminary: false },
  ];
  it("challenging level always plays the best line", () => {
    const rng = seededRandom(1);
    for (let i = 0; i < 50; i++) expect(chooseMove(lines, legal, levelConfig(5), "w", rng).move).toBe("e2e4");
  });
  it("never returns an illegal move", () => {
    const rng = seededRandom(2);
    for (const cfg of LEVELS) for (let i = 0; i < 200; i++) expect(legal).toContain(chooseMove(lines, legal, cfg, "w", rng).move);
  });
  it("lower levels choose weaker moves more often than higher ones", () => {
    const freqWorse = (lvl: number) => {
      const rng = seededRandom(7);
      let worse = 0;
      for (let i = 0; i < 2000; i++) if (chooseMove(lines, legal, levelConfig(lvl), "w", rng).move !== "e2e4") worse++;
      return worse;
    };
    expect(freqWorse(1)).toBeGreaterThan(freqWorse(3));
    expect(freqWorse(3)).toBeGreaterThan(freqWorse(5));
  });
  it("respects Black's point of view", () => {
    const blackLines = [
      { multipv: 1, depth: 10, score: { cp: -200 }, pv: ["e7e5"], preliminary: false },
      { multipv: 2, depth: 10, score: { cp: 300 }, pv: ["f7f6"], preliminary: false },
    ];
    expect(chooseMove(blackLines, ["e7e5", "f7f6"], levelConfig(5), "b").move).toBe("e7e5");
  });
});

/** A scripted fake worker: answers UCI handshakes and searches instantly, or misbehaves on demand. */
function fakeWorker(mode: "ok" | "silent" | "hang" | "crash-on-go" = "ok") {
  const sent: string[] = [];
  const w: WorkerLike & { sent: string[] } = {
    sent,
    onmessage: null,
    onerror: null,
    postMessage(msg: string) {
      sent.push(msg);
      const reply = (s: string) => setTimeout(() => w.onmessage?.({ data: s }), 1);
      if (mode === "silent") return;
      if (msg === "uci") reply("uciok");
      if (msg === "isready") reply("readyok");
      if (msg.startsWith("go")) {
        if (mode === "hang") return;
        if (mode === "crash-on-go") {
          setTimeout(() => w.onerror?.({ message: "boom" }), 1);
          return;
        }
        reply("info depth 1 multipv 1 score cp 30 nodes 1 pv e2e4");
        reply("info depth 2 multipv 1 score cp 25 nodes 2 pv e2e4 e7e5");
        reply("bestmove e2e4");
      }
      if (msg === "stop") reply("bestmove e2e4");
    },
    terminate() {},
  };
  return w;
}

describe("engine client (mocked worker)", () => {
  const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  it("initialises and returns analysis", async () => {
    const c = new EngineClient(() => fakeWorker());
    const r = await c.analyse({ fen: START, depth: 2 });
    expect(c.status).toBe("ready");
    expect(r.bestMove).toBe("e2e4");
    expect(r.lines[0].score).toEqual({ cp: 25, mate: undefined });
    expect(r.depth).toBe(2);
  });
  it("normalises Black-to-move scores to White's point of view", async () => {
    const c = new EngineClient(() => fakeWorker());
    const r = await c.analyse({ fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", depth: 2 });
    expect(r.lines[0].score.cp).toBe(-25);
  });
  it("cancels a superseded search so stale results are never delivered", async () => {
    const w = fakeWorker("hang");
    const c = new EngineClient(() => w);
    const first = c.analyse({ fen: START, depth: 20 });
    await new Promise((r) => setTimeout(r, 20));
    // Second request: the first must reject as cancelled, not resolve with the second's data.
    w.postMessage = ((orig) => (m: string) => {
      orig.call(w, m);
      if (m === "stop") setTimeout(() => w.onmessage?.({ data: "bestmove e2e4" }), 1);
    })(w.postMessage);
    const second = c.analyse({ fen: START, depth: 1 });
    await expect(first).rejects.toMatchObject({ kind: "cancelled" });
    c.terminate();
    await expect(second).rejects.toBeInstanceOf(EngineError);
  });
  it("fails gracefully when the engine never starts", async () => {
    const c = new EngineClient(() => fakeWorker("silent"), { initTimeoutMs: 50 });
    await expect(c.analyse({ fen: START, depth: 1 })).rejects.toBeInstanceOf(EngineError);
    expect(c.status).toBe("failed");
  });
  it("detects a hung search and can restart", async () => {
    let mode: "hang" | "ok" = "hang";
    const c = new EngineClient(() => fakeWorker(mode), { searchGraceMs: 50 });
    await expect(c.analyse({ fen: START, movetimeMs: 10 })).rejects.toMatchObject({ kind: "crash" });
    expect(c.status).toBe("failed");
    mode = "ok";
    await c.restart();
    expect(c.status).toBe("ready");
    expect((await c.analyse({ fen: START, depth: 2 })).bestMove).toBe("e2e4");
  });
  it("reports a worker crash during search", async () => {
    const c = new EngineClient(() => fakeWorker("crash-on-go"));
    await expect(c.analyse({ fen: START, depth: 5 })).rejects.toMatchObject({ kind: "crash" });
    expect(c.status).toBe("failed");
    expect(c.lastError).toMatch(/stopped unexpectedly/);
  });
});

describe("engine client (real Stockfish)", () => {
  const client = new EngineClient(nodeStockfishWorker);
  afterAll(() => client.terminate());
  it("finds mate in one and reports a mate score from White's view", async () => {
    const fen = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";
    const r = await client.analyse({ fen, depth: 10 });
    expect(r.bestMove).toBe("a1a8");
    expect(r.lines[0].score.mate).toBe(1);
  });
  it("returns legal moves and multiple lines", async () => {
    const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
    const r = await client.analyse({ fen, depth: 10, multipv: 3 });
    expect(r.lines.length).toBe(3);
    const legal = new Chess(fen).moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ""));
    for (const l of r.lines) expect(legal).toContain(l.pv[0]);
  });
  it("reports a Black mate as a negative mate score from White's point of view", async () => {
    const fen = "r5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1"; // Black mates with ...Ra1#
    const r = await client.analyse({ fen, depth: 8 });
    expect(r.bestMove).toBe("a8a1");
    expect(r.lines[0].score.mate).toBe(-1);
  });
});
