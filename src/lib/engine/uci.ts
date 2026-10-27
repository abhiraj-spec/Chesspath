/** UCI protocol parsing helpers (pure functions, unit-tested). */

export interface Score {
  /** Centipawns, from the side-to-move's point of view (raw engine output) or White's (normalised). */
  cp?: number;
  /** Mate in N moves (positive: the reference side mates). */
  mate?: number;
}

export interface InfoLine {
  depth: number;
  seldepth?: number;
  multipv: number;
  score: Score;
  /** "lowerbound"/"upperbound" lines are preliminary and should not be shown as final. */
  bound?: "lower" | "upper";
  nodes?: number;
  nps?: number;
  timeMs?: number;
  pv: string[];
}

export function parseInfo(line: string): InfoLine | null {
  if (!line.startsWith("info ")) return null;
  const tokens = line.split(/\s+/);
  const out: Partial<InfoLine> & { pv?: string[] } = { multipv: 1 };
  let hasScore = false;
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t) {
      case "depth":
        out.depth = Number(tokens[++i]);
        break;
      case "seldepth":
        out.seldepth = Number(tokens[++i]);
        break;
      case "multipv":
        out.multipv = Number(tokens[++i]);
        break;
      case "nodes":
        out.nodes = Number(tokens[++i]);
        break;
      case "nps":
        out.nps = Number(tokens[++i]);
        break;
      case "time":
        out.timeMs = Number(tokens[++i]);
        break;
      case "score": {
        const kind = tokens[++i];
        const v = Number(tokens[++i]);
        if (kind === "cp") out.score = { cp: v };
        else if (kind === "mate") out.score = { mate: v };
        hasScore = true;
        if (tokens[i + 1] === "lowerbound") {
          out.bound = "lower";
          i++;
        } else if (tokens[i + 1] === "upperbound") {
          out.bound = "upper";
          i++;
        }
        break;
      }
      case "pv":
        out.pv = tokens.slice(i + 1).filter(Boolean);
        i = tokens.length;
        break;
      case "string":
        return null;
      default:
        break;
    }
  }
  if (!hasScore || out.depth === undefined || !out.pv || out.pv.length === 0) return null;
  return out as InfoLine;
}

export function parseBestMove(line: string): { best: string | null; ponder?: string } | null {
  const m = /^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/.exec(line);
  if (!m) return null;
  return { best: m[1] === "(none)" || m[1] === "0000" ? null : m[1], ponder: m[2] };
}

/** Convert a side-to-move score into White's point of view. */
export function toWhitePov(score: Score, turn: "w" | "b"): Score {
  if (turn === "w") return { ...score };
  return {
    cp: score.cp !== undefined ? -score.cp : undefined,
    mate: score.mate !== undefined ? -score.mate : undefined,
  };
}

/** A single comparable number. Mates are mapped beyond any centipawn score; shorter mates rank higher. */
export function scoreToNumber(s: Score): number {
  if (s.mate !== undefined) {
    if (s.mate === 0) return -100000; // side to move is mated
    return s.mate > 0 ? 100000 - s.mate * 10 : -100000 - s.mate * 10;
  }
  return s.cp ?? 0;
}

/** Human-readable evaluation, White POV: "+1.25", "−0.40", "#3", "#-2". */
export function formatScore(s: Score | undefined): string {
  if (!s) return "–";
  if (s.mate !== undefined) return s.mate === 0 ? "#" : `#${s.mate}`;
  const v = (s.cp ?? 0) / 100;
  if (Math.abs(v) < 0.005) return "0.00";
  return `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`;
}

/**
 * Expected score / win probability for White (0..1) from a White-POV score.
 * Uses the logistic model published by Lichess for its accuracy metric.
 */
export function winProbability(s: Score): number {
  if (s.mate !== undefined) return s.mate > 0 ? 1 : s.mate < 0 ? 0 : 0.5;
  const cp = Math.max(-1000, Math.min(1000, s.cp ?? 0));
  return 1 / (1 + Math.exp(-0.00368208 * cp));
}
