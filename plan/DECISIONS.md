# Decisions

ADR-style log. Each entry: id, date, status, context, decision, consequences. Any change to a spec gets an entry here.

## ADR-001: Use WXT instead of Vite + @crxjs/vite-plugin

- **Date:** 2026-10-24
- **Status:** Accepted
- **Context:** The bootstrap allowed either Vite + `@crxjs/vite-plugin` or WXT. We need MV3, a side panel entrypoint, a background service worker, content scripts with `all_frames`, React, and Playwright e2e against the built extension, under a tight deadline.
- **Decision:** Use WXT (Vite-based). It has first-class `sidepanel`, `background`, and `content` entrypoints, generates the manifest (including CSP) from config, and has well-documented React and e2e setups. `@crxjs` has had long maintenance gaps around MV3.
- **Consequences:** Source lives under `extension/` with `srcDir: "src"`, so the repo map paths `extension/src/{background,content,sidepanel,shared,prompts}` hold. Build output goes to `extension/.output/chrome-mv3`.

## ADR-002: Programmatic injection on icon click

- **Date:** 2026-10-24
- **Status:** Proposed (confirm during T01/T06)
- **Context:** Spec 01 prefers minimal host permissions; spec 03 needs `all_frames` injection into cross-origin ATS iframes.
- **Decision:** Start with `activeTab` + `scripting` and inject with `chrome.scripting.executeScript({ target: { tabId, allFrames: true } })` when a run starts. If `activeTab` does not grant access to cross-origin iframes, add `optional_host_permissions` for known ATS hosts, requested at run time.
- **Consequences:** No broad `<all_urls>` permission at install time. T01 adds `host_permissions` for `http://localhost/*` and `http://127.0.0.1/*` only (model endpoint and loopback test fixtures); the content script uses WXT `registration: "runtime"` so it is not in the manifest.

## ADR-003: Drop `[::1]` as a model endpoint host

- **Date:** 2026-10-24
- **Status:** Accepted
- **Context:** Spec 01 listed `[::1]` as an allowed loopback host. CSP host-source syntax cannot express IPv6 literals, and Chrome match patterns for `host_permissions` do not reliably accept them either, so `[::1]` could pass validation and then be blocked at fetch time.
- **Decision:** Allow only `localhost` and `127.0.0.1`. `isLoopbackUrl` rejects `[::1]` with the normal "must run on this computer" message. Specs 01 R-PS-2/R-PS-3/AC-PS-2 updated.
- **Consequences:** Users with an IPv6-only local server use `localhost` instead. No change to the privacy guarantee.

## ADR-004: Toolchain versions

- **Date:** 2026-10-24
- **Status:** Accepted
- **Context:** Current releases on 2026-10-24 are TypeScript 7.0, React 19.3, zod 4.6, Vitest 5, ESLint 10. typescript-eslint 8.72 requires TypeScript `<6.1`.
- **Decision:** Pin TypeScript 6.0.3 so linting works. Use React 19 (CLAUDE.md said React 18; nothing depends on 18). Use zod 4's built-in `z.toJSONSchema` instead of `zod-to-json-schema` (spec 02 R-PI-5 updated). All versions pinned exactly in `package.json`.
- **Consequences:** Revisit TypeScript 7 once typescript-eslint supports it.
