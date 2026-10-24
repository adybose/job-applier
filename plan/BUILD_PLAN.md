# Build plan

Pick the first unchecked task whose dependencies are all checked (see `CLAUDE.md` workflow). Finish all P0 before any P1. Cut P2 if fewer than 6 hours remain before **2026-10-25 23:59 PDT**.

| | Id | Task | Pri | Deps | Specs | Done when |
|---|---|---|---|---|---|---|
| [x] | T01 | Scaffold WXT MV3 extension: side panel, background, content script, Settings stub, strict TS, ESLint, Vitest, CSP, Apache-2.0 LICENSE | P0 | — | 01 R-PS-3/4, 08 R-UI-1 | `pnpm build` produces a loadable extension; manifest CSP test passes; `pnpm typecheck && pnpm lint && pnpm test` green |
| [x] | T02 | Model client (Ollama native + OpenAI-compat), `isLoopbackUrl` guard, 4B/12B presets with Mapping/Drafting slots, onboarding checks, quick benchmark, local call stats | P0 | T01 | 07, 01 R-PS-2 | AC-MR-1..9 and AC-PS-1/2 pass as unit tests |
| [x] | T03 | Mock model server and Playwright harness with network-guard test | P0 | T01 | 10 R-TE-3/7/9 | `pnpm test:e2e` loads the extension, guard test passes, and fails when a non-loopback fetch is injected |
| [x] | T04 | Profile schema, PDF text extraction, LinkedIn detection, CV/LinkedIn prompts, merge with conflicts, IndexedDB file store, profile editor | P0 | T02 | 02 | AC-PI-1..9 pass |
| [x] | T05 | Fixtures: Greenhouse, Lever, Ashby, generic (anonymized, per fixtures/README.md) | P0 | T03 | 10 R-TE-4, fixtures/README.md | Each fixture has all required elements and records Submit clicks |
| [x] | T06 | FormSnapshot: labels, kinds, options, shadow DOM, iframes, honeypots, blockers, JD extraction, stable ids, re-snapshot | P0 | T05 | 03 | AC-PP-1..9 pass |
| [x] | T07 | Actions: React-safe fill, contenteditable, select/combobox/radio, checkbox, resume upload, read-back verify and retry, click gate, highlight overlay | P0 | T06 | 04, 01 R-PS-7..9 | AC-AC-1..9 pass |
| [x] | T08 | Deterministic mapper (stage 1) | P0 | T04, T06 | 05 R-AL-3/4 | AC-AL-2 passes; mapper fills all identity/contact/link fields on every fixture |
| [x] | T09 | Policy engine: routing, sensitivity classifier, EEO decline default, never-submit | P0 | T06 | 05 R-AL-11..14, 01 | AC-AL-3..7, AC-PI-9 and AC-PS-4/5/7 pass |
| [x] | T10 | Model planner (stage 2): prompt with PAGE_DATA, structured output, validation, discard rules, retry, batching, budgets | P0 | T02, T09 | 05 R-AL-5..9, 07 R-MR-10/11 | AC-AL-8/9, AC-MR-6, AC-PS-6 pass |
| [x] | T11 | Agent state machine (reducer) and side panel Run view with live action log, progress, Pause/Stop, tab/panel scoping | P0 | T07, T08, T09, T10 | 05 R-AL-1/2, 08, 01 R-PS-13/14 | AC-AL-1, AC-UI-3, AC-HL-8, AC-PS-9 pass |
| [x] | T12 | Approval and question cards with batching and "Remember" | P0 | T11 | 06 R-HL-1..4/9/10 | AC-HL-1/2/9, AC-AL-11 pass |
| [x] | T13 | Handoff cards with overlay, field watching, auto-resume | P0 | T11 | 06 R-HL-5..8 | AC-HL-3..6 pass |
| [x] | T14 | Free-text drafting (stage 3) with Regenerate | P0 | T10, T12 | 05 R-AL-10 | AC-AL-10 passes; drafted fields always route to approval |
| [x] | T15 | Review screen and Submit highlight | P0 | T12, T13 | 06 R-HL-11..13 | AC-HL-7 passes |
| [ ] | T16 | Playwright e2e across all P0 fixtures with mock model | P0 | T14, T15 | 10 | AC-TE-1..4 and AC-OV-1/2 pass for all P0 fixtures |
| [ ] | T17 | README, privacy section, demo script, DEV post draft | P0 | T16 | 11 | AC-DS-1..3 hold |
| [ ] | T18 | Answer memory (token overlap) and Stats view | P1 | T12 | 09, 08 R-UI-2/7 | AC-AM-1..6 pass; Stats shows counts and per-model latency |
| [ ] | T19 | Multi-step forms: approved Next, re-scan, Workable/SmartRecruiters fixtures, shadow-DOM multi-step fixture | P1 | T16 | 05 R-AL-16, 03 R-PP-12 | e2e passes on multi-step fixtures with Submit never clicked |
| [ ] | T20 | Scanned-PDF vision fallback | P1 | T04 | 02 R-PI-4, 07 R-MR-17 | A scanned fixture PDF yields a valid profile via the mock |
| [ ] | T21 | Embedding-based answer memory | P2 | T18 | 09 R-AM-4 | Embedding match works with fallback to token overlap |
| [ ] | T22 | Workday shadow-DOM fixture and support | P2 | T19 | 03, 00 R-OV-1 | e2e passes on Workday fixture |
| [ ] | T23 | Static landing page in `site/` | P2 | T17 | 11 R-DS-6 | AC-DS-4 holds |
