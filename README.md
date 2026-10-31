# ChessPath

A local-first chess-learning web app. It takes a learner from the rules of the game through tactics, strategy and endgames, using interactive lessons, adaptive puzzles from real games, a Stockfish opponent, opening recall training and plain-language game analysis.

ChessPath needs no account, no server and no paid API. Everything runs in the browser, and progress is stored on the device (IndexedDB). After the first visit, the app also works offline.

## What is implemented

| Area | What you get |
|---|---|
| **Onboarding** | Level, goal and daily target (10/15/30/60 min). An optional 6-question placement check recommends a starting lesson (not a rating). Fully skippable. |
| **Dashboard** | "Up next" action, a daily plan built from real data (next lesson, due reviews, weak-spot puzzles, opening recall, a game), curriculum progress, recent stats, and evidence-based recommendations. New users see a welcome state with no invented numbers. |
| **Curriculum** | 60 lessons (344 interactive exercises) in 7 modules (fundamentals, tactics, opening principles, positional play, calculation, endgames, practical improvement). Step types: explanation with demonstrations, play-a-move, select squares, multiple choice, and goal positions played out against Stockfish. Graduated hints, specific feedback for tempting wrong moves, revealable solutions, scored checks, recap and follow-up. Progress resumes mid-lesson. |
| **Endgame drills** | 6 positions (queen mate, rook mate, ladder mate, key squares, catch the pawn, rook-pawn fortress) played against Stockfish. Success is judged by the actual result on the board. |
| **Puzzles** | 150 positions from the Lichess puzzle database (CC0), each re-verified with Stockfish, across 5 levels and about 20 themes. Modes: adaptive, by theme, by level, review. Graduated hints, solution reveal, skip (doesn't count as a miss), explanations built from the position, and attribution. |
| **Spaced repetition** | An SM-2 variant for puzzles, lesson checks and opening lines. Cards are created when you struggle (opening lines are always scheduled), each with a stated reason. |
| **Play** | Stockfish 19 in a Web Worker, 5 descriptive levels (no Elo claims), side choice, takeback, resign, a draw offer judged by the engine's evaluation, PGN download/copy, move list navigation, resume after reload, and an engine-failure recovery path that preserves the game. |
| **Analysis** | PGN paste/upload (multi-game files, validated errors), a saved-games library, resumable per-move Stockfish analysis, mistakes verified at depth 18, mate-aware classification, an evaluation graph and bar, three detail levels (summary, key moments, engine), variation exploration that never alters the saved game, opening name from the ECO database, a report with recommendations and a plan, and a position explorer: paste a FEN, move for both sides, see Stockfish's top lines and copy the FEN (Copy FEN is also in analysis and play). |
| **Openings** | 11 openings (Italian, Ruy Lopez, Scotch, Queen's Gambit, London, King's Indian, Sicilian, French, Caro-Kann, Scandinavian, English) with 26 lines and an explanation for every move. Study mode and recall mode against the line, with spaced-repetition review. Names are cross-checked against the Lichess ECO database. |
| **Progress** | Training time chart, a weekly goal, a streak of days with 5+ active minutes, puzzle accuracy per week, weak spots with evidence and improvement status, module completion, a transparent mastery table, per-theme performance, game results, opening recall, drills and the review queue. |
| **Settings** | Theme (system/light/dark), board colours, motion, coordinates, legal-move hints, last-move highlight, drag on/off, typed-move input, eval bar, sound, orientation, default difficulty, daily target, level, goal, name, JSON backup export/restore, all-games PGN export, typed-confirmation reset, keyboard shortcuts, and licences. |
| **Accessibility** | Keyboard-operable board (arrow keys + Enter, with live announcements), visible focus, native modal dialogs, labelled controls, meaning never conveyed by colour alone, reduced motion, rem-based type, and contrast-checked tokens. |
| **PWA** | Manifest and icons. A generated service worker precaches all pages, scripts, fonts and the engine. |

## Technology

- Next.js 16 (App Router) as a **static export**, with React 19 and TypeScript (strict)
- Tailwind CSS 4, with design tokens in `src/app/globals.css`
- [chess.js](https://github.com/jhlywa/chess.js) 1.4 as the single source of chess rules
- [Stockfish.js](https://github.com/nmrugg/stockfish.js) 19, lite single-threaded WASM, running in a Web Worker
- Dexie 4 (IndexedDB) with versioned schemas
- Vitest (unit, integration and content validation) and Playwright (end to end)
- lucide-react icons; Inter, Source Serif 4 and JetBrains Mono fonts (self-hosted via @fontsource)

The board is a custom component (`src/components/board/Chessboard.tsx`). It supports click and drag moves, keyboard play, promotion choice, arrows and highlights.

## Getting started

Requires Node.js 20+ (tested with Node 22).

```bash
npm install          # also provides the Stockfish build
npm run dev          # http://localhost:3000 (copies the engine to public/engine first)
```

Production:

```bash
npm run build        # static export to out/ and generates out/sw.js
npm start            # serves out/ on http://localhost:3000 (set PORT to change)
```

`out/` can be hosted on any static host. The engine files need the `application/wasm` MIME type, which most hosts set automatically. No special headers are needed: the single-threaded engine does not require cross-origin isolation.

**Host it at the root of a domain** (for example `https://your-site.netlify.app/`). Every asset path starts with `/` (scripts, `/engine/…`, `/sw.js`, the manifest), so serving it from a sub-folder such as a GitHub Pages *project* site (`username.github.io/chesspath/`) loads the page but not its scripts. `netlify.toml` configures Netlify; on Cloudflare Pages use build command `npm run build` and output directory `out` (the Node version comes from `.nvmrc`; `public/_headers` sets caching and the manifest type on both hosts).

Note: Netlify's free plan adds a "Powered by Netlify" badge (bottom right) and an HTML comment to every page. The app copes with the comment (it is removed before React starts), but on phones the badge covers the right-hand tabs of the bottom navigation until the visitor closes it. Cloudflare Pages does not modify pages.

To run the end-to-end suite against a deployed copy: `LIVE_URL=https://your-site.example npx playwright test --config playwright.live.config.ts`.

New to all this on Windows? See [WINDOWS_SETUP.md](WINDOWS_SETUP.md).

To let people install it as an app (from the website, the Microsoft Store or Google Play), see [STORE_PUBLISHING.md](STORE_PUBLISHING.md).

## Quality commands

```bash
npm run typecheck          # tsc --noEmit
npm run lint               # eslint
npm test                   # unit + integration tests (includes a real Stockfish run)
npm run validate:content   # every lesson answer and drill goal checked with Stockfish (about 1 min)
npm run build && npm run test:e2e   # Playwright journeys on desktop and mobile viewports
```

The Playwright tests run against the production build served by `scripts/serve.mjs` on port 3100. They use the Chromium build that ships with Playwright: on a new machine run `npx playwright install chromium` once first.

## How data is stored

- **IndexedDB** (`chesspath` database, via `src/lib/db`) holds the profile, lesson progress, graded attempts, review cards, games, analyses, opening progress, daily training sessions, local analytics events and resume state. The schema is versioned (`SCHEMA_VERSION`); add a new `this.version(n)` block with an `upgrade()` for changes.
- **localStorage** holds lightweight display preferences only (`chesspath.settings.v1`), so the theme applies before first paint.
- All writes go through `src/lib/db/repo.ts`. UI components read through live queries in `src/hooks/data.ts`. A future sync layer can hook into the repository without touching components.
- Nothing leaves the device. Settings offers a JSON backup, a restore, a PGN export and a confirmed reset.

## How Stockfish is integrated

- `scripts/copy-engine.mjs` copies `stockfish-19-lite-single.{js,wasm}` from `node_modules/stockfish/bin` to `public/engine/` before `dev` and `build`.
- `src/lib/engine/client.ts` wraps the worker. It runs one search at a time, and new requests stop the old one. Results are tied to a job, so stale results are never delivered. It adds timeouts, crash detection, a `restart()`, and rejection of illegal positions (Stockfish otherwise hangs).
- `src/lib/engine/strength.ts` defines the five levels as a shallow multi-line search plus controlled move selection (temperature, loss cap, random-move chance). These are descriptive levels, not Elo.
- `src/lib/analysis/` contains the game analysis: per-position search, win-probability-based classification (thresholds of 5/10/15 percentage points, matching Lichess), mate awareness, a depth-18 verification pass before any mistake is reported, and fact-based explanations.

## How content is structured and validated

```
src/content/
  lessons/*.ts        60 lessons (typed data; positions built with setup() or fenAfter(), or taken from the verified real-game pool)
  puzzles/            puzzles.json (150) and lesson-pool.json, generated, do not edit by hand
  openings/           library.ts (11 openings) and eco-index.json (generated)
  drills.ts           endgame drills
  diagnostic.ts       onboarding placement check
  glossary.ts, skills.ts
```

Validation:
- `tests/unit/lessons.test.ts` checks every FEN (including "side not to move in check"), every accepted move and reply for legality, hints, assessments, glossary terms, skills, the diagnostic and the drills.
- `tests/content/engine-validate.test.ts` checks that every accepted move is close to Stockfish's best and every "wrong move" message targets a move that really is worse.
- `tests/content/drills-validate.test.ts` checks that every goal position is achievable with best play.
- `tests/unit/puzzles.test.ts` and `openings.test.ts` replay all puzzles and opening lines, and confirm opening names against the ECO database.

### Adding a lesson

1. Add an object to the right module file in `src/content/lessons/`. Build positions with `setup({ white: "Kg1 Rd1", black: "Kg8", turn: "w" })` or `fenAfter("e4 e5 Nf3")`.
2. Use `accept` matchers to accept every correct answer (`san: [...]`, `mate: true`, `{ piece, to }`, `castle: true`), add `wrong` feedback for tempting mistakes, and mark at least one step `assessment: true`.
3. Run `npm test` and `npm run validate:content`.

### Adding puzzles

Download the Lichess puzzle CSV (`lichess_db_puzzle.csv.zst`, CC0) and decompress it. A partial download is enough. Then run `npm run build:puzzles -- path/to/lichess_db_puzzle.csv`. The script selects by level and theme, verifies every solver move with Stockfish, and regenerates `puzzles.json`. It creates `lesson-pool.json` only if it does not exist. To add lesson positions, run `npm run build:lesson-pool -- path/to/lichess_db_puzzle.csv`: it appends verified positions and never reorders existing ones, because lessons refer to them by index.

### Adding opening lines

Add a variation to `src/content/openings/library.ts` with a note for every move and an `expectName` regex. `npm test` verifies legality and checks the name against the Lichess database (`data/openings/*.tsv`, rebuilt into the index with `npm run build:eco`).

## Licences and attribution

- **ChessPath** is GPL-3.0-or-later (see `LICENSE`), because it distributes Stockfish.
- Stockfish / Stockfish.js: GPL-3.0.
- Puzzles: [Lichess puzzle database](https://database.lichess.org/#puzzles), CC0. Each puzzle shows its Lichess id and links to the source.
- Opening names and ECO codes: [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), CC0.
- Piece set: "cburnett" by Colin M.L. Burnett, GPLv2+ (via lichess-org/lila).
- Fonts: Inter, Source Serif 4, JetBrains Mono (SIL OFL). chess.js: BSD-2-Clause. Dexie: Apache-2.0. lucide: ISC.

## Known limitations

- **Engine strength and depth.** The lite Stockfish build is weaker than full Stockfish, and analysis defaults to depth 13 with mistakes re-checked at depth 18. Very deep tactics can still be misjudged; the app says so in the analysis view.
- **Explanations** are generated from engine lines and material counts. When no pattern can be named, the app says so and shows the line instead of inventing an idea. There is no AI/LLM coach (by design, it is not required).
- **Puzzle and lesson explanations** for real-game positions are partly templated (theme description plus computed facts).
- **No cloud sync or accounts.** Data lives in one browser. Use backup export/restore to move it.
- **Offline:** the service worker is active only in production builds, and only after the first online visit.
- **Time tracking** counts active, visible time with a 2-minute idle cut-off. It is an estimate.
- **Opening library** covers main lines and important alternatives only (26 lines), not complete repertoires.

## Troubleshooting

- **"The engine stopped responding" / engine fails to load:** check that `public/engine/stockfish-19-lite-single.wasm` exists (run `npm run dev` or `npm run build`, which copy it) and that your host serves `.wasm` as `application/wasm`. The UI offers a restart; games are not lost.
- **Stale UI after deploying:** the service worker updates on the next visit. Reload once more, or clear site data.
- **Reset everything:** Settings → Reset all data (type RESET), or clear the site's storage in the browser.
- **Playwright cannot find a browser:** install one with `npx playwright install chromium`, or point `PLAYWRIGHT_BROWSERS_PATH` at an existing install.
