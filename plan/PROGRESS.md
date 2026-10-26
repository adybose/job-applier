# Progress

Newest entries at the bottom. Each entry: date, task, what changed, test status, next task.

## 2026-10-24 — Phase 0

- Wrote `CLAUDE.md`, specs 00–11, `plan/BUILD_PLAN.md`, `plan/DECISIONS.md`, and `fixtures/README.md`.
- Tests: none yet (docs only).
- Environment note: Node.js, pnpm, and Ollama were not installed on the dev machine at this point. T01 needs Node ≥ 20 and pnpm.
- Next: T01 (scaffold).

## 2026-10-24 — T01 Scaffold

- Installed pnpm 12.15 via Homebrew (Node 26.12 and Ollama were already present).
- Added WXT 0.21 + React 19 MV3 scaffold: background (opens the side panel on icon click), runtime-registered content script, side panel with stub views (Onboarding, Profile, Run, Review, Settings, Stats), dark mode, focus styles.
- Manifest: CSP from spec 01 R-PS-3, loopback-only `host_permissions`, `sidePanel/storage/unlimitedStorage/activeTab/scripting`.
- Strict TS, ESLint (typescript-eslint strict + react-hooks, with fetch/XHR/WebSocket banned in content scripts), Vitest with WXT plugin, Apache-2.0 LICENSE.
- Decisions: ADR-003 (drop `[::1]`), ADR-004 (toolchain versions).
- Tests: `pnpm typecheck` clean, `pnpm lint` clean, `pnpm test` 3/3 passing (manifest CSP and permissions). `pnpm build` produces `extension/.output/chrome-mv3`.
- Next: T02 (model client).

## 2026-10-25 — T02 Model client

- `shared/model/`: `isLoopbackUrl` + `LOOPBACK_ERROR`, 4B/12B presets, zod `ModelSettings` with Mapping/Drafting slots and "same model for both" (stored in `chrome.storage.local`), `ModelClient` (Ollama native `/api/chat` with `format`/`num_ctx`/`temperature`/`stream:false`; OpenAI-compatible `/v1/chat/completions` with `json_schema`), typed `ModelError` kinds (not-loopback, unreachable, forbidden/CORS, timeout, http, bad-response), call-time loopback check, timeout.
- Onboarding checks (reachable → CORS → models pulled), OS-specific CORS steps, quick benchmark (tokens/s from `eval_count/eval_duration`), `modelOptions` (presets greyed out with `ollama pull` when missing).
- Local call stats in IndexedDB (`lazyapply` DB, `calls` store); no prompt/response text stored.
- Side panel: Onboarding view (checklist, copyable commands, benchmark table, Continue once checks pass) and Settings view (endpoint, server type, model slots, num_ctx, custom model name).
- Verified against real Ollama 0.40.10: `/api/version` works, and a `chrome-extension://` Origin gets 403 without `OLLAMA_ORIGINS`, as the CORS check assumes. Started `ollama pull gemma3:4b-it-qat`.
- Tests: typecheck clean, lint clean, 45/45 unit tests passing (AC-PS-1/2, AC-MR-1..9). Build OK.
- Next: T03 (mock model server + Playwright network guard).

## 2026-10-25 — T03 Mock model + e2e harness

- `mock-model/server.ts` (Node built-in TS): Ollama `/api/version|tags|chat|embed` and OpenAI `/v1/models|chat/completions` on 127.0.0.1:11435. Replies come from `mock-model/recordings/*.json` (substring match on the prompt) or a schema-driven fallback (`fake-from-schema.ts`). Control endpoints `/__mock/mode` (ok, invalid-json, forbidden, error, delay, models), `/__mock/requests`, `/__mock/reset`.
- `scripts/static-server.ts` serves `fixtures/` on 127.0.0.1:4173 and :4174 (second origin for cross-origin iframes).
- Playwright harness (`e2e/harness.ts`): persistent Chromium with the built extension, extension id from the service worker, side panel opened as a tab with the model endpoint pointed at the mock. Every test records extension requests (service worker + extension pages) and fails on teardown if any went anywhere but the model endpoint.
- `pnpm test:e2e` (mock) and `pnpm test:e2e:ollama` (`LAZYAPPLY_E2E_OLLAMA=1`, real Ollama on localhost:11434).
- Tests: 5/5 e2e passing — guard unit check, onboarding + benchmark reach only the model (and the real request carries `num_ctx`/`temperature`/`stream:false`), guard flags a request to another loopback port (AC-TE-2), CSP blocks `https://example.com` (AC-PS-10), CORS steps on 403 (AC-MR-5). Unit tests, typecheck, lint green.
- Next: T04 (profile ingestion).

