import { setup } from "@/lib/chess/setup";
import type { GoalStep } from "./types";

/**
 * Endgame drills: positions played out against Stockfish until a verifiable goal is reached.
 * Each start position is checked with the engine (tests/content) to confirm the goal is
 * achievable with best play.
 */
export interface Drill {
  id: string;
  title: string;
  description: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  skills: string[];
  lesson?: string;
  step: GoalStep;
}

export const DRILLS: Drill[] = [
  {
    id: "queen-mate-centre",
    title: "Queen mate from the centre",
    description: "King and queen against a centralised king.",
    difficulty: 2,
    skills: ["basic-mates"],
    lesson: "queen-mate",
    step: {
      id: "drill",
      kind: "goal",
      fen: setup({ white: "Kb1 Qh1", black: "Kd4" }),
      prompt: "Checkmate the black king within 20 moves.",
      goal: "checkmate",
      maxMoves: 20,
      hints: ["Shrink the box with quiet queen moves a knight's jump from the king.", "Bring your king closer once the black king is on the edge.", "Watch out for stalemate."],
      explanation: "Box, approach, mate: the same three phases every time.",
    },
  },
  {
    id: "rook-mate",
    title: "Rook mate",
    description: "King and rook against king: the essential technique.",
    difficulty: 3,
    skills: ["basic-mates", "opposition"],
    lesson: "rook-mate",
    step: {
      id: "drill",
      kind: "goal",
      fen: setup({ white: "Kc2 Ra1", black: "Ke4" }),
      prompt: "Checkmate the black king within 30 moves.",
      goal: "checkmate",
      maxMoves: 30,
      hints: ["Use the rook to cut the king off along a rank or file.", "Bring your king up; check when the kings stand in opposition.", "If the king attacks your rook, move the rook far away along the same line."],
      explanation: "Patience and geometry: the rook fences, the king pushes.",
    },
  },
  {
    id: "two-rooks",
    title: "Ladder mate with two rooks",
    description: "Two rooks mate without help from the king.",
    difficulty: 1,
    skills: ["basic-mates", "mate-in-1"],
    lesson: "mating-patterns",
    step: {
      id: "drill",
      kind: "goal",
      fen: setup({ white: "Kg1 Ra2 Rb1", black: "Ke5" }),
      prompt: "Checkmate the black king within 12 moves using the rook ladder.",
      goal: "checkmate",
      maxMoves: 12,
      hints: ["One rook guards a rank while the other checks on the next one.", "If the king approaches a rook, move that rook to the far side of the board."],
      explanation: "The rooks leapfrog each other, pushing the king rank by rank to the edge.",
    },
  },
  {
    id: "key-squares",
    title: "King and pawn: reach the key squares",
    description: "Promote a pawn against a defending king.",
    difficulty: 3,
    skills: ["opposition", "endgame-technique", "promotion"],
    lesson: "opposition",
    step: {
      id: "drill",
      kind: "goal",
      fen: setup({ white: "Ke4 Pe3", black: "Ke7" }),
      prompt: "Promote the pawn (the new queen must be safe) within 15 moves.",
      goal: "promote",
      maxMoves: 15,
      hints: ["Lead with the king, not the pawn.", "Aim for the key squares in front of your pawn.", "Use the opposition to force the black king to give way."],
      explanation: "With the king in front of the pawn and the opposition, the pawn walks through.",
    },
  },
  {
    id: "catch-the-pawn",
    title: "Catch the runaway pawn",
    description: "Use the square of the pawn to stop a passed pawn.",
    difficulty: 2,
    skills: ["pawn-races"],
    lesson: "square-of-pawn",
    step: {
      id: "drill",
      kind: "goal",
      fen: setup({ white: "Kg4", black: "Kh8 Pb5" }),
      prompt: "Stop the b-pawn: survive 8 moves without it promoting.",
      goal: "hold-draw",
      maxMoves: 8,
      hints: ["Draw the square from b5 to b1.", "Step diagonally towards the pawn to enter the square."],
      explanation: "Entering the square in time is all it takes.",
    },
  },
  {
    id: "rook-pawn-fortress",
    title: "Hold the draw against a rook's pawn",
    description: "A king in the corner draws against king and a-pawn.",
    difficulty: 3,
    skills: ["opposition", "endgame-technique", "draws"],
    lesson: "rook-endgames",
    step: {
      id: "drill",
      kind: "goal",
      fen: setup({ white: "Kc5 Pa4", black: "Kc7", turn: "b" }),
      prompt: "You are Black. Keep the a-pawn from promoting for 15 moves (or reach a draw).",
      goal: "hold-draw",
      maxMoves: 15,
      hints: ["Head for the corner the pawn is running to: a8.", "Once your king is on a8/b8/a7, the white king can never drive it out without stalemate."],
      explanation: "Against a rook's pawn, a defending king that reaches the corner draws: the attacker can only stalemate it.",
    },
  },
];

export function getDrill(id: string): Drill | undefined {
  return DRILLS.find((d) => d.id === id);
}
