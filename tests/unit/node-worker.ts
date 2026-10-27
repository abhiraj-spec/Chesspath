import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import type { WorkerLike } from "@/lib/engine/client";

const require = createRequire(import.meta.url);

/** Runs the real Stockfish build in a child process behind the WorkerLike interface. */
export function nodeStockfishWorker(): WorkerLike {
  const enginePath = require("stockfish").findEngine("lite-single");
  const child = spawn(process.execPath, [enginePath], { stdio: "pipe" });
  let buf = "";
  const w: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage(msg: string) {
      child.stdin.write(msg + "\n");
    },
    terminate() {
      child.kill();
    },
  };
  child.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      w.onmessage?.({ data: line });
    }
  });
  child.on("error", (e) => w.onerror?.(e));
  return w;
}
