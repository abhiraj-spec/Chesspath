import { setup } from "@/lib/chess/setup";
import type { Lesson } from "../types";
import { fromPool } from "./helpers";

export const practical: Lesson[] = [
  // ------------------------------------------------------------------ G1
  {
    id: "reviewing-games",
    module: "practical",
    title: "Reviewing your games constructively",
    difficulty: 2,
    objective: "Turn every game into a lesson: find critical moments, categorise mistakes and track patterns.",
    summary: "How to learn from losses (and wins).",
    estimatedMinutes: 6,
    skills: ["calculation", "threat-awareness"],
    prerequisites: ["thinking-routine"],
    intro: [
      "A quick review right after a game teaches more than any amount of passive study. First write down what *you* thought at the key moments, **then** check with the engine.",
      "Categorise each serious mistake: hung a piece? missed a tactic? opening error? time trouble? Patterns across several games show what to train. ChessPath's analysis does this tagging for you and feeds it into your training plan.",
    ],
    steps: [
      {
        id: "first-step",
        kind: "choice",
        question: "You just lost a game. What is the most useful first step?",
        options: [
          { text: "Find the moment the evaluation turned, and note what you were thinking", correct: true, feedback: "Right: your thought process is what you need to fix." },
          { text: "Immediately play another game", feedback: "Understandable, but you miss the chance to learn while your memory is fresh." },
          { text: "Look only at the opening", feedback: "The decisive mistake is often later. Find the turning point first." },
        ],
        explanation: "Reviewing your own thinking reveals habits (such as not checking threats) that the engine alone cannot show.",
      },
      {
        id: "categorise",
        kind: "choice",
        fen: setup({
          white: "Kg1 Qd1 Ra1 Rf1 Bc1 Be2 Nb1 Ng5 Pa2 Pb2 Pc2 Pd3 Pe4 Pf2 Pg2 Ph2",
          black: "Kg8 Qd8 Ra8 Rf8 Bc8 Be7 Nb8 Nc6 Pa7 Pb7 Pc7 Pd6 Pe5 Pf7 Pg7 Ph7",
          turn: "b",
        }),
        arrows: [{ from: "e7", to: "g5", kind: "bad" }],
        question: "White just played Ng5, and Black can capture it with the bishop for free. What kind of mistake was Ng5?",
        options: [
          { text: "A hung piece: White did not check whether g5 was defended", correct: true, feedback: "Correct: the most common category." },
          { text: "An opening theory mistake", feedback: "Not about theory: it is simply leaving a piece en prise." },
          { text: "A time-management mistake", feedback: "Maybe, but the move itself hung a piece. Tag it as such." },
        ],
        explanation: "Tag mistakes by cause. If \"hung a piece\" keeps appearing, practise blunder-checking and hanging-piece puzzles.",
      },
      fromPool("hangingPiece", 1, {
        id: "pool-hanging-2",
        prompt: "A position from a real game. Find what your opponent overlooked.",
        hint: "Is any enemy piece undefended?",
        assessment: true,
      }),
      {
        id: "patterns-assess",
        kind: "choice",
        assessment: true,
        question: "Which habit best reveals your recurring weaknesses?",
        options: [
          { text: "Tag mistakes by type across many games and train the most frequent one", correct: true, feedback: "Exactly what ChessPath's Progress page helps you do." },
          { text: "Only review games you won", feedback: "Losses usually reveal more." },
          { text: "Memorise more opening lines", feedback: "Openings rarely decide games at club level; tactics do." },
        ],
        explanation: "Data from your own games beats guesswork when choosing what to train.",
      },
    ],
    recap: ["Review soon after playing: your thoughts first, the engine second.", "Tag each mistake by type.", "Train the most frequent weakness."],
    followUp: { kind: "analysis", label: "Import or review a game" },
  },

  // ------------------------------------------------------------------ G2
  {
    id: "blunder-check",
    module: "practical",
    title: "Blunder-checking and time management",
    difficulty: 2,
    objective: "Run a final safety check before every move and spend your time where it matters.",
    summary: "The last ten seconds before you move.",
    estimatedMinutes: 6,
    skills: ["blunder-check", "threat-awareness", "back-rank"],
    prerequisites: ["thinking-routine"],
    intro: [
      "Before you let go of a piece, run a **blunder check**: after my move, what are my opponent's checks, captures and threats? Is anything of mine undefended? Is my back rank safe?",
      "Spend time on critical moments (tactics, big decisions, the transition to an endgame) and move faster when the position is quiet or you are following a plan.",
    ],
    steps: [
      {
        id: "dont-grab",
        kind: "play",
        fen: setup({ white: "Kg1 Qd1 Pa2 Pb2 Pf2 Pg2 Ph2", black: "Kg8 Re8 Bd7 Pa7 Pb7 Pf7 Pg7 Ph7" }),
        prompt: "The bishop on d7 looks free. Blunder-check before you take it, then choose the best move.",
        moves: [{ accept: { san: ["h3", "g3", "h4", "Qf1", "Qd2", "Qc1", "Kf1"] }, feedback: "Good: you spotted the back-rank danger." }],
        wrong: [
          { san: "Qxd7", text: "Blunder! After Qxd7, ...Re1 is checkmate: your king has no escape square and the queen no longer guards e1." },
          { san: "Qe1", text: "...Rxe1 is checkmate: the queen is lost and the back rank is still weak." },
          { san: "Qf3", text: "From f3 the queen no longer guards e1, so ...Re1 is checkmate." },
        ],
        hints: ["What happens if your queen leaves the first rank?", "Black's rook can land on e1. Is your king trapped?"],
        explanation: "Grabbing the bishop allows ...Re1#. First secure the back rank (luft with h3/g3, or keep the queen guarding e1).",
      },
      {
        id: "time-use",
        kind: "choice",
        question: "When should you spend the most time thinking in a game?",
        options: [
          { text: "At critical moments: tactics, captures and big decisions", correct: true, feedback: "Right." },
          { text: "Equally on every move", feedback: "Quiet moves need less time; save it for critical positions." },
          { text: "In the opening, while you remember theory", feedback: "Known moves can be played quickly; that saves time for later." },
        ],
        explanation: "Recognising critical moments is a skill: positions with captures, checks or changes in structure deserve more time.",
      },
      fromPool("defensiveMove", 2, {
        id: "pool-blunder",
        prompt: "From a real game: blunder-check your opponent's threats, then find the best move.",
        hint: "What is your opponent threatening right now?",
        assessment: true,
      }),
      {
        id: "impulsive",
        kind: "choice",
        assessment: true,
        question: "Your opponent makes a surprising move. What should you do?",
        options: [
          { text: "Slow down and ask why they played it: what does it threaten?", correct: true, feedback: "Exactly: surprises often hide threats." },
          { text: "Reply instantly to keep up the pressure", feedback: "Instant replies to surprises are a classic source of blunders." },
        ],
        explanation: "Surprising moves are a signal to switch from fast to careful thinking.",
      },
    ],
    recap: ["Blunder-check every move: checks, captures and threats after your move.", "Watch your back rank.", "Spend time where the position demands it."],
    followUp: { kind: "play", label: "Play a game and apply the routine" },
  },
];
