import type { PieceSymbol, Square } from "chess.js";

export type ModuleId = "fundamentals" | "tactics" | "openings" | "strategy" | "calculation" | "endgames" | "practical";

export interface CurriculumModule {
  id: ModuleId;
  letter: string;
  title: string;
  description: string;
  audience: string;
}

export interface Arrow {
  from: Square;
  to: Square;
  kind?: "main" | "alt" | "bad";
}
export interface Mark {
  square: Square;
  kind: "hint" | "good" | "bad" | "target" | "selected";
}

/**
 * Describes which moves count as correct. All provided fields must match (AND).
 * Use `san` for exact answers; use the other fields to accept a whole family of correct moves
 * (e.g. "any checkmate", "any knight move to a highlighted square").
 */
export interface MoveMatcher {
  san?: string[];
  mate?: boolean;
  check?: boolean;
  capture?: boolean;
  from?: Square;
  to?: Square[];
  piece?: PieceSymbol;
  castle?: boolean;
}

export interface PlayMove {
  accept: MoveMatcher;
  /** Opponent's reply (SAN) after a correct move. */
  reply?: string;
  /** Short confirmation shown after this move is played correctly. */
  feedback?: string;
  /** Specific feedback for tempting wrong moves (matched by SAN without +/#). */
  wrong?: { san: string; text: string }[];
}

interface StepBase {
  id: string;
  title?: string;
  /** Assessment steps are scored: solved first time, without hints. */
  assessment?: boolean;
  orientation?: "w" | "b";
}

/** Read-only explanation with an optional board and an optional step-through demonstration. */
export interface ExplainStep extends StepBase {
  kind: "explain";
  text: string[];
  fen?: string;
  arrows?: Arrow[];
  marks?: Mark[];
  /** Demonstration moves in SAN, played from `fen` one at a time with optional notes. */
  demo?: { moves: string[]; notes?: string[] };
}

/** The learner plays one or more moves. */
export interface PlayStep extends StepBase {
  kind: "play";
  fen: string;
  prompt: string;
  moves: PlayMove[];
  hints: string[];
  /** Squares highlighted with the final hint. */
  hintSquares?: Square[];
  /** Drill mode: after each move the same side moves again (the other side "passes"). */
  passTurn?: boolean;
  arrows?: Arrow[];
  marks?: Mark[];
  /** Why the solution works; shown after success. */
  explanation: string;
  /** Feedback for tempting wrong moves on the first move (per-move `wrong` takes precedence). */
  wrong?: { san: string; text: string }[];
  /** Default message for wrong moves without specific feedback. */
  wrongDefault?: string;
  /**
   * Rules exercise (e.g. "escape check by blocking"): the answer is defined by the rules being
   * taught, so the engine-strength check in `npm run validate:content` is skipped.
   */
  rulesOnly?: boolean;
}

/** The learner selects a set of squares (e.g. all legal destinations of a piece). */
export interface SquaresStep extends StepBase {
  kind: "squares";
  fen: string;
  prompt: string;
  /** Explicit squares, or "every legal destination of the piece on this square". */
  targets: Square[] | { legalFrom: Square };
  hints: string[];
  explanation: string;
  marks?: Mark[];
}

export interface ChoiceStep extends StepBase {
  kind: "choice";
  fen?: string;
  arrows?: Arrow[];
  marks?: Mark[];
  question: string;
  options: { text: string; correct?: boolean; feedback: string }[];
  hints?: string[];
  explanation: string;
}

export type GoalType = "checkmate" | "promote" | "hold-draw";

/** Play a position out against Stockfish until a verifiable goal is reached. */
export interface GoalStep extends StepBase {
  kind: "goal";
  fen: string;
  prompt: string;
  goal: GoalType;
  /** Number of the learner's moves allowed. For hold-draw: number of moves to survive. */
  maxMoves: number;
  hints: string[];
  explanation: string;
}

export type LessonStep = ExplainStep | PlayStep | SquaresStep | ChoiceStep | GoalStep;

export interface FollowUp {
  kind: "lesson" | "puzzles" | "play" | "openings" | "drills" | "analysis";
  ref?: string;
  label: string;
}

export interface Lesson {
  id: string;
  module: ModuleId;
  title: string;
  /** 1 = first steps … 5 = advanced */
  difficulty: 1 | 2 | 3 | 4 | 5;
  objective: string;
  summary: string;
  estimatedMinutes: number;
  skills: string[];
  prerequisites?: string[];
  /** Concise introduction (a few short paragraphs). */
  intro: string[];
  steps: LessonStep[];
  recap: string[];
  followUp: FollowUp;
  /** Glossary terms introduced in this lesson. */
  terms?: string[];
}
