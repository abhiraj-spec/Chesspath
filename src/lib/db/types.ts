import type { GameResult, TerminalReason } from "@/lib/chess/status";

export type SkillLevel = "complete-beginner" | "beginner" | "intermediate" | "advanced";
export type LearningGoal =
  | "from-scratch"
  | "tactics"
  | "rapid-classical"
  | "openings"
  | "positional"
  | "endgames"
  | "tournaments"
  | "overall";

export interface UserProfile {
  id: "me";
  displayName: string;
  skillLevel: SkillLevel;
  learningGoals: LearningGoal[];
  dailyTargetMinutes: 10 | 15 | 30 | 60;
  onboardingCompleted: boolean;
  /** Result of the optional diagnostic, if taken. */
  diagnostic?: DiagnosticResult;
  createdAt: number;
  updatedAt: number;
}

export interface DiagnosticResult {
  takenAt: number;
  answers: { id: string; correct: boolean; skill: string }[];
  recommendedLessonId: string;
  summary: string;
}

export type LessonStatus = "not-started" | "in-progress" | "completed";

export interface LessonProgress {
  lessonId: string;
  status: LessonStatus;
  /** Index of the step the learner should resume at. */
  currentStep: number;
  /** Steps the learner has finished in the current run. */
  completedSteps: number[];
  attempts: number;
  /** Assessment score 0-100 for the best completed run. */
  score?: number;
  lastScore?: number;
  completionDate?: number;
  timeSpentMs: number;
  hintsUsed: number;
  mistakes: number;
  startedAt: number;
  updatedAt: number;
}

/** One graded exercise: a puzzle, a lesson assessment step, a drill, an opening recall or a diagnostic question. */
export type AttemptKind = "puzzle" | "lesson" | "drill" | "opening" | "diagnostic";

export interface Attempt {
  id?: number;
  kind: AttemptKind;
  refId: string;
  /** Skill identifiers this attempt provides evidence for (e.g. "fork", "mate-in-1"). */
  skills: string[];
  difficulty?: number;
  solved: boolean;
  /** Solved on the first try with no hints. */
  clean: boolean;
  mistakes: number;
  hintsUsed: number;
  revealed: boolean;
  skipped: boolean;
  durationMs: number;
  /** True when this attempt was a scheduled spaced-repetition review. */
  wasReview: boolean;
  createdAt: number;
}

export type ReviewKind = "puzzle" | "opening" | "lesson";

/** A spaced-repetition card. id = `${kind}:${refId}` */
export interface ReviewCard {
  id: string;
  kind: ReviewKind;
  refId: string;
  skills: string[];
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
  dueAt: number;
  lastReviewedAt: number;
  lastResult: "fail" | "hard" | "good";
  /** Plain-language reason shown to the learner. */
  reason: string;
  createdAt: number;
}

export type GameSource = "computer" | "import";
export type GameStatus = "in-progress" | "finished";

export interface ChessGameRecord {
  id: string;
  whitePlayer: string;
  blackPlayer: string;
  result: GameResult;
  terminalReason?: TerminalReason;
  status: GameStatus;
  pgn: string;
  startingFen: string;
  moves: string[];
  createdAt: number;
  updatedAt: number;
  source: GameSource;
  /** Only for games against the computer. */
  computer?: { level: number; userColor: "w" | "b" };
  headers?: Record<string, string>;
  analysisStatus: "none" | "partial" | "complete";
  /** For imported games: which side the user played, if any. */
  userColor?: "w" | "b";
  /** Number of takebacks used (computer games). */
  takebacks?: number;
}

export interface EngineScore {
  /** Centipawns from White's point of view (undefined when mate). */
  cp?: number;
  /** Mate in N from White's point of view (positive = White mates). */
  mate?: number;
}

export interface MoveEvaluation {
  ply: number;
  san: string;
  uci: string;
  color: "w" | "b";
  fenBefore: string;
  /** Evaluation of the position before the move (best play), White POV. */
  before: EngineScore;
  /** Evaluation after the move that was played, White POV. */
  after: EngineScore;
  bestMove: string;
  bestSan: string;
  bestLine: string[];
  /** Engine's best reply after the move played (the opponent's threat), as SAN line. */
  replyLine: string[];
  depth: number;
  cpLoss: number;
  /** Change in win probability (0-100 scale) for the mover. */
  winDrop: number;
  classification: MoveClass;
  tags: MistakeTag[];
  explanation?: string;
}

export type MoveClass = "best" | "good" | "inaccuracy" | "mistake" | "blunder" | "book";
export type MistakeTag = "hung-material" | "missed-mate" | "missed-win" | "allowed-mate" | "missed-tactic" | "opening" | "endgame";

export interface GameAnalysis {
  gameId: string;
  engineVersion: string;
  analysisSettings: { depth: number; thresholds: { inaccuracy: number; mistake: number; blunder: number } };
  moveEvaluations: MoveEvaluation[];
  identifiedMistakes: { ply: number; classification: MoveClass; tags: MistakeTag[] }[];
  recommendations: { kind: "lesson" | "puzzles"; ref: string; reason: string }[];
  summary: string;
  opening?: { eco: string; name: string; ply: number };
  accuracy?: { w: number; b: number };
  complete: boolean;
  /** Raw per-position engine results (White POV), kept so interrupted analysis can resume. */
  positionEvals?: { fen: string; score: EngineScore; bestMove: string | null; pv: string[]; depth: number }[];
  createdAt: number;
}

export interface OpeningProgress {
  /** `${openingId}:${variationId}` */
  id: string;
  openingId: string;
  variationId: string;
  recallAttempts: number;
  successfulRecalls: number;
  lastReviewedAt?: number;
  nextReviewAt?: number;
  bestStreak: number;
}

export interface ActivityEntry {
  type: "lesson" | "puzzles" | "review" | "game" | "analysis" | "opening" | "drill";
  refId?: string;
  durationMs: number;
  at: number;
}

/** id = local date "YYYY-MM-DD" */
export interface TrainingSession {
  id: string;
  sessionDate: string;
  activities: ActivityEntry[];
  duration: number;
  completionStatus: "partial" | "target-met";
}

export type EventType =
  | "lesson_started"
  | "lesson_completed"
  | "lesson_resumed"
  | "puzzle_attempted"
  | "puzzle_solved"
  | "hint_used"
  | "game_completed"
  | "game_reviewed"
  | "weakness_improved"
  | "training_target_met"
  | "onboarding_completed";

export interface AppEvent {
  id?: number;
  type: EventType;
  refId?: string;
  at: number;
  data?: Record<string, unknown>;
}

export interface KvRecord {
  key: string;
  value: unknown;
  updatedAt: number;
}
