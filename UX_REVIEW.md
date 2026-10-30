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

Horizontal overflow is checked programmatically in the navigation tests for all main sections on desktop and mobile. **Correction (audit, below):** the original check compared `scrollWidth` with `window.innerWidth`, which mobile emulation widens to fit overflowing content, so it could not detect mobile overflow, and the earlier "no overflow found" claim was wrong for the dashboard. The check now compares with the configured viewport width.

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
| 17 | Position from FEN: invalid input explained, Stockfish finds the mate, move played, FEN copied | `explorer.spec.ts` | Pass |
| 18 | Progress and theme survive closing and relaunching the browser | `persistence.spec.ts` | Pass |
| 19 | Onboarded dashboard fits a phone screen; touch swipe over the board scrolls the page | `navigation.spec.ts` (mobile) | Pass |
| 20 | Revisiting a solved step does not double-count; focus moves to each new step | `lesson.spec.ts` | Pass |

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

## Independent audit (second pass)

After the first build, the app was audited again against the original specification, as a sceptical reviewer rather than its author. This covered the production build in Chromium at 390×844 (touch emulation), 768×1024 and 1280×800 across onboarding, lesson, puzzle, dashboard, openings, analysis, play, progress, glossary and drill screens, plus code review of the learning model, lesson player, board and content. Screenshots were inspected after each fix. Every fix below has a test, and the tests marked † were also shown to **fail when the fix is reverted**.

| # | Issue (how found) | Severity | Fix | Verified by |
|---|---|---|---|---|
| A1 | The mobile dashboard was 600 px wide on a 390 px phone: the daily plan and curriculum cards were cut off at the right edge (screenshot). The implicit grid column grew to fit unwrapped plan text. | High | Explicit `minmax(0,1fr)` column; plan reasons now wrap instead of being truncated (truncated text with a `title` tooltip is unreadable on touch devices). | Screenshot; new mobile e2e "dashboard of an onboarded user fits the viewport" |
| A2 | The automated overflow check could never fail on mobile (see correction above), so A1 went unnoticed. | High | Helper compares with the viewport width. | All section tests re-run on mobile with the fixed helper |
| A3 | Skipped puzzles were counted as failures (mastery credit 0, adaptive level drop, "done" in the daily plan), contradicting the on-screen promise "Skipping doesn't count as a miss" (code review). | High | Skipped attempts are excluded from mastery, the adaptive level and plan progress. | 3 new unit tests |
| A4 | Going back with "Previous step" and solving a scored step again recorded a second attempt, inflating mastery (code review). | High | Only the first result of each step is recorded, including across resume. | New e2e reads IndexedDB: exactly 1 attempt † |
| A5 | On touch screens the whole board blocked page scrolling (`touch-action: none`), so swiping on the board could not scroll the page on phones (code review). | High | Only squares holding a piece you can drag block scrolling. | New mobile e2e with real touch events: swipe on empty squares scrolls, swipe from your own piece does not † |
| A6 | FEN import/export, required by the spec, had no user interface (spec review). | High | New position explorer (`/analysis/?fen=…`): paste a FEN (invalid ones are explained), move for both sides, Stockfish top 3 lines with eval bar, step through moves, copy FEN. "Copy FEN" added to game analysis and play. | New e2e: invalid FEN, mate line found, move played, clipboard contents, impossible FEN in URL rejected |
| A7 | 4 of 6 placement-check positions were copied from lessons (so a returning learner had seen them), and the 3 placement-check move exercises were never engine-verified (content review). | Medium | New positions for the hanging piece, fork, stalemate and threat items. The engine validator now covers the placement check. While writing them, two of my own drafts were wrong: a queen and bishop battery that was blocked, and a "threat" position where the queens could simply be traded. The explanation's claim that ...h6 does not defend was also caught. | Unit tests: no diagnostic position appears in any lesson; stalemate and mate claims checked with chess.js; ...g6/...f5 stop the mate and ...h6 does not. Stockfish validation (93 checks) |
| A8 | The spec's "Missed opportunity" classification was never shown (spec review). | Medium | Shown when the engine's move won material or forced mate and the played move let it slip; key moments now also name the class in words, not only the ?!/?/?? symbol. | Type check; code review (no new e2e) |
| A9 | Puzzle theme links for skills that appear only as secondary tags (e.g. endgame technique) showed the wrong theme in the dropdown, and theme counts ignored secondary tags (code review). | Medium | The linked skill is added to the dropdown; counts match the selection logic. | Unit test: every skill's puzzle theme has puzzles |
| A10 | On phones, after a correct answer the Continue / Next puzzle button was below the fold (screenshot). | Medium | Continue and the puzzle's Next row stick above the bottom navigation below the `lg` breakpoint. | Screenshots (390×844) |
| A11 | Keyboard focus was lost (to the page body) when Continue disappeared on step change (code review). | Medium | Focus moves to the new step's header. | e2e asserts focus |
| A12 | The dashboard's "Continue: Pins" card had a "Start" button (screenshot). | Low | Button reads Continue / Resume / Start as appropriate. | Screenshot review |
| A13 | Analysis page: "Saved games" card stretched into a large empty box on desktop (screenshot). | Low | Card aligns to its content. | Screenshot review |