## 2026-10-25 — T04 Profile ingestion

- `shared/profile/`: zod `Profile` (sourced values) and model-facing `ExtractedProfile`; PDF checks (10 MB, `%PDF-` magic), pdf.js text extraction (bundled worker, no CDN), LinkedIn detection by headings, CV and LinkedIn prompts (`prompts/profile.ts`, delimited `DOCUMENT` data), extraction with JSON schema + one retry + partial salvage, chunking to the `num_ctx` budget, grounding filter (ADR-005), merge with conflicts (scalars, job titles), conflict resolution, profile/draft storage, CV/LinkedIn bytes in IndexedDB, "Delete all my data".
- Side panel: Profile view (upload, progress, conflicts, full editor with source badges, sticky Save) and the Settings "Delete all my data" button with in-panel confirmation.
- Fixtures: fictional Alex Rivera CV and LinkedIn PDFs (`scripts/make-fixture-pdfs.ts`), recorded extractions in `mock-model/recordings/`.
- Real model check (`LAZYAPPLY_OLLAMA=1 pnpm vitest run extract.ollama`): `gemma3:4b-it-qat` extracts both fixtures correctly in ~12–14 s each (~45 tok/s output on this Mac). It invented job bullets for the LinkedIn export until the grounding filter was added.
- Tests: 69 unit (+2 opt-in Ollama) and 7 e2e passing; typecheck and lint clean. AC-PI-1..8 and AC-PS-8 covered; AC-PI-9 moved to T09 (policy).
- Next: T05 (form fixtures).

## 2026-10-25 — T05 Fixtures

- Replica fixtures (ADR-007): `greenhouse.html` (classic board, React-Select race combobox, g-recaptcha), `greenhouse-embed.html` (careers page with the form in a cross-origin iframe on :4174), `lever.html` (h-captcha, radio custom question, work-samples upload), `ashby.html` (React-style controlled inputs, visually hidden resume input, Yes/No toggles, radio EEO, cf-turnstile), `generic.html` (all 8 label strategies, two-level open shadow DOM, password field, "Apply with LinkedIn", hidden/disabled/zero-size/honeypot fields, contenteditable, Apply/Send/Finish/Go/Submit application buttons).
- Every job description has a prompt-injection line.
- `fixtures/shared/fixture.js`: Submit click recording, React value-tracker emulation, React-Select-like combobox, Yes/No toggles.
- Tests: `e2e/fixtures.spec.ts` 11/11 (required elements, Submit recorded without navigation, no remote URLs, controlled-input semantics, cross-origin embed, combobox). Lint and typecheck clean.
- Next: T06 (FormSnapshot).

## 2026-10-25 — T06 FormSnapshot

- `shared/snapshot.ts` (zod `FormSnapshot`/`Field`/`Button`/`Blocker`, `mergeSnapshots`), `shared/policy/buttons.ts` (`isSubmitLike`, `isNavLike`).
- `content/`: deep traversal through open shadow roots, label resolution in spec order (plus Lever/Ashby specifics, ADR-009), kinds, visibility/honeypot filtering, required markers, options, current values, constraints, sections, help text, stable ids with re-render reuse, blockers (captcha/login/oauth/recorder), job description and step hint, lazy combobox option reading, debounced `dom-changed` messages.
- Side panel `page.ts`: inject into all frames, snapshot and merge per frame, read combobox options (ADR-008). Test hook `globalThis.__lazyApplyPanel`.
- Tests: 105 unit (labels in jsdom, button classification) and 24 e2e (AC-PP-1..9 on generic, Greenhouse, Lever, Ashby and the cross-origin Greenhouse embed). Lint and typecheck clean.
- Next: T07 (actions).

## 2026-10-25 — T07 Actions

