import { setup } from "@/lib/chess/setup";
import type { Lesson } from "../types";
import { fenAfter, fromPool } from "./helpers";

export const calculation: Lesson[] = [
  // ------------------------------------------------------------------ E1
  {
    id: "thinking-routine",
    module: "calculation",
    title: "A thinking routine: checks, captures, threats",
    difficulty: 3,
    objective: "Use a repeatable checklist before every move.",
    summary: "The habit that prevents most blunders.",
    estimatedMinutes: 7,
    skills: ["calculation", "threat-awareness", "defense"],
    prerequisites: ["hanging-pieces"],
    terms: ["forcing move", "candidate move"],
    intro: [
      "Strong players follow a routine. Before each move: **(1)** what did my opponent's last move change, and what does it threaten? **(2)** List forcing moves for both sides: **checks, captures and threats**. **(3)** Pick a few candidate moves. **(4)** For each, calculate the opponent's strongest reply. **(5)** Evaluate the result. **(6)** Before you move, check that nothing is left hanging.",
      "Forcing moves come first because they limit your opponent's choices and are the easiest to calculate.",
    ],
    steps: [
      {
        id: "list-captures",
        kind: "squares",
        fen: setup({
          white: "Kg1 Qd1 Nf3 Bc4 Pe4 Pf2 Pg2 Ph2",
          black: "Kg8 Bg4 Nd4 Pe5 Pf7 Pg7 Ph7",
        }),
        prompt: "Step 2 of the routine: click every black piece or pawn that White can capture right now.",
        targets: ["d4", "e5", "f7"],
        hints: ["Go through each of your pieces and look at what it attacks.", "The knight, the bishop and the queen all have captures."],
        explanation: "Nxd4 or Qxd4, Nxe5 and Bxf7+ are all possible captures. The bishop on g4 is safe: your own knight blocks the queen's diagonal. Listing them all is the first step; then you calculate which ones work.",
      },
      fromPool("defensiveMove", 0, {
        id: "pool-defence-1",
        prompt: "From a real game: first ask what your opponent threatens. Then find the best move.",
        hint: "Before looking for your own ideas, identify the threat.",
      }),
      {
        id: "routine-order",
        kind: "choice",
        question: "What should you check first when it is your move?",
        options: [
          { text: "What my opponent's last move threatens", correct: true, feedback: "Right: most blunders come from ignoring the opponent's threat." },
          { text: "Which of my pieces looks most active", feedback: "Useful, but only after you know what your opponent threatens." },
          { text: "Which opening line I know", feedback: "Memory helps, but threats come first." },
        ],
        explanation: "Threat first, then forcing moves, then candidates.",
      },
      fromPool("defensiveMove", 1, {
        id: "pool-defence-2",
        prompt: "From a real game: deal with the threat accurately.",
        hint: "List your opponent's checks, captures and threats before choosing.",
        assessment: true,
      }),
      {
        id: "forcing-first",
        kind: "choice",
        assessment: true,
        question: "Why should you examine checks and captures before quiet moves?",
        options: [
          { text: "They limit the opponent's replies, so they are easier to calculate and often decisive", correct: true, feedback: "Correct." },
          { text: "Quiet moves are never good", feedback: "Quiet moves are often best. Forcing moves are just checked first." },
          { text: "The rules require it", feedback: "It is a thinking habit, not a rule." },
        ],
        explanation: "Forcing moves narrow the tree of possibilities, which makes accurate calculation feasible.",
      },
    ],
    recap: ["Threat check first.", "Then checks, captures and threats for both sides.", "Calculate the opponent's best reply; blunder-check before moving."],
    followUp: { kind: "lesson", ref: "candidate-moves", label: "Next: candidate moves" },
  },

  // ------------------------------------------------------------------ E2
  {
    id: "candidate-moves",
    module: "calculation",
    title: "Candidate moves and the opponent's best reply",
    difficulty: 3,
    objective: "Compare several candidate moves and refute tempting ones by finding the opponent's best reply.",
    summary: "Don't fall in love with the first good-looking move.",
    estimatedMinutes: 7,
    skills: ["candidate-moves", "calculation", "quiet-move"],
    prerequisites: ["thinking-routine"],
    intro: [
      "A **candidate move** is a move worth calculating. Write down two or three before calculating any of them deeply, so the first attractive idea does not blind you.",
      "For each candidate, assume your opponent finds their best reply. A move that only works if the opponent errs is a gamble.",
    ],
    steps: [
      {
        id: "blackburne-reply",
        kind: "choice",
        fen: fenAfter("e4 e5 Nf3 Nc6 Bc4 Nd4"),
        question: "White is tempted by 4. Nxe5, grabbing a pawn. What is Black's strongest reply?",
        options: [
          { text: "4...Qg5, attacking the knight and g2", correct: true, feedback: "Right: the queen hits the e5 knight and the g2 pawn at once." },
          { text: "4...d6, chasing the knight", feedback: "That is playable, but there is a much stronger move." },
          { text: "4...Nf6, developing", feedback: "Natural, but it misses the double attack." },
        ],
        explanation: "After 4. Nxe5? Qg5! White struggles: 5. Nxf7?? Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3# is a famous trap. This is why you calculate the opponent's best reply.",
      },
      {
        id: "blackburne-safe",
        kind: "play",
        fen: fenAfter("e4 e5 Nf3 Nc6 Bc4 Nd4"),
        prompt: "Now choose a sound move for White.",
        moves: [{ accept: { san: ["Nxd4", "c3", "O-O", "Nc3", "d3"] }, feedback: "Solid. You avoided the trap." }],
        wrong: [{ san: "Nxe5", text: "This is the tempting candidate, but 4...Qg5! attacks e5 and g2 and wins material." }],
        hints: ["Grabbing the e5 pawn looks attractive, but check Black's best reply first.", "Simple developing moves or Nxd4 keep an edge."],
        explanation: "Black's 3...Nd4 is dubious, but White should not take e5. Calm moves like Nxd4, c3 or O-O are good.",
      },
      fromPool("trappedPiece", 0, {
        id: "pool-trapped",
        prompt: "From a real game: compare your candidates and find the best one.",
        hint: "Is any enemy piece short of safe squares?",
        assessment: true,
      }),
      {
        id: "candidates-assess",
        kind: "choice",
        assessment: true,
        question: "You find a move that wins a pawn. What should you do before playing it?",
        options: [
          { text: "Check your opponent's best reply and look for other candidates", correct: true, feedback: "Exactly." },
          { text: "Play it quickly before you forget it", feedback: "Speed is not a reason. Calculate the reply first." },
          { text: "Only check that the move is legal", feedback: "Legal is not the same as good: look at the reply." },
        ],
        explanation: "Even a winning-looking move must survive the opponent's best answer.",
      },
    ],
    recap: ["List 2–3 candidate moves before deep calculation.", "Assume the opponent finds the best reply.", "Prefer moves that work against any defence."],
    followUp: { kind: "puzzles", label: "Practise calculation with adaptive puzzles" },
  },
];
