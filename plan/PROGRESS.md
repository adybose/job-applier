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
