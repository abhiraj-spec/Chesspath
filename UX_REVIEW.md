# ChessPath UX review

This review records testing that was actually carried out on the running application during development, with automated browser tooling (Playwright and Chromium) and screenshots that were inspected. Where something was *not* tested, it says so.

## Method

- **Real browser inspection.** Pages were driven with Playwright scripts against both the dev server and the production static export (`out/`, served by `scripts/serve.mjs`), and screenshots were reviewed at each stage.
- **Automated journeys:** 46 Playwright tests across a desktop project (1280×800) and a mobile project (Pixel 7 emulation, 412×915, touch), including keyboard and dialog tests.
- **Engine-backed content checks:** `npm run validate:content` runs real Stockfish over every lesson answer and every drill position.
- **Contrast** was computed numerically (WCAG ratio) for the colour tokens. Chart colours were checked with the data-visualisation palette validator.

## Viewports inspected (screenshots reviewed)

| Viewport | Pages |
|---|---|
| 320×640 (small phone) | Play (game running), Castling lesson step |
| 375×812 / 375×667 | Home (new user), Forks lesson, Puzzles, Castling lesson |
| 390×844 | Progress with the "More" navigation sheet open |
| 412×915 (Pixel 7, automated) | Every main section, lessons, puzzles, navigation |
| 768×1024 (tablet portrait) | Curriculum, Checkmate lesson step |
| 1280×800 / 1280×860 | Every section, dashboard with activity, Progress with data, analysis (summary and key moment), openings study, play |
| 1440×900 (dark) | Puzzles |
| 1920×1080 | Knight lesson step |
| Dark theme | Puzzles, Play, Settings (full page) |

Horizontal overflow was checked programmatically (`scrollWidth <= innerWidth`) on every captured page and in the navigation tests for all main sections on desktop and mobile. No overflow was found.

## User journeys tested

| # | Journey | How | Result |
|---|---|---|---|
| 1 | New-user onboarding (level → goal → time → 6-question check → recommendation → dashboard; reload persists) | `onboarding.spec.ts` | Pass |
| 1b | Skip onboarding straight into lesson 1 | `onboarding.spec.ts` | Pass |
| 2 | Complete "The board and its coordinates" with a deliberate mistake; 100% score; status persists after reload | `lesson.spec.ts` | Pass |
| 3 | Wrong move explained, hint shown, correct move confirmed with an explanation | `lesson.spec.ts` | Pass |
| 4 | Solve a tactical puzzle (solution played on the board), session counter, next puzzle | `puzzle.spec.ts` | Pass |
| 5 | Reveal a solution, which adds the puzzle to the review queue with a stated reason (shown on Progress) | `puzzle.spec.ts` | Pass |
| 6 | Play a full game against the computer to a result, then open the review | `game.spec.ts` | Pass |
| 7 | Unfinished game restored after reload; takeback | `game.spec.ts` | Pass |
| 8 | Engine failure (worker URL made unavailable): error shown, game preserved, recovery offered | `game.spec.ts` | Pass |
| 9 | Import malformed PGN (specific error naming `Ke3`), import a valid game, analyse, key moments, engine tab | `analysis.spec.ts` | Pass |
| 10 | Settings apply immediately and persist (dark theme, coordinates off, board colours) | `settings.spec.ts` | Pass |
| 11 | Backup export and typed-confirmation reset | `settings.spec.ts` | Pass |
| 12 | Interrupted lesson resumes at the right step (curriculum card and lesson intro) | `lesson.spec.ts` | Pass |
| 13 | All sections render without errors or overflow; sidebar navigation (desktop) and bottom bar + More sheet (mobile) | `navigation.spec.ts` | Pass |
| 14 | Opening recall line completed and recorded on Progress | `navigation.spec.ts` | Pass |
| 15 | Offline: after the first visit, lessons and puzzles load with the network disabled | `navigation.spec.ts` | Pass |
| 16 | Keyboard-only move on the game board, with screen-reader announcements; dialog Escape and focus return | `keyboard.spec.ts` | Pass |

## Issues found and fixed

Severity: **Critical** = wrong chess or wrong information, **High** = blocks or misleads users, **Medium** = noticeable friction, **Low** = polish.

