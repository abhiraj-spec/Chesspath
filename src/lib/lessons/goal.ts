import type { Chess, Square } from "chess.js";
import type { GoalStep } from "@/content/types";

export type GoalStatus = "playing" | "won" | "failed";

/**
 * Plays a position out against Stockfish and checks the real outcome:
 *  - checkmate: the learner must deliver mate within maxMoves;
 *  - promote: the learner must promote a pawn that cannot be captured immediately;
 *  - hold-draw: the opponent must not promote or mate within maxMoves (a draw by rule also succeeds).
 */
export function evaluateGoal(
  goal: GoalStep["goal"],
  chess: Chess,
  lastMove: { color: "w" | "b"; promotion?: string; to: Square } | null,
  userColor: "w" | "b",
  userMoves: number,
  maxMoves: number,
): { status: GoalStatus; message?: string } {
  const opp = userColor === "w" ? "b" : "w";
  if (chess.isCheckmate()) {
    return chess.turn() === opp
      ? goal === "checkmate" || goal === "hold-draw"
        ? { status: "won", message: "Checkmate! Goal achieved." }
        : { status: "won", message: "Checkmate!" }
      : { status: "failed", message: "You were checkmated." };
  }
  if (chess.isStalemate()) return goal === "hold-draw" ? { status: "won", message: "Stalemate: a draw. You held." } : { status: "failed", message: "Stalemate! The game is drawn. Leave the king a square until you can mate." };
  if (chess.isDraw()) {
    return goal === "hold-draw" ? { status: "won", message: "The game is drawn. You held the position." } : { status: "failed", message: "The game ended in a draw." };
  }
  if (lastMove?.promotion) {
    if (lastMove.color === userColor && goal === "promote") {
      const attacked = chess.isAttacked(lastMove.to, opp);
      const defended = chess.attackers(lastMove.to, userColor).length > 0;
      if (attacked && !defended) return { status: "failed", message: "You promoted, but the new piece can be captured immediately." };
      return { status: "won", message: "Promoted, and the new piece is safe. Goal achieved." };
    }
    if (lastMove.color === opp && goal === "hold-draw") return { status: "failed", message: "Your opponent promoted the pawn." };
  }
  if (lastMove?.color === userColor && userMoves >= maxMoves) {
    return goal === "hold-draw" ? { status: "won", message: `You held for ${maxMoves} moves without letting the pawn through.` } : { status: "failed", message: `Out of moves: the goal was not reached within ${maxMoves} moves.` };
  }
  return { status: "playing" };
}

