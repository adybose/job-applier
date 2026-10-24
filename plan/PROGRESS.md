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
