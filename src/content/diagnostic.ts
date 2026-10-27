import { setup } from "@/lib/chess/setup";
import type { LessonStep } from "./types";

/**
 * Optional placement check used during onboarding. Each item tests one skill.
 * The result only recommends a starting lesson. It is not a rating.
 */
export interface DiagnosticItem {
  id: string;
  skill: string;
  /** Short description of what a miss means, used in the summary. */
  missText: string;
  /** Lesson to start with if this item is missed. Items are ordered by priority. */
  lessonIfMissed: string;
  step: LessonStep;
}

export const DIAGNOSTIC: DiagnosticItem[] = [
  {
    id: "knight",
    skill: "piece-movement",
    missText: "how the knight moves",
    lessonIfMissed: "the-rook",
    step: {
      id: "d-knight",
      kind: "squares",
      fen: setup({ white: "Kh1 Ne4", black: "Ka8" }),
      prompt: "Click every square the knight on e4 can move to.",
      targets: { legalFrom: "e4" },
      hints: ["Knights move in an L-shape: two squares one way, then one to the side."],
      explanation: "From e4 the knight reaches c3, c5, d2, d6, f2, f6, g3 and g5.",
    },
  },
  {
    id: "mate-or-stalemate",
    skill: "checkmate-basics",
    missText: "the difference between checkmate and stalemate",
    lessonIfMissed: "check",
    step: {
      id: "d-stalemate",
      kind: "choice",
      fen: setup({ white: "Kb6 Qc7", black: "Ka8", turn: "b" }),
      question: "Black to move. What is the result?",
      options: [
        { text: "Draw by stalemate", correct: true, feedback: "Correct: Black is not in check and has no legal move." },
        { text: "White wins by checkmate", feedback: "Black is not in check, so this is stalemate: a draw." },
        { text: "The game continues", feedback: "Black has no legal moves, so the game is over: stalemate." },
      ],
      explanation: "No check + no legal move = stalemate (draw).",
    },
  },
  {
    id: "hanging",
    skill: "hanging-piece",
    missText: "a free piece",
    lessonIfMissed: "hanging-pieces",
    step: {
      id: "d-hanging",
      kind: "play",
      fen: setup({ white: "Kg1 Qd1", black: "Kg8 Ra4 Nd6 Pe7" }),
      prompt: "White to move. Win material.",
      moves: [{ accept: { san: ["Qxa4"] } }],
      hints: ["Is any black piece undefended?"],
      explanation: "The rook on a4 was undefended. The knight was protected by the e7 pawn.",
    },
  },
  {
    id: "mate1",
    skill: "mate-in-1",
    missText: "a mate in one",
    lessonIfMissed: "checkmate-stalemate",
    step: {
      id: "d-mate",
      kind: "play",
      fen: setup({ white: "Kg1 Re1 Pf2 Pg2 Ph2", black: "Kg8 Pf7 Pg7 Ph7 Qb6" }),
      prompt: "White to move. Find checkmate in one.",
      moves: [{ accept: { mate: true } }],
      hints: ["Black's king is trapped behind its own pawns."],
      explanation: "Re8# is a back-rank mate.",
    },
  },
  {
    id: "fork",
    skill: "fork",
    missText: "a knight fork",
    lessonIfMissed: "forks",
    step: {
      id: "d-fork",
      kind: "play",
      fen: setup({ white: "Kg1 Nd5 Pf2 Pg2 Ph2", black: "Kg8 Qc8 Pf7 Pg7 Ph7" }),
      prompt: "White to move. Win the black queen.",
      moves: [{ accept: { san: ["Ne7+"] } }],
      hints: ["Look for a knight check that also attacks another piece."],
      explanation: "Ne7+ forks king and queen.",
    },
  },
  {
    id: "threat",
    skill: "threat-awareness",
    missText: "your opponent's threat",
    lessonIfMissed: "back-rank",
    step: {
      id: "d-threat",
      kind: "choice",
      fen: setup({ white: "Kg1 Qd1 Pa2 Pb2 Pf2 Pg2 Ph2", black: "Kg8 Re8 Bd7 Pa7 Pb7 Pf7 Pg7 Ph7" }),
      question: "White to move. Is it a good idea to capture the bishop with Qxd7?",
      options: [
        { text: "No: after Qxd7, ...Re1 is checkmate", correct: true, feedback: "Exactly: the queen must keep guarding the back rank." },
        { text: "Yes: it wins a free bishop", feedback: "It looks free, but ...Re1 would be checkmate because your king has no escape square." },
      ],
      explanation: "Always check what your opponent can do after your move: here, a back-rank mate.",
    },
  },
];

export interface DiagnosticAnswer {
  id: string;
  correct: boolean;
  skill: string;
}

/** Turn answers into a starting lesson and a plain-language summary grounded in the answers. */
export function diagnose(answers: DiagnosticAnswer[]): { lessonId: string; summary: string } {
  const missed = DIAGNOSTIC.filter((d) => answers.find((a) => a.id === d.id && !a.correct));
  const right = DIAGNOSTIC.filter((d) => answers.find((a) => a.id === d.id && a.correct));
  const correctCount = right.length;
  if (missed.length === 0) {
    return { lessonId: "discovered-attacks", summary: `You answered all ${DIAGNOSTIC.length} checks correctly, so the basic tactics are in place. Start with discovered attacks and use the adaptive puzzles to find your level.` };
  }
  const first = missed[0];
  const basics = missed.some((m) => m.id === "knight" || m.id === "mate-or-stalemate");
  const knows = right.length ? `You got ${correctCount} of ${DIAGNOSTIC.length} right` : `These were new to you`;
  const missList = missed.map((m) => m.missText);
  const missPhrase = missList.length === 1 ? missList[0] : `${missList.slice(0, -1).join(", ")} and ${missList.at(-1)}`;
  const summary = basics
    ? `${knows}. You missed ${missPhrase}, so it's worth securing the rules first. Start with the fundamentals; they go quickly if you already know some of it.`
    : `${knows}: you know how the pieces move, but you missed ${missPhrase}. Start there.`;
  return { lessonId: first.lessonIfMissed, summary };
}