| # | Issue (how found) | Severity | Fix |
|---|---|---|---|
| 1 | Game analysis in the browser labelled Morphy's winning combination 15.Bxd7+ (mate in 3) a "blunder": depth-10 search misjudged it (screenshot of the Opera Game) | Critical | Added a verification pass: every mistake or blunder is re-analysed at depth 18 with a fresh hash before being reported. Classification is now mate-aware (allowing a forced mate is always a blunder). |
| 2 | Partially analysed games showed unverified "blunder" labels, and were saved as complete before verification ran (traced via console logging) | Critical | An analysis is only marked complete after verification. Classifications, key moments and the summary are hidden until then; the UI says mistakes are being double-checked. |
| 3 | Lesson position was illegal (queen on a1 already checking the king on h8 with White to move). chess.js accepted it; Stockfish hung (content validation) | Critical | Stricter FEN validation (side not to move may not be in check). The engine client fails fast on positions Stockfish rejects. Position fixed. |
| 4 | Three "winning" lesson moves actually allowed a back-rank mate; one "queen fork" landed on a square the rook covered; an underpromotion exercise only drew (content validation) | Critical | Positions redesigned and re-verified with Stockfish; the luft exercise now explains why h3 fails there. |
| 5 | Step-level "wrong move" feedback in 14 places was silently ignored (type check) | High | Supported step-level feedback, and it is now engine-validated. "Wrong" labels that weren't objectively worse (edge-pawn first moves) were replaced with neutral, instruction-based feedback. |
| 6 | Text contrast: "subtle" text was 3.7–4.3:1, and board coordinates on dark squares were 2.5:1 (computed) | High | Subtle text is now `#5f6762` (≥4.6:1). Coordinates use dark ink on every theme (≈4.5–7:1); dark-mode dark squares were lightened slightly. |
| 7 | Squares selected in "click the squares" exercises were nearly invisible on dark squares (screenshot) | High | Added a strong accent ring as well as the tint. |
| 8 | After "Continue", the next step opened scrolled down, with the board partly off-screen on mobile and tablet (screenshot) | Medium | The page scrolls to the top on step and puzzle changes. |
| 9 | Tablet portrait stacked the board above the panel, pushing the instructions below the fold (768×1024 screenshot) | Medium | The two-column layout now starts at 768 px. |
| 10 | On small phones the exercise instruction was below the fold (375×667 screenshot) | Medium | Compact prompt above the board on mobile; the puzzle page header is compact on small screens. |
| 11 | Dashboard said "4 solved so far" when 4 were *attempted*, 0 solved (screenshot) | Medium | Text corrected. |
| 12 | Training time was lost when a tab was closed (only saved on unmount) | Medium | Time is also saved on `visibilitychange` (hidden) and `pagehide`. |
| 13 | Live engine panel and full analysis shared one engine and could cancel each other | Medium | Live analysis pauses while a full analysis runs, with an explanation. |
| 14 | An abandoned game still showed "Resume your game" on the dashboard but could not be resumed | Medium | Abandoned games are stored as "Unfinished". |
| 15 | Interactive board components nested inside links on the openings list (focus trap risk) | Medium | Replaced with a decorative, `aria-hidden` mini board. |
| 16 | "Best after earlier lessons" appeared on almost every lesson card (screenshot) | Low | Removed; "Recommended next" guides instead. |
| 17 | React purity and effect issues flagged by lint (time reads during render, refs in render, state set in effects) | Low | Refactored (`useNow`, state-during-render patterns, `useSyncExternalStore`); lint is clean. |

## Beginner usability review

Walked through as someone who has never played chess:
- The home page offers one obvious action, "Start your first lesson", and a lesson board is interactive within one click.
- Each exercise states what to do, who is to move ("White to move", plus a "drill" note when the other side passes), and on mobile the prompt sits above the board.
- A wrong move is shown briefly, taken back, and explained (e.g. "The pawn on e7 would capture your queen"). Hints are graduated, and "Show solution" only appears after two mistakes or all hints.
- Terms are introduced in each lesson's intro ("New terms in this lesson"), with a searchable glossary.
- The next activity is always offered (Continue, the completion screen's follow-up, the dashboard's "Up next").
- Leaving and returning resumes at the same step (tested).

## Accessibility review

- **Keyboard:** the board is operable with arrow keys and Enter/Space, with a visible square cursor and polite live-region announcements of selection, legal destinations and cursor squares (tested). Moves can also be typed (setting). Dialogs use native `<dialog>`: Escape closes and focus returns (tested). A skip link and visible focus outlines are present.
- **Non-colour cues:** feedback uses icons and titles ("Correct!", "Not quite"); move-quality symbols (?!, ?, ??) appear in addition to colour; difficulty uses dots plus a text label; charts have a table view.
- **Motion:** honours `prefers-reduced-motion`, with an in-app override.
- **Text scaling:** the type scale uses rem units.
- **Not done:** no testing with real screen readers (NVDA, JAWS, VoiceOver). Announcements were verified by checking the live-region text in automated tests only. No browser-zoom-to-200% pass was performed.

## Performance (measured locally)

On the production build served from localhost (unthrottled Chromium, so not representative of mobile networks): first contentful paint 72–132 ms and largest contentful paint 116–588 ms across `/`, `/learn/`, a lesson, `/puzzles/` and `/play/`. The largest JS chunk is about 72 KB gzipped. The Stockfish WASM (1.8 MB) is loaded only on pages that use the engine, and it is cached by the service worker. No Lighthouse or field data was collected.

## Remaining limitations

- Only Chromium was tested; Firefox and Safari were not.
- Mobile was tested with Chromium device emulation, not physical devices. Touch dragging was not specifically tested (tap-to-move was).
- No real screen-reader testing (see above).
- Analysis explanations are fact-based but templated; some moments only show the engine line with an explicit "cannot name the idea" note.
- Shallow engine settings (quick analysis, easier levels) can misjudge positions; the analysis view states this.

## Final verification

- `npm run typecheck`: clean
- `npm run lint`: clean
- `npm test`: 176 unit and integration tests pass (including real Stockfish runs)
- `npm run validate:content`: 90 engine checks pass
- `npm run build`: 69 static pages and service worker generated
- `npm run test:e2e`: 46 passed, 2 skipped (desktop-only tests on the mobile project)
