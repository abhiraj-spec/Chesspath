import type { GameAnalysis, MistakeTag, MoveEvaluation } from "@/lib/db/types";
import { TAG_TO_SKILL } from "@/lib/learning/mastery";
import { skillInfo } from "@/content/skills";
import { cpFor } from "./classify";

const fmtMove = (e: Pick<MoveEvaluation, "ply" | "color" | "san">, moveNumber: number) => `${moveNumber}${e.color === "w" ? "." : "..."} ${e.san}`;

export function moveNumberOf(e: MoveEvaluation): number {
  const fullmove = Number(e.fenBefore.split(" ")[5] ?? "1");
  return fullmove;
}

const LESSON_TEXT: Record<MistakeTag, string> = {
  "hung-material": "Before every move, check which of your pieces would be left undefended or attacked.",
  "allowed-mate": "Look at your opponent's checks first: your king's safety comes before everything else.",
  "missed-mate": "When the enemy king is exposed, look at every check: forcing moves can lead to mate.",
  "missed-win": "Scan for checks, captures and double attacks before playing a quiet move.",
  "missed-tactic": "A forcing move (check or capture) was stronger here. Always list them first.",
  opening: "In the opening, prioritise development, central control and king safety.",
  endgame: "In endgames, activate your king and calculate pawn races precisely.",
};

/**
 * Plain-language explanation of a significant moment, using only facts derived from the
 * engine's lines and material counts. When no clear idea can be extracted, it says so.
 */
