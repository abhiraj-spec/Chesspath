import { parseBestMove, parseInfo, toWhitePov, type InfoLine, type Score } from "./uci";

/**
 * Stockfish client over a Web Worker (or any object with the same shape, e.g. a Node child
 * process adapter in tests).
 *
 * Guarantees:
 *  - one search at a time; a new request stops the running one;
 *  - results are tagged with a job id, so a stale result can never be delivered to a newer request;
 *  - timeouts and worker errors reject the pending request and put the client into a "failed"
 *    state that can be recovered with restart().
 */
export interface WorkerLike {
  postMessage(msg: string): void;
  terminate(): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

export type EngineStatus = "idle" | "loading" | "ready" | "failed";

export interface AnalysisLine {
  multipv: number;
  depth: number;
  /** White's point of view. */
  score: Score;
  pv: string[];
  preliminary: boolean;
}

export interface AnalysisResult {
  fen: string;
  bestMove: string | null;
  lines: AnalysisLine[];
  depth: number;
  /** True when the search was stopped early (superseded or cancelled). */
  stopped: boolean;
}

export interface AnalyseOptions {
  fen: string;
  depth?: number;
  movetimeMs?: number;
  multipv?: number;
  onUpdate?: (lines: AnalysisLine[]) => void;
}

export class EngineError extends Error {
  constructor(
    message: string,
    public readonly kind: "init" | "timeout" | "crash" | "cancelled" | "invalid",
  ) {
    super(message);
    this.name = "EngineError";
  }
}

interface Job {
  id: number;
  opts: AnalyseOptions;
  turn: "w" | "b";
  lines: Map<number, AnalysisLine>;
  resolve: (r: AnalysisResult) => void;
  reject: (e: Error) => void;
  stopped: boolean;
  timer?: ReturnType<typeof setTimeout>;
  started: boolean;
}

export const ENGINE_URL = "/engine/stockfish-19-lite-single.js";
export const ENGINE_NAME = "Stockfish 19 (lite, single-threaded WASM)";

export class EngineClient {
  private worker: WorkerLike | null = null;
  private job: Job | null = null;
  private queue: Job[] = [];
  private nextId = 1;
  private initPromise: Promise<void> | null = null;
  private lineWaiters: { pred: (l: string) => boolean; resolve: () => void }[] = [];
  private currentOptions = { multipv: 1 };
  status: EngineStatus = "idle";
  lastError: string | null = null;
  private listeners = new Set<(s: EngineStatus) => void>();

  constructor(
    private readonly createWorker: () => WorkerLike,
    private readonly opts: { initTimeoutMs?: number; searchGraceMs?: number } = {},
  ) {}

  onStatus(fn: (s: EngineStatus) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private setStatus(s: EngineStatus, error?: string) {
    this.status = s;
    this.lastError = error ?? (s === "failed" ? this.lastError : null);
    this.listeners.forEach((l) => l(s));
  }

  init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.setStatus("loading");
    this.initPromise = new Promise<void>((resolve, reject) => {
      let worker: WorkerLike;
      try {
        worker = this.createWorker();
      } catch (e) {
        const err = new EngineError(`Could not start the engine: ${e instanceof Error ? e.message : String(e)}`, "init");
        this.fail(err.message);
        reject(err);
        return;
      }
      this.worker = worker;
      worker.onmessage = (e) => this.onLine(String(e.data));
      worker.onerror = (e) => {
        const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "worker error";
        this.handleCrash(`The engine stopped unexpectedly (${msg}).`);
        reject(new EngineError("Engine failed to load.", "init"));
      };
      const timer = setTimeout(() => {
        this.handleCrash("The engine took too long to start.");
        reject(new EngineError("Engine start timed out.", "init"));
      }, this.opts.initTimeoutMs ?? 20000);
      this.waitForLine((l) => l === "uciok")
        .then(() => {
          this.send("setoption name Hash value 32");
          this.send("isready");
          return this.waitForLine((l) => l === "readyok");
        })
        .then(() => {
          clearTimeout(timer);
          this.setStatus("ready");
          resolve();
          this.pump();
        });
      this.send("uci");
    });
    this.initPromise.catch(() => {});
    return this.initPromise;
  }

  private send(cmd: string) {
    this.worker?.postMessage(cmd);
  }

  private waitForLine(pred: (l: string) => boolean): Promise<void> {
    return new Promise((resolve) => this.lineWaiters.push({ pred, resolve }));
  }

  private onLine(raw: string) {
    for (const line of raw.split("\n")) {
      const l = line.trim();
      if (!l) continue;
      this.lineWaiters = this.lineWaiters.filter((w) => {
        if (w.pred(l)) {
          w.resolve();
          return false;
        }
        return true;
      });
      const job = this.job;
      if (!job || !job.started) continue;
      if (l.startsWith("info string") && /CRITICAL ERROR|Unsupported position/i.test(l)) {
        // Stockfish refuses illegal positions and then ignores "go": fail this job only.
        if (job.timer) clearTimeout(job.timer);
        this.job = null;
        job.reject(new EngineError("The engine cannot analyse this position (it is not a legal chess position).", "invalid"));
        this.pump();
        continue;
      }
      if (l.startsWith("info ")) {
        const info = parseInfo(l);
        if (info) this.onInfo(job, info);
      } else if (l.startsWith("bestmove")) {
        this.finishJob(job, parseBestMove(l)?.best ?? null);
      }
    }
  }