### Checked and found correct (no change)
- Chess rules: 36 rule tests (castling through and out of check, en passant including the pin case, promotion, all draw types, FEN/PGN round trips) still pass. Strict FEN validation rejects impossible positions, which was confirmed again in the new explorer e2e.
- Puzzle solutions replay legally (all 150), and every lesson "play" answer agrees with Stockfish.
- Engine failure handling (crash, missing worker, invalid position) remains covered by the existing unit and e2e tests.
- Persistence: a new e2e closes the whole browser and relaunches it on the same profile directory. Lesson progress (IndexedDB) and the theme (localStorage) survive.

### Known gaps left after the audit
- The dashboard can mention the same lesson three times (Up next, the plan and the curriculum card). This is redundant, but each has a distinct role, so it was left.
- The explorer cannot detect threefold repetition from a pasted FEN, because a FEN carries no history. There is no drag-and-drop board editor: positions are entered as FEN only.
- Its help text mentions ← → keys even on touch devices.
- The "Missed opportunity" label has no dedicated e2e test.

## Content expansion (third pass)

- **Curriculum 40 → 60 lessons, 175 → 344 interactive exercises.** New lessons:
  - Tactics: mate in one, trapped pieces, deflection and decoy, double check, line tactics (x-ray, clearance, interference), sacrifices, attacking the king, and six named mating patterns.
  - Calculation: mate in two, longer mates, quiet moves.
  - Openings: punishing opening mistakes.
  - Endgames: pawn breakthroughs and outside passed pawns, Lucena and Philidor (played out against Stockfish), rook, minor-piece and queen endgames, promotion tactics, zugzwang.
  - Practical: defending against threats.

  Nine short existing lessons received 2–4 extra real-game exercises each, appended at the end so saved mid-lesson positions still resume correctly.
- **Source and verification.** 241 new positions come from the Lichess puzzle database (CC0) via `scripts/build-lesson-pool.mjs`.
  - Every solving move had to be Stockfish's best by at least 1.5 pawns, or the only mate.
  - None of them are reused from the puzzle trainer, and the original 64 pool positions are unchanged.
  - Hand-made theory positions (Lucena, Philidor, breakthrough, outside passed pawn) were evaluated at depth 24 before being written up.
  - `npm run validate:content` (259 checks) passes for every play exercise and every play-it-out goal.
- **Mistakes caught while writing.** Wrong-move feedback in the breakthrough exercise described pawn structures incorrectly, and one quiz option suggested trading pawns on the same file. Both were fixed before testing.
- **Known gap.** Positional play (module D) is still 4 lessons and mostly multiple choice. It is now the thinnest module.
- **Data safety.** The app now asks the browser to keep its data (`navigator.storage.persist()`) once a profile exists. Settings states whether that was granted and when the last backup was exported. Whether Safari or iPhone grants it was not tested.

## Phone fit fix (fourth pass, reported by the user on a real phone)

- **Cause.** Every button had `whitespace-nowrap` and a fixed height, so a long label never wrapped. One example is "Resume: Lucena and Philidor: the two rook endgames to know" on the curriculum page. The page then became wider than the screen, so the phone zoomed out or let the page slide sideways. Dropdowns, badges and 25 grids without a base column template could grow past the edge the same way, especially with larger system text.
- **Fix.**
  - Buttons wrap, and use a minimum height instead of a fixed height.
  - Dropdowns, badges and grids can shrink.
  - `html, body { overflow-x: clip }` is a safety net, so any future overflow can't make the whole page zoom out.
- **Why earlier tests missed it.** They used default text size and lesson names that happened to fit.
- **How it was checked.** Every main page was measured element by element at 320, 360, 375, 390, 412 and 430 px, with text at 130% and 150%, and in landscape. Nothing extends past the screen edge.
- **New test.** A phone e2e test opens the longest lesson name, sets text to 130%, and checks ten pages. It **fails on the previous code** and passes now.
- **Remaining.** In landscape, and at very large text sizes, the board on the puzzle and opening pages starts lower down, so part of it needs a short scroll. Nothing is cut off. This was not tested on a physical phone.

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
- Mobile was tested with Chromium device emulation, not physical devices. Touch scrolling over the board is tested with synthetic touch events. Touch *dragging* of pieces is still not specifically tested (tap-to-move is).
- No real screen-reader testing (see above).
- Analysis explanations are fact-based but templated; some moments only show the engine line with an explicit "cannot name the idea" note.
- Shallow engine settings (quick analysis, easier levels) can misjudge positions; the analysis view states this.

## Final verification

- `npm run typecheck`: clean
- `npm run lint`: clean
After the audit fixes (all run, all passing):
- `npm test`: 182 unit and integration tests pass (including real Stockfish runs)
- `npm run validate:content`: 93 engine checks pass (lessons and placement check)
- `npm run build`: 69 static pages and service worker generated
- `npm run test:e2e`: 54 passed, 3 skipped (2 desktop-only tests and 1 touch-only test, each skipped on the other project)
