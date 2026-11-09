# KLSR quiz trainer

**English** · [Українська](README.uk.md)

An offline trainer for the Ukrainian “Залікові питання КЛСР” exam question bank (modules 1–3, 209 questions).
It runs as a GitHub Pages site or as **a single self-contained HTML file** you can open directly in any modern browser — on mobile or desktop, without internet access.

The UI is in Ukrainian; this document describes the project for developers.

## Features

- **Question sets:** “Module 1” (100) or “General” (modules 1–3, 209).
- **Modes:**
  - **Flashcards** — question → reveal answer → “I knew it” / “I didn’t” (both advance; “didn’t” counts as a mistake).
  - **Multiple choice** — 4 options: the verbatim answer from the source plus 3 distractors, in a random order every time (re-shuffled when a skipped question comes back or a test is resumed).
- **Option difficulty** (multiple choice): **hard** (default) — the source distractors that differ from the answer by a few words or items, like the real exam; **easy** — distractors are the answers to adjacent questions of the same module (same shape, clearly different content). Select-all extras come from adjacent questions too.
- **Other formats:** in multiple-choice mode about **10%** of a round (rounded, at least one from 10 questions: 20 → 2, 30 → 3, 100 → 10) is automatically shown as a true/false statement, term-from-definition, select-all-that-apply, ordering (TLP, SMESC, METT-TC, EDIP, …) or an exam-sheet phrasing. A question appears **once per round** — either in the standard form or in another format, never both. In the General set, questions with identical text in different modules (M1 #32 / M2 #4, M1 #73 / M3 #20) never share a round. After answering, the original question and verbatim answer are shown.
- **Settings:** number of questions, kept per set (defaults: Module 1 — 20, General — 30), mistake limit (default 5), “exam preset” (30 questions, fail from 10 mistakes).
- **Skip** a question — skipped questions return at the end, tagged.
- **Score** counters; when mistakes reach the limit, a badge and a dialog (“Restart / Continue”).
- **Result:** percentage, status, grade on the exam scale (30–28 excellent, 27–24 good, 23–21 satisfactory, ≤ 20 fail; scaled for other round sizes), mistakes with your and the correct answer, “retry mistakes”.
- **Hard questions** (answered wrong) are remembered and can be practised from the home screen.
- **Saved questions:** star ☆ any question; a dedicated screen to review, remove, or practise them.
- **Excluded questions:** the ⊘ icon next to the star removes a question from all future tests. Another question takes its place, so the round size stays the same; when there is nothing left to substitute, the round shrinks. A notice offers “Undo exclusion” and a × close button, and dismisses itself after 30 s; a dedicated screen lists exclusions and restores any or all of them.
- **Version and “What’s new”** in the home-screen footer; the page is built from [`CHANGELOG.md`](CHANGELOG.md).
- **Unfinished test** is persisted and can be resumed after closing the tab.
- **Theme switch** on the home screen — system / light / dark; remembered and applied before first paint (no flash); switching is animated (sliding thumb and a circular reveal).
- **My lists:** hard, saved and excluded questions; one “Clear” button (with confirmation) empties all three.
- **After answering**, the correct option pulses and a wrong pick shakes; the page scrolls so the correct and chosen options are visible (the correct one always fully) and focus moves to the correct option (`Enter` → next). Answers can’t be changed afterwards.
- **Next question** smoothly scrolls to the question card; the score/progress bar is sticky.
- **All animations and transitions last ≤ 0.2 s** (enforced by an e2e test); disabled under `prefers-reduced-motion`.
- **Keyboard shortcuts** on desktop; responsive; accessible (ARIA roles, focus management).

## Data accuracy

Every question and correct answer is **verbatim from the source file**. [`tests/data/source.test.ts`](tests/data/source.test.ts) checks that each question and answer appears under its own number, in its own module of the PDF text ([`source/questions.txt`](source/questions.txt)), with items in the same order. Only case, whitespace, apostrophes and punctuation are ignored.

Three obvious PDF typos are corrected (and whitelisted in the test): M1 #16 “е віра” → “Це віра”, M1 #27 “свїх” → “своїх”, M1 #47 “вливати” → “впливати”.

True/false statements were written only where the answer follows unambiguously from the source. Distractors are invented and intentionally close to the correct answer.

Exam-sheet questions that have no answer in the source file (IAEA, intro-part duration %, azimuth, IHL “humanity” principle, etc.) were deliberately left out.

## Getting started

Requires Node.js ≥ 22.18 (TypeScript tests run natively via type stripping).

```bash
npm install
npm run dev        # http://localhost:5173 with rebuild on change
npm run build      # dist/index.html and dist/klsr-quiz.html
```

`dist/klsr-quiz.html` is the standalone file — copy it to a phone or share it; the deployed site also links to it (“Download offline version”).

## Scripts

| Command             | Description                                             |
| ------------------- | ------------------------------------------------------- |
| `npm run dev`       | Watch build + local server                              |
| `npm run build`     | Build a single inlined HTML file into `dist/`           |
| `npm run typecheck` | Strict TypeScript check                                 |
| `npm run format`    | Prettier                                                |
| `npm test`          | Unit tests + data verification (`node --test`)          |
| `npm run test:e2e`  | Playwright end-to-end tests (mobile + desktop profiles) |
| `npm run check`     | All of the above                                        |

Before the first e2e run: `npx playwright install chromium`.

## Architecture

```
src/
  data/     questions (module1–3.ts), alternative formats (variants.ts), sets (index.ts)
  core/     pure, DOM-free logic: rng, round building, easy distractors, session state machine, grading, storage, changelog
  ui/       controller (app.ts), components, screens (views/)
  main.ts   entry point
scripts/build.mjs   esbuild → one HTML file (CSS and JS inlined)
tests/
  unit/     core logic
  data/     data integrity and verbatim check against source/questions.txt
  e2e/      Playwright, runs against the built dist/klsr-quiz.html via file://
```

- **No runtime dependencies, no framework** — a small `h()` helper builds DOM nodes (text is never injected as HTML).
- **State** is immutable: the `core/session.ts` functions return new session objects; the `App` controller re-renders on change and persists to `localStorage` (with validation and migration from v1).
- **Randomness** is injectable (`Rng`). Test/debug URL parameters: `?seed=123` makes shuffling reproducible; `?alt=1` sets the share of alternative formats (0…1, default 0.1).

## Adding or editing questions

1. Edit `src/data/moduleN.ts`: `n` (number in the source), `q` (question), `a` (answer items; nested lists as `{ title, items }`), `w` (three distractors).
2. Optionally add formats in `src/data/variants.ts` (`tf`, `term`, `mcq`, `multi`, `order`). Correct answers are always derived from `a`.
3. Update `source/questions.txt` if the source document changed.
4. Run `npm test` — the verification test fails on any mismatch with the source.

## Deploying to GitHub Pages

1. Push the project to the `main` branch of a GitHub repository.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. Every push to `main` runs [`.github/workflows/ci.yml`](.github/workflows/ci.yml): typecheck → format check → tests → build → e2e → deploy. The standalone HTML is also uploaded as the `klsr-quiz-offline` artifact.
4. After the first `npm install`, commit `package-lock.json` and switch the workflow to `npm ci`.

> GitHub Pages sites are public. Make sure you are allowed to distribute the material (the exam sheets are marked as restricted to the Armed Forces of Ukraine).
