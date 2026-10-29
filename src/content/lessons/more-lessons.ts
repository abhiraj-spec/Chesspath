import type { Lesson } from "../types";
import { practice } from "./helpers";

export const openingsPlus: Lesson[] = [
  // ------------------------------------------------------------------ C5
  {
    id: "punishing-opening-mistakes",
    module: "openings",
    title: "Punishing opening mistakes",
    difficulty: 3,
    objective: "Win material or mate when your opponent breaks opening principles.",
    summary: "Real games decided in the first moves.",
    estimatedMinutes: 10,
    skills: ["opening-traps", "opening-principles"],
    prerequisites: ["opening-traps"],
    intro: [
      "Principles exist because breaking them costs something. When your opponent **neglects development, leaves a piece loose, or opens lines towards an uncastled king**, there is often a concrete way to win immediately.",
      "In the opening, check three things after each of your opponent's moves: *Is anything undefended? Is the king still in the centre with lines opening? Did a piece just move twice and leave something behind?*",
      "All positions are from real games in the opening phase, with the winning line confirmed by Stockfish.",
    ],
    steps: practice("opening", [0, 1, 2, 3, 4, 5, 6, 7], {
      idPrefix: "open",
      prompt: "From a real game, in the opening: your opponent just went wrong. Punish it.",
      hint: "What did the last move leave undefended, or which line did it open towards the king?",
      assess: 3,
    }),
    recap: ["Undeveloped pieces and an uncastled king are targets.", "Ask what your opponent's last move left behind.", "Concrete punishment beats general principles when it is there."],
    followUp: { kind: "openings", label: "Study openings in the explorer" },
  },
];

export const calculationPlus: Lesson[] = [
  // ------------------------------------------------------------------ E3
  {
    id: "mate-in-two",
    module: "calculation",
    title: "Calculating mate in two",
    difficulty: 3,
    objective: "Calculate a two-move forced mate, including the defender's best reply.",
    summary: "The first step in calculating a forced line.",
    estimatedMinutes: 12,
    skills: ["mate-in-2", "calculation"],
    prerequisites: ["mating-patterns"],
    intro: [
      "A mate in two means: **after your first move, every defence loses to mate next move.** You must check all of your opponent's replies, not just the one you hope for.",
      "Start with forcing moves: **checks first, then captures, then threats.** A check limits the replies to a few, so it is quick to verify.",
      "Sometimes the first move is quiet: it creates a threat that cannot be parried. Those are the hardest to see, and the most satisfying.",
    ],
    steps: practice("mateIn2", [1, 2, 3, 4, 5, 6, 7, 8], {
      idPrefix: "m2",
      prompt: "From a real game: checkmate in two moves. Play the first move, then finish.",
      hint: "Try every check. For each, list your opponent's replies and look for a mate after each of them.",
      assess: 3,
    }),
    recap: ["Checks, captures, threats: in that order.", "A mate in two must work against every reply.", "If no check works, look for a quiet move with an unstoppable threat."],
    followUp: { kind: "lesson", ref: "mate-in-three", label: "Next: mate in three" },
  },

  // ------------------------------------------------------------------ E4
  {
    id: "mate-in-three",
    module: "calculation",
    title: "Calculating longer mates",
    difficulty: 4,
    objective: "Calculate three-move mating sequences built from forcing moves.",
    summary: "Drive the king into a net, one check at a time.",
    estimatedMinutes: 14,
    skills: ["mate-in-3", "calculation"],
    prerequisites: ["mate-in-two"],
    intro: [
      "Longer mates are calculated the same way as short ones, just further: **each of your moves should leave your opponent as few replies as possible.**",
      "A practical method: picture the **final mating position** first (which pattern could it be?), then work out how to drive the king there.",
      "Sacrifices are common in mates in three: the first move often gives up material to remove a defender or drag the king out.",
    ],
    steps: practice("mateIn3", [0, 1, 2, 3, 4, 5, 6], {
      idPrefix: "m3",
      prompt: "From a real game: force checkmate in three moves.",
      hint: "Picture the mating pattern first, then find the forcing moves that lead to it.",
      assess: 3,
    }),
    recap: ["Picture the final position, then work backwards.", "Keep the opponent's replies to a minimum with checks.", "A sacrifice that forces the king out is often the first move."],
    followUp: { kind: "puzzles", ref: "mate-in-3", label: "Practise: longer mates" },
  },

  // ------------------------------------------------------------------ E5
  {
    id: "quiet-moves",
    module: "calculation",
    title: "Quiet moves",
    difficulty: 4,
    objective: "Find the strong non-forcing move when checks and captures don't work.",
    summary: "Sometimes the winning move is not a check or a capture.",
    estimatedMinutes: 10,
    skills: ["quiet-move", "calculation"],
    prerequisites: ["candidate-moves"],
    intro: [
      "Most tactics start with a check or capture. A **quiet move** does neither: it improves a piece, takes away an escape square, or sets up a threat your opponent cannot meet.",
      "Quiet moves are easy to overlook because the eye looks for forcing moves first. When the forcing moves don't quite work, ask: *what one improvement would make them work?*",
      "Each position below has exactly one clearly winning move, confirmed by Stockfish, and it is quiet.",
    ],
    steps: practice("quietMove", [0, 1, 2, 3, 4, 5], {
      idPrefix: "quiet",
      prompt: "From a real game: the winning move is quiet. Find it.",
      hint: "Checks and captures fail here. Which single improving move creates a threat that can't be stopped?",
      assess: 2,
    }),
    recap: ["When forcing moves fall short, look for the move that makes them work.", "Taking away squares can be stronger than giving check.", "Quiet does not mean slow: the threat must be unstoppable."],
    followUp: { kind: "puzzles", ref: "quiet-move", label: "Practise: quiet-move puzzles" },
  },
];

export const practicalPlus: Lesson[] = [
  // ------------------------------------------------------------------ G3
  {
    id: "defending",
    module: "practical",
    title: "Defending against threats",
    difficulty: 4,
    objective: "Find the one move that parries your opponent's threat.",
    summary: "Half of chess is not losing.",
    estimatedMinutes: 10,
    skills: ["defense", "threat-awareness"],
    prerequisites: ["blunder-check"],
    intro: [
      "Good defence starts with an honest question: **what does my opponent threaten?** Name it precisely: a capture, a check, a mate, a fork.",
      "Then look at the ways to meet it: **move** the target, **defend** it, **block** the line, **capture** the attacker, or create a **bigger counter-threat**.",
      "In these positions from real games, most natural moves lose. Exactly one move holds or wins, confirmed by Stockfish.",
    ],
    steps: practice("defensiveMove", [3, 4, 5, 6, 7, 8], {
      idPrefix: "defend",
      prompt: "From a real game: your opponent has a dangerous threat. Find the move that deals with it.",
      hint: "First name the threat exactly. Then: move, defend, block, capture, or counter-attack.",
      assess: 2,
    }),
    recap: ["Name the threat before choosing a move.", "Five ways to defend: move, guard, block, capture, counter-attack.", "A counter-threat is only a defence if it is bigger."],
    followUp: { kind: "puzzles", ref: "defense", label: "Practise: defensive puzzles" },
  },
];
