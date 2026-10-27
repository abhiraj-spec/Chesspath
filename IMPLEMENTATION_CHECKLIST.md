# Implementation checklist

Statuses: **Not started** · **In progress** · **Verified** (implemented *and* meaningfully tested; the evidence column names the tests or review).

| Area | Status | Evidence |
|---|---|---|
| Static-export Next.js app, strict TypeScript, Tailwind design tokens, light/dark themes | Verified | build, typecheck, settings e2e (dark theme persists), dark screenshots |
| Responsive app shell: desktop sidebar, mobile bottom bar + "More" sheet | Verified | navigation e2e (desktop + mobile, overflow check fixed in the audit), viewport screenshots 320–1920 |
| Shared UI components (buttons, cards, dialogs, toasts, switches, segmented, progress, empty/error states) | Verified | used across all e2e journeys; dialog Escape/focus test |
| Chess rules via chess.js (all moves, check/mate/stalemate, castling rules, en passant, promotion, draws, FEN, PGN, undo/redo lines) | Verified | `chess-rules.test.ts` (36 tests) |
| Strict FEN validation (side not to move in check) | Verified | `chess-rules.test.ts`, lesson validation |
| Custom chessboard: click, drag, keyboard, promotion picker, highlights, arrows, coordinates, orientation | Verified | lesson/puzzle/game/keyboard e2e |
| Persistence (Dexie, versioned schema, repository, backup/restore, reset, reopen) | Verified | `persistence.test.ts`, settings e2e, browser-restart e2e (persistent profile) |
| Onboarding with optional placement check (positions distinct from lessons, engine-verified) | Verified | onboarding e2e, `diagnose` and uniqueness unit tests, content validation |
| Dashboard: up next, daily plan from real data, curriculum card, stats, recommendations, empty states | Verified | `learning.test.ts` (plan), screenshots of new and active users |
| Curriculum: 40 lessons, 7 modules, 5 step types, hints, feedback, scoring, resume | Verified | `lessons.test.ts` (validity of all 40), lesson e2e, engine content validation |
| Endgame drills (6) and goal steps vs Stockfish | Verified | drills content validation (goals achievable); goal logic unit-checked via the lesson engine |
| Puzzles: 150 verified positions, 5 levels, adaptive / theme / level / review modes, hints, reveal, skip | Verified | `puzzles.test.ts`, `learning.test.ts`, puzzle e2e |
| Spaced repetition (puzzles, lesson checks, openings) with reasons | Verified | `learning.test.ts`, `persistence.test.ts`, puzzle e2e (review reason) |
| Mastery model and weakness detection (exercises + games); skipped exercises neutral; no double counting | Verified | `learning.test.ts` (incl. skip tests), lesson e2e (attempt count) |
| Stockfish worker client (cancellation, stale protection, timeouts, crash recovery, invalid positions) | Verified | `engine.test.ts` (mock + real engine), engine-failure e2e |
| Play vs computer: 5 levels, takeback, resign, draw offer, PGN export, resume | Verified | `engine.test.ts` (strength), game e2e |
| PGN import (paste, file, multi-game, errors) and saved-games library | Verified | `chess-rules.test.ts` (PGN), analysis e2e |
| FEN import/export: position explorer, Copy FEN in analysis and play | Verified | explorer e2e (invalid FEN, engine line, clipboard, impossible FEN rejected) |
| Game analysis: classification, verification pass, mate awareness, explanations, report, eval graph, variations | Verified | `analysis.test.ts` (Scholar's Mate, Opera Game with real Stockfish), analysis e2e |
| "Missed opportunity" label in analysis | In progress | Implemented; type-checked and reviewed, but no test exercises the label in the UI yet |
| Opening explorer: 11 openings, 26 lines, study and recall, names checked vs ECO database | Verified | `openings.test.ts`, recall e2e |
| Progress page (charts with table views, goals, streak, mastery, reviews) | Verified | screenshot review with real activity, recall e2e assertion |
| Settings: every control applies and persists | Verified | settings e2e (theme, coordinates, board colours), code review of each switch's consumer |
| Glossary | Verified | navigation e2e, glossary-term test |
| PWA: manifest, icons, generated service worker, offline after first visit | Verified | offline e2e |
| Accessibility: keyboard board, live announcements, focus, contrast, reduced motion | Verified (partially) | keyboard e2e and computed contrast. Not tested with real screen readers (see UX_REVIEW.md). |
| Optional AI coach | Not started | Deliberately out of scope: the core product works without an LLM. |
| Cloud sync / accounts | Not started | Out of scope (local-first); the repository layer is the integration point. |
