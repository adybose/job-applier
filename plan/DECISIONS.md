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
- **Consequences:** No broad `<all_urls>` permission at install time.