  private onInfo(job: Job, info: InfoLine) {
    const line: AnalysisLine = {
      multipv: info.multipv,
      depth: info.depth,
      score: toWhitePov(info.score, job.turn),
      pv: info.pv,
      preliminary: Boolean(info.bound),
    };
    const prev = job.lines.get(info.multipv);
    // Keep exact scores over bounds at the same depth.
    if (prev && prev.depth === line.depth && !prev.preliminary && line.preliminary) return;
    job.lines.set(info.multipv, line);
    job.opts.onUpdate?.(this.sortedLines(job));
  }

  private sortedLines(job: Job): AnalysisLine[] {
    return [...job.lines.values()].sort((a, b) => a.multipv - b.multipv);
  }

  private finishJob(job: Job, best: string | null) {
    if (job.timer) clearTimeout(job.timer);
    this.job = null;
    const lines = this.sortedLines(job);
    if (job.stopped) {
      job.reject(new EngineError("Analysis was cancelled.", "cancelled"));
    } else {
      job.resolve({ fen: job.opts.fen, bestMove: best, lines, depth: lines[0]?.depth ?? 0, stopped: job.stopped });
    }
    this.pump();
  }

  private pump() {
    if (this.status !== "ready" || this.job || this.queue.length === 0) return;
    const job = this.queue.shift()!;
    this.job = job;
    const multipv = job.opts.multipv ?? 1;
    if (multipv !== this.currentOptions.multipv) {
      this.send(`setoption name MultiPV value ${multipv}`);
      this.currentOptions.multipv = multipv;
    }
    this.send(`position fen ${job.opts.fen}`);
    job.started = true;
    // With both a depth and a time limit, Stockfish stops at whichever comes first.
    const { depth, movetimeMs } = job.opts;
    const go = movetimeMs && depth ? `go depth ${depth} movetime ${movetimeMs}` : movetimeMs ? `go movetime ${movetimeMs}` : `go depth ${depth ?? 12}`;
    this.send(go);
    const budget = (job.opts.movetimeMs ?? 0) + (this.opts.searchGraceMs ?? 30000) + (job.opts.depth ?? 0) * 1500;
    job.timer = setTimeout(() => {
      if (this.job === job) this.handleCrash("The engine stopped responding.");
    }, budget);
  }

  /**
   * Analyse a position. Any running or queued search is cancelled first
   * (their promises reject with kind "cancelled").
   */
  async analyse(opts: AnalyseOptions): Promise<AnalysisResult> {
    if (this.status === "failed") throw new EngineError(this.lastError ?? "Engine unavailable.", "crash");
    await this.init();
    this.cancelAll();
    const turn = opts.fen.split(" ")[1] === "b" ? "b" : "w";
    return new Promise<AnalysisResult>((resolve, reject) => {
      const job: Job = { id: this.nextId++, opts, turn, lines: new Map(), resolve, reject, stopped: false, started: false };
      this.queue.push(job);
      this.pump();
    });
  }

  /** Stop the current search and drop queued ones. */
  cancelAll() {
    for (const q of this.queue) q.reject(new EngineError("Analysis was cancelled.", "cancelled"));
    this.queue = [];
    if (this.job && !this.job.stopped) {
      this.job.stopped = true;
      this.send("stop");
    }
  }

  /** Clear the hash between unrelated games. */
  newGame() {
    if (this.status === "ready") this.send("ucinewgame");
  }

  private handleCrash(message: string) {
    const job = this.job;
    this.job = null;
    if (job?.timer) clearTimeout(job.timer);
    job?.reject(new EngineError(message, "crash"));
    for (const q of this.queue) q.reject(new EngineError(message, "crash"));
    this.queue = [];
    try {
      this.worker?.terminate();
    } catch {}
    this.worker = null;
    this.fail(message);
  }

  private fail(message: string) {
    this.lastError = message;
    this.setStatus("failed", message);
  }

  /** Tear down and start a fresh worker. */
  async restart(): Promise<void> {
    this.terminate();
    this.initPromise = null;
    this.lastError = null;
    this.currentOptions = { multipv: 1 };
    await this.init();
  }

  terminate() {
    const job = this.job;
    this.job = null;
    if (job?.timer) clearTimeout(job.timer);
    job?.reject(new EngineError("Engine stopped.", "cancelled"));
    for (const q of this.queue) q.reject(new EngineError("Engine stopped.", "cancelled"));
    this.queue = [];
    this.lineWaiters = [];
    try {
      this.worker?.terminate();
    } catch {}
    this.worker = null;
    this.initPromise = null;
    this.setStatus("idle");
  }
}

// ---------- Browser singleton ----------

let shared: EngineClient | null = null;

export function getEngine(): EngineClient {
  if (!shared) {
    shared = new EngineClient(() => {
      if (typeof Worker === "undefined") throw new Error("Web Workers are not supported in this browser.");
      // Test hook: allows end-to-end tests to simulate an engine failure.
      const url = (globalThis as { __CHESSPATH_ENGINE_URL__?: string }).__CHESSPATH_ENGINE_URL__ ?? ENGINE_URL;
      return new Worker(url) as unknown as WorkerLike;
    });
  }
  return shared;
}
