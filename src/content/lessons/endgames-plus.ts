import { setup } from "@/lib/chess/setup";
import type { Lesson } from "../types";
import { practice } from "./helpers";

export const endgamesPlus: Lesson[] = [
  // ------------------------------------------------------------------ F6
  {
    id: "pawn-endgames",
    module: "endgames",
    title: "Pawn endgames: breakthroughs and outside passers",
    difficulty: 4,
    objective: "Create a passed pawn by force and use a distant passed pawn to win.",
    summary: "When every tempo counts.",
    estimatedMinutes: 14,
    skills: ["pawn-endgames", "pawn-races"],
    prerequisites: ["opposition", "square-of-pawn"],
    terms: ["breakthrough", "outside passed pawn", "passed pawn"],
    intro: [
      "Pawn endgames are pure calculation: no piece can come back to help, so **count every move**.",
      "A **breakthrough** sacrifices pawns to force one through. The classic case: three pawns against three on adjacent files, with the kings far away.",
      "An **outside passed pawn** (far from the other pawns) is a winning weapon: it drags the enemy king away while your king eats the pawns it left behind.",
    ],
    steps: [
      {
        id: "breakthrough",
        kind: "play",
        fen: setup({ white: "Kg1 Pa5 Pb5 Pc5", black: "Kg8 Pa7 Pb7 Pc7" }),
        prompt: "The kings are far away. Force a queen with a pawn breakthrough.",
        moves: [
          { accept: { san: ["b6"] }, reply: "cxb6", feedback: "The breakthrough! Black must take, or you take on a7 or c7 next." },
          { accept: { san: ["a6"] }, reply: "bxa6", feedback: "Sacrifice again, opening the c-file." },
          { accept: { san: ["c6"] }, feedback: "Nothing can stop the c-pawn now: c7 and c8=Q follow." },
        ],
        wrong: [
          { san: "a6", text: "After ...bxa6 Black still has pawns on a7, a6 and c7, and your b- and c-pawns cannot break through. Start in the middle." },
          { san: "c6", text: "After ...bxc6 Black has pawns on a7, c7 and c6 against your a- and b-pawns, and nothing gets through. Start in the middle with b6." },
        ],
        hints: ["Sacrifice the middle pawn first.", "1.b6: whichever pawn takes, sacrifice the next one to open the other file."],
        hintSquares: ["b5"],
        explanation: "1.b6! cxb6 2.a6! bxa6 3.c6 and the pawn queens (after 1...axb6, 2.c6! bxc6 3.a6 wins the same way). Stockfish rates b6 as winning and every other move as a draw.",
      },
      {
        id: "outside-passer-idea",
        kind: "choice",
        fen: setup({ white: "Kd4 Pa4 Ph3", black: "Kd6 Ph5" }),
        question: "White's a-pawn is far from everything. What is the winning plan?",
        options: [
          { text: "Push the a-pawn to drag Black's king to the queenside, then take the h-pawn with the king", correct: true, feedback: "Exactly: the black king can't stop the a-pawn and protect h5 at the same time." },
          { text: "Keep the king next to the a-pawn and escort it", feedback: "That lets the black king attack your h-pawn. Use the a-pawn as a decoy instead." },
        ],
        explanation: "The outside passed pawn is a decoy: while the enemy king stops it, your king wins the pawns on the other wing.",
      },
      {
        id: "outside-passer-play",
        kind: "goal",
        fen: setup({ white: "Kd4 Pa4 Ph3", black: "Kd6 Ph5" }),
        prompt: "Now play it out against Stockfish: win by promoting a pawn safely.",
        goal: "promote",
        maxMoves: 20,
        hints: ["Push the a-pawn so the black king has to follow it.", "Then march your king to h5 and promote the h-pawn."],
        explanation: "The a-pawn decoyed the black king; your king won the h-pawn and the h-pawn queened.",
      },
      ...practice("pawnEndgame", [0, 1, 2, 3, 4, 5], {
        idPrefix: "pawn-eg",
        prompt: "From a real game (pawn endgame): find the winning move.",
        hint: "Count tempi: whose pawn queens first, and can a king reach the key squares?",
        assess: 2,
      }),
    ],
    recap: ["In pawn endgames, count every tempo.", "Three against three: break through in the middle.", "An outside passed pawn decoys the king while yours eats the rest."],
    followUp: { kind: "lesson", ref: "lucena-philidor", label: "Next: Lucena and Philidor" },
  },

  // ------------------------------------------------------------------ F7
  {
    id: "lucena-philidor",
    module: "endgames",
    title: "Lucena and Philidor: the two rook endgames to know",
    difficulty: 5,
    objective: "Win the Lucena position by building a bridge, and draw the Philidor position with the third-rank defence.",
    summary: "The most important positions in endgame theory.",
    estimatedMinutes: 15,
    skills: ["rook-endgames", "endgame-technique"],
    prerequisites: ["rook-endgames"],
    terms: ["Lucena position", "Philidor position", "building a bridge"],
    intro: [
      "Rook and pawn against rook is the most common endgame in practice. Two positions decide most of them.",
      "**Lucena** (winning): your king is in front of your pawn on the 7th rank, the enemy king is cut off. The method is **building a bridge**: bring your rook to the 4th rank, walk your king out, and block the rook checks with your own rook.",
      "**Philidor** (drawing): the defending king stands in front of the pawn. Keep your rook on the **third rank** (your 6th) so the attacking king can't advance. As soon as the pawn steps onto that rank, swing your rook to the far end and check from behind: the king has nowhere to hide.",
    ],
    steps: [
      {
        id: "lucena-bridge",
        kind: "explain",
        fen: setup({ white: "Kb8 Rd1 Pb7", black: "Ke7 Ra2" }),
        text: [
          "This is the Lucena position. White's king is stuck in front of the pawn: the black rook covers the a-file, and checks drive the king back whenever it steps out.",
          "The bridge: **1.Rd4!** Now the king walks out (Kc7, Kb6…) and when Black's rook checks along the b-file, Rb4 blocks the check, and the pawn queens.",
        ],
        arrows: [{ from: "d1", to: "d4", kind: "main" }],
      },
      {
        id: "lucena-goal",
        kind: "goal",
        fen: setup({ white: "Kb8 Rd1 Pb7", black: "Ke7 Ra2" }),
        prompt: "Win the Lucena position against Stockfish: promote the pawn safely.",
        goal: "promote",
        maxMoves: 14,
        hints: ["Start with Rd4: the rook goes to the fourth rank.", "Walk the king out towards the black rook; when it checks on the b-file, block with Rb4."],
        explanation: "Rook to the fourth rank, king out, block the checks: that is building a bridge.",
      },
      {
        id: "philidor-idea",
        kind: "choice",
        fen: setup({ white: "Kd5 Rh7 Pe5", black: "Ke8 Ra6", turn: "b" }),
        question: "You defend with Black. White wants Kd6. Where does your rook belong right now?",
        options: [
          { text: "On the sixth rank (as now), stopping the white king from advancing", correct: true, feedback: "Right: the third-rank defence. Wait on the sixth rank, e.g. ...Rb6 or ...Rg6." },
          { text: "On the back rank, next to the king", feedback: "Passive: after Kd6 Black is lost. Keep the rook on the sixth rank." },
          { text: "Checking the king from behind right away", feedback: "Too early: the king hides on the sixth rank. Checks from behind come after the pawn advances." },
        ],
        explanation: "Philidor's method: rook on the sixth rank until the pawn reaches it, then checks from behind.",
      },
      {
        id: "philidor-goal",
        kind: "goal",
        fen: setup({ white: "Kd5 Rh7 Pe5", black: "Ke8 Ra6", turn: "b" }),
        prompt: "Hold the Philidor position against Stockfish for 12 moves.",
        goal: "hold-draw",
        maxMoves: 12,
        hints: ["Keep the rook on the sixth rank while the pawn is on e5.", "When the pawn reaches e6, play ...Ra1 and check from behind."],
        explanation: "Third-rank defence, then checks from behind: the classic draw.",
      },
      {
        id: "which-position",
        kind: "choice",
        assessment: true,
        question: "Your king stands in front of your passed pawn on the seventh rank, and the enemy king is cut off. Which theoretical position is this?",
        options: [
          { text: "Lucena: winning, by building a bridge", correct: true, feedback: "Right." },
          { text: "Philidor: a draw", feedback: "Philidor is the defender's position, with the defending king in front of the pawn." },
        ],
        explanation: "Lucena = attacker's king in front of its own pawn, defender cut off: a win.",
      },
    ],
    recap: ["Lucena: rook to the fourth rank, king out, block checks (building a bridge).", "Philidor: rook on the third rank, then checks from behind.", "Most rook-and-pawn endgames reduce to one of these."],
    followUp: { kind: "lesson", ref: "rook-endgames-practice", label: "Next: rook endgames in practice" },
  },

  // ------------------------------------------------------------------ F8
  {
    id: "rook-endgames-practice",
    module: "endgames",
    title: "Rook endgames in practice",
    difficulty: 4,
    objective: "Find winning ideas in rook endgames from real games.",
    summary: "Active rooks, cut-offs and tactics with few pieces.",
    estimatedMinutes: 12,
    skills: ["rook-endgames", "endgame-technique"],
    prerequisites: ["lucena-philidor"],
    intro: [
      "Rook endgames are where most games are decided, and even with little material tactics matter: skewers along ranks, back-rank checks, and passed pawns supported from behind.",
      "In each position, start with forcing moves, then ask which rook is more active and which king is closer to the action.",
    ],
    steps: practice("rookEndgame", [0, 1, 2, 3, 4, 5, 6, 7], {
      idPrefix: "rook-eg",
      prompt: "From a real game (rook endgame): find the strongest move.",
      hint: "Look for skewers along ranks and files, checks that win the rook, and pawns that can run.",
      assess: 3,
    }),
    recap: ["Even in endgames, look for checks, captures and threats first.", "Skewers along ranks win rooks.", "Rooks belong behind passed pawns."],
    followUp: { kind: "lesson", ref: "minor-piece-endgames", label: "Next: minor-piece endgames" },
  },

  // ------------------------------------------------------------------ F9
  {
    id: "minor-piece-endgames",
    module: "endgames",
    title: "Bishop and knight endgames",
    difficulty: 4,
    objective: "Use bishops and knights well when few pieces remain.",
    summary: "Long-range bishops, tricky knights.",
    estimatedMinutes: 12,
    skills: ["minor-piece-endgames", "endgame-technique"],
    prerequisites: ["pawn-endgames"],
    intro: [
      "**Bishops** are long-range: they stop passed pawns from a distance and are strong when pawns are on both wings. They control only one colour, so put your pawns on the other colour.",
      "**Knights** are short-range but can reach every square. They are excellent blockaders, and a knight fork can still decide an endgame. A knight struggles against a rook's pawn.",
      "The first four positions are bishop endgames, the rest knight endgames.",
    ],
    steps: [
      ...practice("bishopEndgame", [0, 1, 2, 3], { idPrefix: "bish-eg", prompt: "From a real game (bishop endgame): find the winning move.", hint: "Can the bishop stop or support a passed pawn from a distance?", assess: 1 }),
      ...practice("knightEndgame", [0, 1, 2, 3], { idPrefix: "kn-eg", prompt: "From a real game (knight endgame): find the winning move.", hint: "Look for knight forks and for pawns the knight cannot catch in time.", assess: 1 }),
    ],
    recap: ["Bishops love open boards and pawns on both wings.", "Knights fork and blockade, but are slow over distance.", "Put your pawns on the opposite colour to your bishop."],
    followUp: { kind: "lesson", ref: "promotion-tactics", label: "Next: promotion tactics" },
  },

  // ------------------------------------------------------------------ F10
  {
    id: "promotion-tactics",
    module: "endgames",
    title: "Passed pawns and promotion tactics",
    difficulty: 3,
    objective: "Push, support and promote passed pawns, using tactics to clear the way.",
    summary: "Passed pawns must be pushed.",
    estimatedMinutes: 10,
    skills: ["promotion"],
    prerequisites: ["en-passant-promotion"],
    terms: ["passed pawn", "underpromotion"],
    intro: [
      "A **passed pawn** has no enemy pawns in front of it or on the neighbouring files. The closer it gets to promotion, the more of the opponent's attention it takes.",
      "Typical tactics: deflecting the piece that guards the promotion square, a rook sacrifice that clears the path, or promoting with check. Always check whether **underpromotion** (to a knight, for example with check) is better.",
    ],
    steps: [
      ...practice("promotion", [0, 1, 2, 3, 4], { idPrefix: "promo", prompt: "From a real game: promote, or force the way clear for your pawn.", hint: "Who guards the promotion square? Can you deflect or block it?", assess: 2 }),
      ...practice("advancedPawn", [0, 1, 2], { idPrefix: "adv", prompt: "From a real game: use your advanced pawn.", hint: "An advanced pawn ties pieces down. Which forcing move makes it decisive?", assess: 1 }),
    ],
    recap: ["Passed pawns must be pushed.", "Remove or deflect the guard of the promotion square.", "Check whether a different promotion piece is better."],
    followUp: { kind: "lesson", ref: "zugzwang", label: "Next: zugzwang" },
  },

  // ------------------------------------------------------------------ F11
  {
    id: "zugzwang",
    module: "endgames",
    title: "Zugzwang",
    difficulty: 5,
    objective: "Win positions where your opponent is lost only because they must move.",
    summary: "Sometimes the best move is to pass, so make your opponent do it.",
    estimatedMinutes: 12,
    skills: ["zugzwang", "endgame-technique"],
    prerequisites: ["opposition"],
    terms: ["zugzwang", "opposition"],
    intro: [
      "**Zugzwang** (German: compulsion to move) is a position where any move makes things worse, and the player would rather pass. Chess has no passing, so they must weaken themselves.",
      "It appears mainly in endgames: kings in opposition, pieces that cannot move without dropping a pawn. The winning move is often a quiet **waiting move** that hands the move back to your opponent.",
    ],
    steps: practice("zugzwang", [0, 1, 2, 3, 4, 5], {
      idPrefix: "zz",
      prompt: "From a real game (zugzwang): find the move that leaves your opponent without a good reply.",
      hint: "What would your opponent like to do? Find a move that keeps everything covered and hands them the move.",
      assess: 2,
    }),
    recap: ["Zugzwang: every move makes the position worse.", "A waiting move can be the strongest move.", "In king-and-pawn endings, opposition is a form of zugzwang."],
    followUp: { kind: "lesson", ref: "queen-endgames", label: "Next: queen endgames" },
  },

  // ------------------------------------------------------------------ F12
  {
    id: "queen-endgames",
    module: "endgames",
    title: "Queen endgames",
    difficulty: 4,
    objective: "Use checks, forks and skewers with queens on an open board.",
    summary: "With queens on, every check matters.",
    estimatedMinutes: 8,
    skills: ["endgame-technique"],
    prerequisites: ["zugzwang"],
    intro: [
      "In queen endgames, kings are exposed and the queen can check from far away. Most decisive moments are tactical: **forks** of king and queen, **skewers** along a line, and checks that let a pawn promote.",
      "Before each move, look at every check for both sides. Perpetual check is the usual defensive resource.",
    ],
    steps: practice("queenEndgame", [0, 1, 2, 3, 4], {
      idPrefix: "q-eg",
      prompt: "From a real game (queen endgame): find the winning move.",
      hint: "Look at every check: can one of them fork or skewer the king and queen?",
      assess: 2,
    }),
    recap: ["With queens, check every check, for both sides.", "Queen forks and skewers decide most queen endgames.", "The defender's best hope is perpetual check."],
    followUp: { kind: "drills", label: "Practise endgame drills" },
  },
];
