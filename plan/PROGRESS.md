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
