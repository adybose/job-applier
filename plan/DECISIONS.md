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

## ADR-005: Ground extracted profiles in the source document, in code

- **Date:** 2026-10-25
- **Status:** Accepted
- **Context:** Running the LinkedIn prompt on real `gemma3:4b-it-qat` showed that small models invent plausible job bullets ("Collaborated with cross-functional teams…") when a role has no description, copy the Summary into a job, and treat "Page 1 of 2" as a location. Tightening the prompt made the invention worse, not better.
- **Decision:** Enforce "never invent experience" in code (`shared/profile/grounding.ts`): drop jobs/schools/skills/certifications whose words are mostly absent from the document, drop bullets with < 80% of their words present, drop LinkedIn bullets that come from the Summary, and strip "Page N of M" lines before extraction. Spec 02 R-PI-6a added.
- **Consequences:** A model can still pick the wrong grounded value (the user reviews the profile once), but it cannot add experience that isn't in the user's own documents. This holds for any model the user picks.

## ADR-006: Profile storage details

- **Date:** 2026-10-25
- **Status:** Accepted
- **Context:** Spec 02 said every leaf carries a source and the CV is stored as a Blob.
- **Decision:** Sources are per scalar and per list entry (one job, one skill), not per field inside a job: the editor shows one badge per job. Files are stored as `ArrayBuffer` + name/type, so the background can send bytes to a content script to rebuild a `File` for upload. AC-PI-9 (LinkedIn PDF as resume needs approval) is enforced by the policy engine in T09.
- **Consequences:** Spec 02 R-PI-10/R-PI-12 updated.

## ADR-007: Hand-built ATS replica fixtures

- **Date:** 2026-10-25
- **Status:** Accepted
- **Context:** `fixtures/README.md` describes capturing real ATS pages and anonymizing them. With the deadline a day away, capturing and scrubbing four live ATS pages (and re-creating their client-side behavior) would cost hours, and verbatim job text has copyright concerns.
- **Decision:** Write replica fixtures that reproduce each ATS's markup patterns from public knowledge of their DOM (Greenhouse classic ids and `job_application[...]` names, Lever `application-question` lists and `urls[...]` names, Ashby `_systemfield_*` ids with React-style controlled inputs and Yes/No toggles, a generic form covering every label strategy). Behavior that matters to the agent (controlled inputs, React-Select comboboxes, cross-origin iframe embed, Submit click recording) is reproduced in `fixtures/shared/fixture.js` and verified by `e2e/fixtures.spec.ts`.
- **Consequences:** Real captures remain a P1 improvement. The demo still runs on a real Greenhouse posting (spec 11), which is the true end-to-end check.