- `shared/actions.ts` (zod action union; `click` requires `approvedNav: true`; `upload_file` only `fileKind: "resume"`), `shared/policy/options.ts` (`bestOption`, `declineOption`).
- `content/actions.ts`: React-safe fill (native setter + input/change/blur, then typing fallback), contenteditable, date/number normalization and maxlength, native select / radio / toggle-button / React-Select selection, checkbox, resume upload through `DataTransfer`, read-back plus 300 ms re-check, overwrite protection (only empty, identical, or our own previous value without `overwrite`), password refusal, in-page submit gate, scroll. `content/overlay.ts`: pointer-transparent highlight overlays with a label.
- Side panel `page.ts`: `act()` per frame, `resumePayload()` from IndexedDB.
- Tests: 10 new e2e (AC-AC-1..9, overlays, cross-origin embed), 9 new unit (option matching). All suites green.
- Next: T08 (deterministic mapper).

## 2026-10-25 — T08 Deterministic mapper

- `shared/agent/mapper.ts`: stage 1 with no model. `autocomplete` tokens first, then a label dictionary (names, email, phone, LinkedIn/GitHub/portfolio/website with `https://`, city/location/country/region/postal code, current company/title, notice period, start date). Never maps questions about other people (references, managers). Selects only map to a real matching option. Resume uploads use the CV (LinkedIn PDF flagged). Demographic questions propose the "decline" option (R-AL-13). Sponsorship, work authorization by country and relocation come from preferences. Salary uses the profile or becomes an "ask" (R-AL-14).
- Tests: 31 mapper cases (AC-AL-2 and more).
- Next: T09.

## 2026-10-25 — T09 Policy engine

- `shared/policy/sensitive.ts` (code-side classifier: salary, work authorization, EEO, disability, veteran, criminal, references, legal attestations, age; EEO sections). `shared/policy/route.ts`: handoff (password, failed, human-only steps, non-resume or missing uploads) → question/skip (no answer) → approval (sensitive by code or model, drafted text, overwrite, < 0.85) → auto (mapper or ≥ 0.85). Never-submit is enforced in T07's action layer and `isSubmitLike` (T06).
- Tests: 26 route/sensitivity cases (AC-AL-3..7, AC-PI-9, AC-PS-7). AC-PS-4/5 are covered by the action-layer e2e tests and T10's plan validation.
- Next: T10 (model planner).

## 2026-10-25 — T10 Model planner (stage 2)

- `shared/agent/context.ts` (profile as compact text, trimmed oldest-bullets-first; job description trimmed from the tail), `prompts/plan.ts` (v2; job description and field list wrapped as PAGE_DATA), `shared/agent/planner.ts` (35%/25% budgets, ≤ 15 fields per batch, structured output, one retry with the zod error, failed batches → questions, `validatePlan` discarding unknown ids / non-options / unfillable kinds, grounding caps per ADR-011).
- Real-model check (`LAZYAPPLY_OLLAMA=1 pnpm vitest run planner.ollama`): 6 Greenhouse-style questions in ~11 s on `gemma3:4b-it-qat`; grounded answers auto, inferred ones approval, unknown ones skipped.
- Tests: 14 planner unit tests (AC-AL-8/9, AC-MR-6 at num_ctx 8192, AC-PS-5/6). All suites green.
- Next: T11 (agent state machine + Run view).

## 2026-10-25 — T11 Agent state machine and Run view

