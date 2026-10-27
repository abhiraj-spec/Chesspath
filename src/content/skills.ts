/**
 * Skill catalogue. Every lesson exercise, puzzle and analysed mistake is tagged with skills,
 * which is how ChessPath connects performance to recommendations.
 */
export interface SkillInfo {
  id: string;
  name: string;
  /** Lesson that teaches this skill. */
  lesson?: string;
  /** Puzzle theme to practise it (matches puzzle.theme / puzzle.skills). */
  puzzleTheme?: string;
  group: "Rules" | "Tactics" | "Checkmates" | "Openings" | "Strategy" | "Calculation" | "Endgames";
}

export const SKILLS: SkillInfo[] = [
  { id: "board", name: "Board and coordinates", lesson: "board-coordinates", group: "Rules" },
  { id: "piece-movement", name: "How the pieces move", lesson: "the-knight", group: "Rules" },
  { id: "check", name: "Check and escaping check", lesson: "check", group: "Rules" },
  { id: "checkmate-basics", name: "Checkmate vs stalemate", lesson: "checkmate-stalemate", group: "Rules" },
  { id: "special-moves", name: "Castling, en passant, promotion", lesson: "castling", group: "Rules" },
  { id: "draws", name: "Draw rules", lesson: "draws", group: "Rules" },
  { id: "notation", name: "Reading chess notation", lesson: "notation", group: "Rules" },

  { id: "hanging-piece", name: "Hanging pieces", lesson: "hanging-pieces", puzzleTheme: "hanging-piece", group: "Tactics" },
  { id: "threat-awareness", name: "Spotting your opponent's threats", lesson: "hanging-pieces", puzzleTheme: "defense", group: "Tactics" },
  { id: "fork", name: "Forks", lesson: "forks", puzzleTheme: "fork", group: "Tactics" },
  { id: "pin", name: "Pins", lesson: "pins", puzzleTheme: "pin", group: "Tactics" },
  { id: "skewer", name: "Skewers", lesson: "skewers", puzzleTheme: "skewer", group: "Tactics" },
  { id: "discovered-attack", name: "Discovered attacks", lesson: "discovered-attacks", puzzleTheme: "discovered-attack", group: "Tactics" },
  { id: "double-check", name: "Double check", lesson: "discovered-attacks", puzzleTheme: "double-check", group: "Tactics" },
  { id: "remove-defender", name: "Removing the defender", lesson: "defender-tactics", puzzleTheme: "remove-defender", group: "Tactics" },
  { id: "deflection", name: "Deflection", lesson: "defender-tactics", puzzleTheme: "deflection", group: "Tactics" },
  { id: "decoy", name: "Decoy (attraction)", lesson: "defender-tactics", puzzleTheme: "decoy", group: "Tactics" },
  { id: "intermezzo", name: "Intermediate moves", lesson: "zwischenzug", puzzleTheme: "intermezzo", group: "Tactics" },
  { id: "trapped-piece", name: "Trapped pieces", lesson: "hanging-pieces", puzzleTheme: "trapped-piece", group: "Tactics" },
  { id: "x-ray", name: "X-ray attacks", lesson: "skewers", puzzleTheme: "x-ray", group: "Tactics" },
  { id: "clearance", name: "Clearance", lesson: "discovered-attacks", puzzleTheme: "clearance", group: "Tactics" },
  { id: "interference", name: "Interference", lesson: "defender-tactics", puzzleTheme: "interference", group: "Tactics" },
  { id: "sacrifice", name: "Sacrifices", lesson: "defender-tactics", puzzleTheme: "sacrifice", group: "Tactics" },
  { id: "quiet-move", name: "Quiet moves", lesson: "candidate-moves", puzzleTheme: "quiet-move", group: "Calculation" },
  { id: "defense", name: "Defensive moves", lesson: "thinking-routine", puzzleTheme: "defense", group: "Calculation" },

  { id: "mate-in-1", name: "Mate in one", lesson: "checkmate-stalemate", puzzleTheme: "mate-in-1", group: "Checkmates" },
  { id: "mate-in-2", name: "Mate in two", lesson: "mating-patterns", puzzleTheme: "mate-in-2", group: "Checkmates" },
  { id: "mate-in-3", name: "Longer mates", lesson: "mating-patterns", puzzleTheme: "mate-in-3", group: "Checkmates" },
  { id: "back-rank", name: "Back-rank mates", lesson: "back-rank", puzzleTheme: "back-rank", group: "Checkmates" },
  { id: "smothered-mate", name: "Smothered mate", lesson: "mating-patterns", puzzleTheme: "smothered-mate", group: "Checkmates" },

  { id: "opening-principles", name: "Opening principles", lesson: "centre-development", group: "Openings" },
  { id: "king-safety", name: "King safety", lesson: "king-safety-castling", group: "Openings" },
  { id: "opening-traps", name: "Opening traps", lesson: "opening-traps", group: "Openings" },

  { id: "pawn-structure", name: "Pawn structure", lesson: "pawn-structure", group: "Strategy" },
  { id: "piece-activity", name: "Piece activity and outposts", lesson: "outposts-bishops", group: "Strategy" },
  { id: "open-files", name: "Open files and rooks", lesson: "open-files", group: "Strategy" },
  { id: "exchanges", name: "Exchanges and prophylaxis", lesson: "exchanges-prophylaxis", group: "Strategy" },

  { id: "calculation", name: "Calculation routine", lesson: "thinking-routine", group: "Calculation" },
  { id: "candidate-moves", name: "Candidate moves", lesson: "candidate-moves", group: "Calculation" },
  { id: "blunder-check", name: "Blunder checking", lesson: "blunder-check", group: "Calculation" },

  { id: "basic-mates", name: "Basic checkmates (Q and R)", lesson: "queen-mate", group: "Endgames" },
  { id: "opposition", name: "Opposition and key squares", lesson: "opposition", group: "Endgames" },
  { id: "pawn-races", name: "Square of the pawn and races", lesson: "square-of-pawn", group: "Endgames" },
  { id: "rook-endgames", name: "Rook endgames", lesson: "rook-endgames", group: "Endgames" },
  { id: "promotion", name: "Promoting pawns", lesson: "en-passant-promotion", puzzleTheme: "promotion", group: "Endgames" },
  { id: "endgame-technique", name: "Endgame technique", lesson: "opposition", puzzleTheme: "endgame-technique", group: "Endgames" },
];

const byId = new Map(SKILLS.map((s) => [s.id, s]));

export function skillInfo(id: string): SkillInfo {
  return byId.get(id) ?? { id, name: id.replace(/-/g, " "), group: "Tactics" };
}
