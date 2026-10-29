import type { Lesson } from "../types";
import { practice } from "./helpers";

/** Opens the tactics module: pattern drill for the most important tactic of all. */
export const tacticsIntro: Lesson[] = [
  // ------------------------------------------------------------------ B0
  {
    id: "mate-in-one",
    module: "tactics",
    title: "Checkmate in one: practice",
    difficulty: 2,
    objective: "Spot a mate in one quickly in positions from real games.",
    summary: "Eight real positions where one move ends the game.",
    estimatedMinutes: 8,
    skills: ["mate-in-1"],
    prerequisites: ["checkmate-stalemate"],
    intro: [
      "Before every move, look at **every check** you can give. It takes seconds, and it is how mates in one are found.",
      "For each check, ask three questions: can the king **move** out of check, can the checking piece be **captured**, can the check be **blocked**? If all three answers are no, it is checkmate.",
      "Every position below comes from a real game on Lichess. Stockfish confirmed that exactly one move mates.",
    ],
    steps: [
      ...practice("mateIn1", [0, 1, 2, 3, 4, 5, 6, 7], {
        idPrefix: "m1",
        prompt: "From a real game: checkmate in one move.",
        hint: "List every check you can give, then test each one: can the king escape, can the checker be taken, can the check be blocked?",
        assess: 3,
      }),
    ],
    recap: ["Look at every check, every move.", "Mate = check + no escape square + no capture + no block.", "Most missed mates are simply checks that were never considered."],
    followUp: { kind: "lesson", ref: "hanging-pieces", label: "Next: hanging pieces" },
  },
];