export function explainMoment(e: MoveEvaluation): string {
  const n = moveNumberOf(e);
  const played = fmtMove(e, n);
  const parts: string[] = [];
  const gotWorse = e.classification === "blunder" ? "a serious mistake" : e.classification === "mistake" ? "a mistake" : "an inaccuracy";
  parts.push(`${played} was ${gotWorse}.`);
  if (e.bestSan && e.bestSan !== e.san) {
    const line = e.bestLine.slice(0, 5).join(" ");
    parts.push(`Stronger was ${e.bestSan}${line && e.bestLine.length > 1 ? ` (engine line: ${line})` : ""}.`);
  }
  if (e.tags.includes("missed-mate")) parts.push("The engine had found a forced mate that was missed.");
  if (e.tags.includes("missed-win")) parts.push(`${e.bestSan} would have won material.`);
  if (e.tags.includes("allowed-mate")) parts.push(`After ${e.san}, the opponent has a forced mate${e.replyLine.length ? `, starting with ${e.replyLine[0]}` : ""}.`);
  else if (e.tags.includes("hung-material")) parts.push(`After ${e.san}, the opponent could win material with ${e.replyLine.slice(0, 3).join(" ")}.`);
  else if (e.replyLine.length) parts.push(`The opponent's best reply was ${e.replyLine[0]}.`);
  const before = cpFor(e.before, e.color) / 100;
  const after = cpFor(e.after, e.color) / 100;
  const fmt = (v: number) => (Math.abs(v) >= 10 ? (v > 0 ? "winning" : "losing") : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`);
  parts.push(`For ${e.color === "w" ? "White" : "Black"}, the evaluation went from ${fmt(before)} to ${fmt(after)} (pawn units).`);
  const known = e.tags.filter((t) => t !== "opening" && t !== "endgame");
  if (!known.length) parts.push("ChessPath cannot name the exact idea behind the engine's preference here, so study the line above rather than relying on a summary.");
  const lesson = e.tags.map((t) => LESSON_TEXT[t]).find(Boolean);
  if (lesson) parts.push(`Lesson: ${lesson}`);
  return parts.join(" ");
}

export interface ReportInput {
  evals: MoveEvaluation[];
  result: string;
  userColor: "w" | "b" | null;
  opening?: { eco: string; name: string; ply: number };
}

export function buildReport(input: ReportInput): Pick<GameAnalysis, "summary" | "identifiedMistakes" | "recommendations"> & {
  keyMoments: MoveEvaluation[];
  phases: { phase: string; text: string }[];
  plan: string[];
} {
  const { evals, userColor } = input;
  const mine = userColor ? evals.filter((e) => e.color === userColor) : evals;
  const bad = (e: MoveEvaluation) => e.classification === "inaccuracy" || e.classification === "mistake" || e.classification === "blunder";
  const count = (c: string, list = mine) => list.filter((e) => e.classification === c).length;
  const who = userColor ? "You" : "The players";
  const keyMoments = [...evals.filter((e) => (userColor ? e.color === userColor : true) && (e.classification === "mistake" || e.classification === "blunder"))]
    .sort((a, b) => b.winDrop - a.winDrop)
    .slice(0, 5)
    .sort((a, b) => a.ply - b.ply)
    .map((e) => ({ ...e, explanation: explainMoment(e) }));

  const resultText =
    input.result === "1-0" ? "White won" : input.result === "0-1" ? "Black won" : input.result === "1/2-1/2" ? "The game was drawn" : "The game was not finished";
  const b = count("blunder"),
    m = count("mistake"),
    i = count("inaccuracy");
  const summaryParts = [`${resultText}.`];
  if (b + m + i === 0) summaryParts.push(`${who} made no inaccuracies, mistakes or blunders at this analysis depth. Well played.`);
  else summaryParts.push(`${who} made ${b} blunder${b === 1 ? "" : "s"}, ${m} mistake${m === 1 ? "" : "s"} and ${i} inaccurac${i === 1 ? "y" : "ies"} at this analysis depth.`);
  const tagCounts = new Map<MistakeTag, number>();
  for (const e of mine.filter((x) => x.classification === "mistake" || x.classification === "blunder")) for (const t of e.tags) if (t !== "opening" && t !== "endgame") tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const topTag = [...tagCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topTag) {
    const desc: Record<string, string> = {
      "hung-material": "leaving material undefended",
      "allowed-mate": "allowing a mating attack",
      "missed-mate": "missing a forced mate",
      "missed-win": "missing a tactic that won material",
      "missed-tactic": "missing a stronger forcing move",
    };
    summaryParts.push(`The most costly pattern was ${desc[topTag[0]] ?? topTag[0]} (${topTag[1]}×).`);
  }

  // Phase observations
  const phases: { phase: string; text: string }[] = [];
  const inPhase = (tag: "opening" | "endgame" | "middlegame") =>
    mine.filter((e) => bad(e) && (tag === "middlegame" ? !e.tags.includes("opening") && !e.tags.includes("endgame") : e.tags.includes(tag)));
  const op = inPhase("opening");
  phases.push({
    phase: "Opening",
    text: `${input.opening ? `${input.opening.eco} ${input.opening.name}. ` : ""}${op.length ? `${op.length} inaccurate move${op.length === 1 ? "" : "s"} in the first 20 plies, the first being ${fmtMove(op[0], moveNumberOf(op[0]))}.` : "No significant errors in the opening."}`,
  });
  const mid = inPhase("middlegame");
  phases.push({ phase: "Middlegame", text: mid.length ? `${mid.length} inaccurate move${mid.length === 1 ? "" : "s"}; the costliest was ${fmtMove(mid.sort((a, b) => b.winDrop - a.winDrop)[0], moveNumberOf(mid[0]))}.` : evals.some((e) => !e.tags.includes("opening")) ? "No significant middlegame errors." : "The game ended before the middlegame." });
  const end = inPhase("endgame");
  if (evals.some((e) => e.tags.includes("endgame")) || end.length) phases.push({ phase: "Endgame", text: end.length ? `${end.length} inaccurate move${end.length === 1 ? "" : "s"} in the endgame.` : "No significant endgame errors." });

  // Recommendations from tags
  const recommendations: GameAnalysis["recommendations"] = [];
  for (const [tag, n] of [...tagCounts.entries()].sort((a, b) => b[1] - a[1])) {
    const skill = TAG_TO_SKILL[tag];
    if (!skill) continue;
    const info = skillInfo(skill);
    if (info.lesson) recommendations.push({ kind: "lesson", ref: info.lesson, reason: `${n} key mistake${n === 1 ? "" : "s"} in this game involved ${info.name.toLowerCase()}.` });
    if (info.puzzleTheme) recommendations.push({ kind: "puzzles", ref: info.puzzleTheme, reason: `Practise ${info.name.toLowerCase()} patterns.` });
    if (recommendations.length >= 4) break;
  }
  if (!recommendations.length && op.length >= 2) recommendations.push({ kind: "lesson", ref: "centre-development", reason: "Several opening inaccuracies: review the opening principles." });

  const plan: string[] = [];
  if (topTag) plan.push(LESSON_TEXT[topTag[0]]);
  if (op.length >= 2) plan.push(LESSON_TEXT.opening);
  if (end.length >= 2) plan.push(LESSON_TEXT.endgame);
  if (!plan.length) plan.push("Keep playing and reviewing: no single weakness stood out in this game.");

  return {
    summary: summaryParts.join(" "),
    identifiedMistakes: mine.filter(bad).map((e) => ({ ply: e.ply, classification: e.classification, tags: e.tags })),
    recommendations,
    keyMoments,
    phases,
    plan,
  };
}