- `shared/agent/machine.ts`: pure reducer (`IDLE → NEEDS_PROFILE | SCANNING → FILLING → WAITING_APPROVAL | WAITING_HUMAN → REVIEW → DONE`, plus `PAUSED`/`STOPPED`), cards (approval, question, handoff incl. CAPTCHA/login/recorder blockers; OAuth is logged only), action log, required-field progress, model work counter so REVIEW waits for the planner.
- `sidepanel/run/runner.ts`: effects. Inject → snapshot → stage 1 mapper → lazy combobox options → stage 2 planner → stage 3 hook → policy routing → sequential action queue (stops while paused) → read-back failures become handoffs with an overlay. Polls snapshots every 1.5 s (and on `dom-changed`) to pick up new fields, human-completed handoffs (value changed from the card's baseline) and solved CAPTCHAs (`resolved` token flag). Only touches its own `tabId`; lives in the panel, so closing the panel ends it.
- Run view: Start, phase, progress bar, Pause/Resume/Stop, card list (approval/question/handoff UI, used by T12/T13), live action log (`aria-live`). Mock model gained label-keyed plan recordings.
- Tests: 8 reducer unit tests (AC-AL-1); e2e: full Greenhouse run (auto-fills, resume upload, approvals for salary/sponsorship/EEO, handoffs for cover letter and CAPTCHA, no submit), pause (AC-HL-8), closing the panel (AC-PS-9). All suites green.
- Next: T12 (approval and question cards).

## 2026-10-25 — T12 Approval and question cards

- Cards UI (`sidepanel/run/Cards.tsx`): handoffs and required questions first, then approvals, in page order. Approval: proposal, reason, rationale, Approve / Edit / Regenerate (drafts) / Skip, option pickers for choice fields, character count for limited text. Question: input or option picker. "Remember this answer" (off by default for sensitive questions) saves to `profile.custom`; answer-memory matching is T18.
- Runner: `answer()` applies with `overwrite`, `remember()`, `resolve()`. Hardening: a rejected `executeScript` becomes a handoff, a failing queue task never stalls the queue, and our own in-flight or attempted values never count as "done by you".
- Test harness: `startRun()` keeps the job page as the visible tab. Measured: a background tab got ~22 of 50 timer ticks in 5 s and could stall entirely, which froze the content script's read-back waits. The real side panel sits beside a visible page.
- Tests: e2e edit+approve+remember (AC-HL-1/2), filling continues while cards wait (AC-AL-11), question card, skip, failed approval → handoff (AC-HL-9). All suites green.
- Next: T13 (handoff cards and auto-resume).

## 2026-10-25 — T13 Handoff cards and auto-resume

- Handoff cards ("Your turn"): one-sentence instruction, reason, overlay on the field, "I did it" and "Skip". The runner watches every snapshot: a field whose value changes from its card's baseline (not our own write) resolves as "done by you"; a CAPTCHA resolves when its widget disappears or its response token fills; blockers and fields resolve independently while filling continues.
- Tests: e2e Ashby portfolio upload resolves on its own after `setInputFiles` (AC-HL-3/4), filling continues during the handoff (AC-HL-5), Turnstile token and removed reCAPTCHA resolve (AC-HL-6), "I did it" on the password handoff, typing an answer resolves a waiting question. All green.
- Next: T14 (free-text drafting).

## 2026-10-25 — T14 Free-text drafting (stage 3)

- `prompts/draft.ts` (v1), `shared/agent/drafter.ts`: one Drafting-slot call per required or cover-letter question at temperature 0.6, 40%/40% budgets, cleanup (quotes, markdown, bullets), sentence-boundary fit to `maxlength` (default 1,200), and code-side grounding: sentences with numbers found in neither the profile nor the posting are dropped and the rationale says so. Optional "anything else?" boxes are not drafted. Regenerate forces a draft. Drafts always route to approval.
- Real model (`LAZYAPPLY_OLLAMA=1 pnpm vitest run drafter.ollama`): Gemma 3 4B wrote a specific, grounded 3-sentence answer in 4.9 s and ignored the posting's injection line.
- Network guard: allows the default endpoint as well as the mock, because the panel checks the default before a test points it at the mock (both are configured loopback model endpoints); still flags any other destination, including other loopback ports.
- Tests: 8 drafter unit tests (AC-AL-10, budget at 8192); e2e drafted essay card, salary question card, and AC-PS-6 checked on real requests (the injection line only appears inside PAGE_DATA). 201 unit + 45 e2e green, twice.
- Next: T15 (review screen).

## 2026-10-25 — T15 Review screen and Submit highlight

- Review panel (`sidepanel/run/ReviewPanel.tsx`): "Review and click Submit yourself.", required-field count, a table of every field Lazy Apply touched (value and Auto / Approved / Edited / You did it / Skipped; click to scroll), skipped required fields flagged in amber with an alert, optional fields left empty listed separately, "Show me Submit" and "I've submitted it" (→ DONE). Entering REVIEW scrolls to and outlines the page's Submit in green (`pickSubmit` prefers "submit", ignores OAuth buttons); it is never clicked.
- Run state moved up to `App` (`useRun`), so a run survives switching tabs; the Review tab shows the same review.
- Runner: human answers jump the action queue (an approval no longer waits behind ~1 s-per-field auto-fills).
- Tests: e2e full Lever run to review (AC-HL-7, AC-OV-1: decisions in the table, Submit outlined, zero clicks and submit events, tab switching, DONE) and skipped-required flagging. All suites green.
- Next: T16 (e2e across all fixtures).

## 2026-10-25 — T16 End-to-end across all P0 fixtures

- `e2e/all-fixtures.spec.ts`: a full run to review on Greenhouse, the cross-origin Greenhouse embed, Lever, Ashby and the generic form. Each asserts the resume is auto-uploaded, the non-resume upload is a handoff, the EEO question proposes "decline" for approval, free text is drafted for review, the CAPTCHA is a handoff, Submit is outlined in the frame that holds it, and no frame recorded a Submit click. Plus AC-TE-4: invalid model JSON → question cards, and the run still finishes.
- `clearCards()` moved to the harness (it acts like a user: approve, "I did it", skip).
- Every e2e test also runs the network guard on teardown (AC-OV-2 / AC-PS-3).
- Tests: 201 unit + 53 e2e green (1.8 min, no GPU). `pnpm test:e2e:ollama` needs `OLLAMA_ORIGINS=chrome-extension://*` on the machine's Ollama (not changed here).
- Next: T17 (README, privacy, demo script, DEV post draft).

## 2026-10-25 — Real-model end-to-end and site access (T16 follow-up)

- ADR-012: per-site access requested at Start (`sidepanel/run/access.ts`), `optional_host_permissions` only; manifest test updated.
- `pnpm test:e2e:ollama` verified against real `gemma3:4b-it-qat` through a temporary second Ollama on 127.0.0.1:11436 started with `OLLAMA_ORIGINS=chrome-extension://*` (the default Ollama on 11434 was left untouched; it still returns 403 to extensions). Set `LAZYAPPLY_OLLAMA_URL` to point the suite at it. Expect timeout is 120 s in this mode.
- Result: all 5 P0 fixtures run to review with the real model, never submitting; the handoff and review suites pass too (10 passed, 1 mock-only skipped, 1.6 min). One full application took 10–15 s of agent time on this Mac (model warm).

## 2026-10-25 — T17 README, privacy, demo script, DEV post draft

- `README.md`: pitch, demo GIF slot, three-command setup, OLLAMA_ORIGINS per OS, Mermaid architecture, the three stages, routing table, privacy and safety guarantees, model presets, development commands, license, dated changelog with the deadline rule.
- `docs/demo-script.md`: 60–90 s shot list with the fictional Alex Rivera profile and a fixture fallback. `docs/devto-post.md`: full draft with all six required sections, measured numbers (`pnpm measure`), the decisions-log story, and TODOs for the author's own story, video and repo link.
- Side panel shows "The local model is thinking about the remaining questions…" while the planner or drafter is running.
- Measured with real Gemma 3 4B (warm): Greenhouse 8.3 s / 9 auto / 10 approvals / 2 handoffs; Lever 6.7 s / 10 / 5 / 2; Ashby 5.6 s / 5 / 7 / 2.
- All P0 tasks done. Next: T18 (answer memory + Stats, P1).

## 2026-10-25 — T18 Answer memory and Stats (P1)

- `shared/memory/answers.ts`: normalized question keys (boilerplate and intent words dropped, synonyms such as salary≈compensation, relocate≈relocating), Jaccard ≥ 0.6 with kind compatibility and option snapping; IndexedDB `answers` store (DB v3). Consulted after the mapper and before the model; matches are proposals with `origin: "memory"` and go through the policy (sensitive → approval; remembered essays always → approval, a new route rule). "Remember" writes profile.custom and memory; reuse bumps `usedCount`. Profile view lists saved answers with edit/delete.
- `shared/stats/runs.ts` + Stats view: one record per application at its first review (auto/approved/edited/human/skipped, time with cards open + 1 min, agent time), minutes-saved estimate (17 − human minutes), per-model calls/latency/tokens per second from local call logs. Side panel shows when the model is still thinking.
- Harness fix: `openFixture` picks the newest tab when a fixture is open twice.
- Tests: 12 new unit (AC-AM-1..5, stats), e2e second application faster from memory plus Stats (AC-AM-6). All suites green.
- Next: T19 (multi-step forms, P1).

## 2026-10-25 — T19 Multi-step forms (P1)

- Reducer: `NAV_PROPOSED`/`NAV_RESOLVED` and nav cards. Runner: propose Next at the end of a step, click only after approval, "Not yet", re-scan/re-inject after step changes (ADR-013). Hidden blockers ignored; `<slot>` text read.
- Fixtures: `shadow-multistep.html` (three steps inside one shadow root, Next/Back, counts Next/Back/Submit clicks), `workable.html` (data-ui inputs, controlled inputs, hidden resume input, hCaptcha), `smartrecruiters.html` (web components with shadow roots for every input, select, dropzone and the Submit button).
- Cards are keyed by creation time, so a re-routed card starts from its new proposal.
- Tests: e2e multistep (one approval per Next, step 2 CV upload/handoff/draft, step 3 review with Submit outlined in the shadow root, Back never clicked, zero submits; "Not yet" stays), Workable and SmartRecruiters full runs, fixture validation for both. 214 unit + 62 e2e green twice.
- Next: T20 (scanned-PDF vision fallback, P1).

## 2026-10-25 — T20 Scanned-PDF vision fallback (P1)

- `prompts/ocr.ts`, `shared/profile/ocr.ts` (`fillScannedPages`), panel renderer (`renderPages`: pdf.js → canvas → JPEG), wired into ingestion with a progress message and a clear error when nothing can be read (ADR-014).
- Fixture: `alex-rivera-scanned.pdf`, a real image-only PDF (Chromium screenshot as DCTDecode JPEG).
- Real model: Gemma 3 4B transcribed the page with one misread word and the extraction recovered name, email and both jobs. Measured on battery: OCR ~22–27 s/page; schema-constrained extraction ~100–115 s (vs 12 s on AC earlier), so the default timeout is now 300 s.
- Tests: 3 unit (detection, render → OCR with images → extraction with grounding, unreadable scan) + opt-in `LAZYAPPLY_OLLAMA=1 pnpm vitest run ocr.ollama`.
- Next: T21–T23 (P2). Temporary Ollama on :11436 has been stopped.

## 2026-10-25 — T23 Static landing page (P2)

- `site/index.html`: one self-contained page (inline CSS, light/dark, no scripts, forms, fonts, remote images or analytics): pitch, demo slot, what it fills/asks/hands off, four install steps, privacy promises. `render.yaml` serves `site/` as a Render static site with a strict CSP (`default-src 'none'`, inline styles only, `form-action 'none'`) and `no-referrer`.
- Tests: `site/site.test.ts` (AC-DS-4: no forms/scripts/analytics/remote assets; install steps present).

## 2026-10-25 — T21 Embedding answer memory and T22 Workday (P2)

- T21: `ModelClient.embed` (Ollama `/api/embed`, OpenAI `/v1/embeddings`), `embeddingModel` setting ("auto"), vectors on saved answers with backfill, `shared/memory/semantic.ts` (prefixes, calibrated threshold, matcher), runner order mapper → semantic → word overlap. Real calibration (`LAZYAPPLY_OLLAMA=1 pnpm vitest run semantic.ollama`) drove ADR-015. Embedding models are hidden from the chat model list. Mock serves deterministic bag-of-words vectors.
- T22: `fixtures/workday.html` (data-automation-id inputs, controlled inputs, five steps with Save and Continue, button dropdowns with portal listboxes, consent, CAPTCHA). Button dropdowns as combobox fields; options read before stage 1; runner waits for the new step after a Next click; nav cards last (ADR-016).
- Tests: 228 unit (+ real-model opt-ins), e2e Workday full five-step run and "never offer Next before the new step is read". Full e2e suite green.
- All 23 tasks done.

## 2026-10-25 — Gemma 3 4B vs 12B

- Pulled `gemma3:12b-it-qat` (8.9 GB); `gemma3:4b-it-qat` and `embeddinggemma` were already present. `LAZYAPPLY_E2E_MODEL` selects the model for `pnpm measure`.
- On battery, same session: full applications 4B 13.3/9.6/8.6 s vs 12B 32.8/26.0/21.4 s (Greenhouse/Lever/Ashby), identical decisions; planning 16 s vs 41 s; drafting 5.3 s vs 13.5 s with clearly richer, still grounded drafts from 12B. Recommended setup: 4B mapping + 12B drafting. README and post updated. Temporary Ollama on :11436 stopped again.

## 2026-10-26: fix Greenhouse phone country picker

- Real Greenhouse (job-boards.greenhouse.io) labels phone-country options "India +91" but shows only "+91" once picked, so the stick check failed and the field became a handoff. `selectCombobox` now accepts a display that is a whole-word part of the chosen option (`shows`).
- `bestOption` maps common country short forms (USA, US, UK, UAE) to full names.
- Greenhouse fixture gains a dial-code country picker; e2e asserts the action succeeds (fails with `did-not-stick` before the fix).
- `MOCK_MODEL_PORT` moves the e2e mock model off 11435, which the Ollama desktop app now uses.
- Tests: 231 unit, 64 e2e passing (`MOCK_MODEL_PORT=11437 pnpm test:e2e`).