/** Additional tactics lessons, placed after the core tactics module. */
export const tacticsPlus: Lesson[] = [
  // ------------------------------------------------------------------ B10
  {
    id: "trapped-pieces",
    module: "tactics",
    title: "Trapping pieces",
    difficulty: 3,
    objective: "Win pieces that have run out of safe squares.",
    summary: "A piece with nowhere to go can be hunted down.",
    estimatedMinutes: 8,
    skills: ["trapped-piece"],
    prerequisites: ["hanging-pieces"],
    intro: [
      "A piece is **trapped** when every square it can move to is attacked. Attack it, and it is lost even though it is defended.",
      "Typical victims: a bishop that grabbed a pawn on a2/h2 (or a7/h7) and gets shut in by a pawn, a knight on the rim, and a queen that went pawn-hunting among enemy pieces.",
      "Method: when an enemy piece looks short of squares, **count its escape squares**. If you can take them all away with one move (often a pawn move), do it.",
    ],
    steps: practice("trappedPiece", [1, 2, 3, 4, 5, 6], {
      idPrefix: "trap",
      prompt: "From a real game: one enemy piece is short of squares. Trap it or win it.",
      hint: "Find the enemy piece with the fewest safe squares, then take those squares away.",
      assess: 2,
    }),
    recap: ["Count a piece's escape squares, not just its defenders.", "Pieces on the edge and pawn-grabbing pieces are the usual victims.", "A quiet pawn move is often what closes the trap."],
    followUp: { kind: "puzzles", ref: "trapped-piece", label: "Practise: trapped-piece puzzles" },
  },

  // ------------------------------------------------------------------ B11
  {
    id: "deflection-decoy",
    module: "tactics",
    title: "Deflection and decoy in practice",
    difficulty: 3,
    objective: "Force defenders away (deflection) and lure pieces onto bad squares (decoy).",
    summary: "Two ways to make an enemy piece go where you want.",
    estimatedMinutes: 10,
    skills: ["deflection", "decoy"],
    prerequisites: ["defender-tactics"],
    terms: ["deflection", "decoy", "overloaded piece"],
    intro: [
      "**Deflection** drives a defender *away* from its job: you attack it or offer it something it must take, and what it was guarding falls.",
      "**Decoy** (attraction) pulls a piece *onto* a square: often a sacrifice that forces the king or queen onto a square where a fork, pin or mate follows.",
      "Both start with the same question: *which enemy piece is doing an important job, and can I force it to stop?* The first exercises are deflections, the rest are decoys.",
    ],
    steps: [
      ...practice("deflection", [1, 2, 3, 4], {
        idPrefix: "defl",
        prompt: "From a real game (deflection): force a defender away from its job.",
        hint: "Which enemy piece guards something important? Attack it or give it something it must take.",
        assess: 1,
      }),
      ...practice("attraction", [1, 2, 3, 4], {
        idPrefix: "decoy",
        prompt: "From a real game (decoy): lure an enemy piece onto a bad square.",
        hint: "Which square would you like the enemy king or queen to stand on? Can a sacrifice force it there?",
        assess: 1,
      }),
    ],
    recap: ["Deflection: chase the guard away.", "Decoy: drag the target onto the wrong square.", "Both are usually sacrifices, so calculate the follow-up before you play them."],
    followUp: { kind: "puzzles", ref: "deflection", label: "Practise: deflection puzzles" },
  },

  // ------------------------------------------------------------------ B12
  {
    id: "double-check",
    module: "tactics",
    title: "Double check in practice",
    difficulty: 3,
    objective: "Use double check, the most forcing move in chess.",
    summary: "When two pieces give check, only the king can move.",
    estimatedMinutes: 8,
    skills: ["double-check", "discovered-attack"],
    prerequisites: ["discovered-attacks"],
    terms: ["double check", "discovered check"],
    intro: [
      "A **double check** happens when a piece moves to give check *and* uncovers a check from the piece behind it.",
      "No single move can block or capture two checking pieces, so **the king must move**. That makes double check powerful even when the moving piece can be captured: it cannot, because the king is still in check from the other.",
      "Look for it whenever your queen, rook or bishop is lined up with the enemy king and one of your own pieces stands in between.",
    ],
    steps: practice("doubleCheck", [1, 2, 3, 4, 5, 6], {
      idPrefix: "dbl",
      prompt: "From a real game: find the double check (or the discovered check) that wins.",
      hint: "Which of your pieces is lined up with the king behind one of your own pieces? Move the front piece with check.",
      assess: 2,
    }),
    recap: ["Double check: the king must move; nothing else is legal.", "The checking piece may land on a defended square and still be safe.", "Line-ups of your piece, your piece and the enemy king are the signal."],
    followUp: { kind: "puzzles", ref: "double-check", label: "Practise: double-check puzzles" },
  },

  // ------------------------------------------------------------------ B13
  {
    id: "line-tactics",
    module: "tactics",
    title: "Line tactics: x-ray, clearance, interference",
    difficulty: 4,
    objective: "Attack through pieces, clear lines for your own pieces, and cut enemy lines.",
    summary: "Three tactics about who controls a line.",
    estimatedMinutes: 10,
    skills: ["x-ray", "clearance", "interference"],
    prerequisites: ["skewers", "discovered-attacks"],
    terms: ["x-ray", "clearance", "interference"],
    intro: [
      "Rooks, bishops and queens work along lines. Three tactics are about those lines:",
      "**X-ray**: your piece attacks *through* an enemy piece. When that piece moves or is exchanged, your attack lands on what was behind it.",
      "**Clearance**: one of your own pieces is in the way. Move it, ideally with a threat, so another piece can use the square or line.",
      "**Interference**: put a piece *between* an enemy defender and what it defends, cutting the connection.",
    ],
    steps: [
      ...practice("xRayAttack", [0, 1, 2], { idPrefix: "xray", prompt: "From a real game (x-ray): attack through an enemy piece.", hint: "Look along your rook, bishop and queen lines, including through enemy pieces.", assess: 1 }),
      ...practice("clearance", [0, 1], { idPrefix: "clear", prompt: "From a real game (clearance): move a piece out of the way, with tempo.", hint: "Which of your pieces is blocking a square or line that another of your pieces needs?", assess: 1 }),
      ...practice("interference", [0, 1], { idPrefix: "interf", prompt: "From a real game (interference): cut an enemy defender off.", hint: "Find a defender and the piece or square it protects. Can you put something on the line between them?", assess: 1 }),
    ],
    recap: ["X-ray: attacks continue through pieces once they move.", "Clearance: your own piece can be the obstacle.", "Interference: a piece placed between defender and target breaks the defence."],
    followUp: { kind: "puzzles", ref: "x-ray", label: "Practise: x-ray puzzles" },
  },

  // ------------------------------------------------------------------ B14
  {
    id: "sacrifices",
    module: "tactics",
    title: "Sacrifices that work",
    difficulty: 4,
    objective: "Give up material when the forced follow-up wins more, or mates.",
    summary: "Material is only worth what it can do.",
    estimatedMinutes: 12,
    skills: ["sacrifice", "calculation"],
    prerequisites: ["deflection-decoy"],
    intro: [
      "A sacrifice gives up material on purpose. It is correct only if you can **calculate a forced line** that wins the material back with interest, or mates.",
      "Sound sacrifices are almost always **forcing**: they give check, capture, or create a threat your opponent must answer, so the reply is predictable.",
      "Before sacrificing, write the line out in your head to the end: *my move, their only reply, my next move…* If any reply spoils it, don't play it.",
    ],
    steps: practice("sacrifice", [0, 1, 2, 3, 4, 5, 6, 7], {
      idPrefix: "sac",
      prompt: "From a real game: a sacrifice wins. Find it and follow it through.",
      hint: "Look for a forcing move that gives up material: a check or capture whose reply you can predict.",
      assess: 3,
    }),
    recap: ["Sacrifice only what you have calculated.", "Forcing moves make calculation possible.", "Count material at the end of the line, not after the first move."],
    followUp: { kind: "puzzles", ref: "sacrifice", label: "Practise: sacrifice puzzles" },
  },

  // ------------------------------------------------------------------ B15
  {
    id: "attacking-the-king",
    module: "tactics",
    title: "Attacking the king",
    difficulty: 4,
    objective: "Break open the enemy king's shelter and finish the attack.",
    summary: "f7/f2 strikes, kingside attacks and exposed kings.",
    estimatedMinutes: 12,
    skills: ["king-attack", "sacrifice"],
    prerequisites: ["sacrifices"],
    terms: ["pawn shield"],
    intro: [
      "Before castling, **f7 (f2)** is the weakest point: only the king defends it. Early knight and bishop pressure there wins many games.",
      "After castling, attacks aim at the **pawn shield** (f7, g7, h7). Typical ideas: removing the defending knight on f6, sacrificing on h7 or g7, and bringing the queen close.",
      "An attack needs **more attackers than defenders** near the king. Count them before you commit.",
    ],
    steps: [
      ...practice("attackingF2F7", [0, 1, 2], { idPrefix: "f7", prompt: "From a real game: strike at the weak f-pawn square.", hint: "f7 (or f2) is defended only by the king. What can land there?", assess: 1 }),
      ...practice("kingsideAttack", [0, 1, 2, 3], { idPrefix: "ksa", prompt: "From a real game: finish the kingside attack.", hint: "Count attackers and defenders around the king. Which defender can you remove or overload?", assess: 1 }),
      ...practice("exposedKing", [0, 1], { idPrefix: "exp", prompt: "From a real game: the enemy king has no shelter. Punish it.", hint: "An exposed king falls to checks. Which check keeps the king on the run?", assess: 1 }),
    ],
    recap: ["f7/f2 is weak until the king castles.", "Attack with more pieces than the defender has around the king.", "An open king is hunted with checks: keep it moving."],
    followUp: { kind: "lesson", ref: "more-mating-patterns", label: "Next: more mating patterns" },
  },

  // ------------------------------------------------------------------ B16
  {
    id: "more-mating-patterns",
    module: "tactics",
    title: "More mating patterns",
    difficulty: 4,
    objective: "Recognise six classic mates: Arabian, Anastasia's, hook, Boden's, dovetail and double-bishop mate.",
    summary: "Named patterns that appear again and again.",
    estimatedMinutes: 12,
    skills: ["mate-patterns", "mate-in-2"],
    prerequisites: ["mating-patterns"],
    terms: ["Arabian mate", "Anastasia's mate", "Boden's mate", "Hook mate"],
    intro: [
      "Strong players don't calculate every mate from scratch: they **recognise the picture**.",
      "**Arabian mate**: rook next to the cornered king, protected by a knight that also covers the escape square. **Anastasia's mate**: a knight takes away escape squares while a rook or queen mates along the edge file. **Hook mate**: rook protected by a knight, which is protected by a pawn. **Boden's mate**: two bishops on crossing diagonals mate a king boxed in by its own pieces (often after queenside castling).",
      "**Dovetail mate**: the queen mates diagonally next to the king, whose retreat squares are blocked by its own pieces. **Double-bishop mate**: two bishops on adjacent diagonals.",
    ],
    steps: [
      ...practice("arabianMate", [0, 1], { idPrefix: "arab", prompt: "From a real game (Arabian mate): rook and knight against the cornered king.", hint: "The knight guards the rook and an escape square. Where does the rook mate?", assess: 0 }),
      ...practice("anastasiaMate", [0, 1], { idPrefix: "anast", prompt: "From a real game (Anastasia's mate): knight plus rook or queen on the edge.", hint: "The knight seals the escape squares; the heavy piece mates along the edge file.", assess: 0 }),
      ...practice("hookMate", [0, 1], { idPrefix: "hook", prompt: "From a real game (hook mate): rook, knight and pawn working together.", hint: "Rook protected by knight, knight protected by pawn.", assess: 1 }),
      ...practice("bodenMate", [0], { idPrefix: "boden", prompt: "From a real game (Boden's mate): two bishops on crossing diagonals.", hint: "The king is boxed in by its own pieces. Can two bishops cover all its squares?", assess: 0 }),
      ...practice("dovetailMate", [0], { idPrefix: "dove", prompt: "From a real game (dovetail mate): the queen mates diagonally.", hint: "The king's own pieces block its retreat. Where can the queen land, protected, next to it?", assess: 1 }),
      ...practice("doubleBishopMate", [0], { idPrefix: "dbish", prompt: "From a real game (double-bishop mate): two bishops finish the job.", hint: "Both bishops sweep diagonals next to the king.", assess: 1 }),
    ],
    recap: ["Learn mates as pictures: the pattern tells you the move.", "Knights are the best partners for rooks and queens near the edge.", "A king boxed in by its own pieces is mate-prone."],
    followUp: { kind: "puzzles", ref: "mate-in-2", label: "Practise: mate-in-two puzzles" },
  },
];
