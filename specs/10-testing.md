# 10 Testing

## Purpose

Make the safety guarantees and core behavior verifiable on any machine, including CI without a GPU.

## Requirements

### Unit (Vitest)

- **R-TE-1** Unit tests cover at least: `isLoopbackUrl`, `isSubmitLike`, label resolution (jsdom), field kind detection, deterministic mapper, sensitivity classifier, policy routing, plan validation and discarding, zod schemas (Profile, plan), profile merge and conflicts, LinkedIn detection, prompt budgets at `num_ctx = 8192`, answer-memory normalization and matching, and the agent reducer.
- **R-TE-2** Privacy assertions as unit tests: the model client refuses non-loopback URLs; the built manifest CSP matches spec 01 R-PS-3; content-script modules contain no `fetch`/`XMLHttpRequest`/`WebSocket` calls (static check).

### End-to-end (Playwright)

- **R-TE-3** Playwright launches Chromium with the unpacked built extension (`--load-extension`, persistent context) and serves `fixtures/*.html` from a local static server on loopback.
- **R-TE-4** Fixtures (see `fixtures/README.md`): Greenhouse, Lever, Ashby, generic, and a shadow-DOM multi-step form (P1: Workable, SmartRecruiters; P2: Workday). Each fixture includes:
  - a resume upload,
  - a non-resume upload (must become a handoff),
  - an EEO block (must route to approval with decline proposed),
  - a free-text question (must be drafted and routed to approval),
  - a fake CAPTCHA div (must become a handoff),
  - a Submit button (must never be clicked; the fixture records clicks on `window.__submitClicks`).
- **R-TE-5** e2e tests drive the side panel by opening `chrome-extension://<id>/sidepanel.html?tabId=<id>` in a page, and auto-answer cards through the UI.
- **R-TE-6** Each e2e test asserts: required fields resolved, expected routes per field, `__submitClicks === 0`, Submit has the overlay, and the network guard passes.

### Mock model

- **R-TE-7** `mock-model/` is a small Node HTTP server on `127.0.0.1:11435` implementing `/api/version`, `/api/tags`, `/api/chat`, `/api/embed`, `/v1/models`, and `/v1/chat/completions`. Responses are recorded JSON keyed by `promptId` + a hash of the field ids, with a fallback generic responder. It can be configured to return invalid JSON, 403, or delays for error-path tests.
- **R-TE-8** `pnpm test:e2e` uses the mock. `pnpm test:e2e:ollama` runs the same suite against real Ollama at `localhost:11434` with looser assertions on values (routes and safety assertions unchanged).

### Network guard

- **R-TE-9** A Playwright fixture records every request from the extension's service worker and pages (`context.on('request')` plus service worker request events). The test fails if any request goes to a host other than the loopback model endpoint (fixture-page requests to the fixture server are excluded because they originate from the page, not the extension).

## Acceptance criteria

- **AC-TE-1** Given CI without Ollama, when `pnpm test && pnpm test:e2e` run, then all tests pass.
- **AC-TE-2** Given a code change that adds `fetch("https://example.com")` to the background, when e2e runs, then the network-guard test fails.
- **AC-TE-3** Given a code change that makes the agent click Submit, when e2e runs, then every fixture test fails on `__submitClicks`.
- **AC-TE-4** Given the mock configured for invalid JSON, when the planner runs, then fields become question cards (spec 05 AC-AL-8).

## Out of scope

- Testing against live ATS sites in CI.
- Visual regression testing.

## Open questions

- Playwright's support for driving `chrome.sidePanel` directly is limited; opening the panel page in a tab with a `tabId` query is the default workaround. Record in DECISIONS.md if a better approach is used.
