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

## ADR-008: Run orchestration lives in the side panel; frames are reached with chrome.scripting

- **Date:** 2026-10-25
- **Status:** Accepted
- **Context:** The repo map put orchestration in the background service worker. MV3 service workers can be suspended mid-run, and spec 01 R-PS-14 requires that a run stops when the side panel closes.
- **Decision:** The agent loop runs in the side panel page, which exists exactly as long as the panel is open, so closing the panel stops the run with no extra plumbing. The panel injects `content-scripts/content.js` with `chrome.scripting.executeScript({ allFrames: true })` and calls the content script's API (`globalThis.__lazyApply`, shared isolated world) with `executeScript({ func })`, which returns results per `frameId`. Each frame snapshots only its own document and its open shadow roots; the panel merges them (`mergeSnapshots`). Content scripts only send `dom-changed` notifications back via `runtime.sendMessage`. Model calls are made from the panel (an extension page, covered by the CSP). The background only opens the panel.
- **Consequences:** Same-origin iframes are covered by `allFrames` injection rather than DOM traversal, so nothing is snapshotted twice. Host access for real ATS pages (activeTab vs. per-origin optional permissions) is settled in T11. Spec 03 R-PP-7 reads "same-origin iframes" as covered by injection.

## ADR-009: Perception details

- **Date:** 2026-10-25
- **Status:** Accepted
- **Decision:** (1) Visually hidden `<input type=file>` behind an upload button is kept; its visibility is judged by its parent. (2) A pair of sibling Yes/No buttons (Ashby) becomes a `radio-group` field with `widget: "toggle-buttons"`. (3) React-Select inputs are `combobox` with `widget: "react-select"`. (4) A wrapping label's text excludes the branch holding the control (Lever wraps upload buttons in the label). (5) A radio group uses its fieldset legend only when the fieldset holds nothing else; otherwise the text before its first option. (6) The longest job description across frames wins.

## ADR-010: No exception to "never click submit-like"

- **Date:** 2026-10-25
- **Status:** Accepted
- **Context:** Spec 01 R-PS-8 allowed clicking a submit-like control if the user approved that exact element as navigation; spec 04 R-AC-7/AC-AC-8 say the in-page check blocks submit-like clicks regardless.
- **Decision:** Take the stricter rule. The content script refuses every click on a control `isSubmitLike` matches, even with approval; a navigation click also requires `approvedNav: true` in the action schema. A multi-step form whose "next" button says "Continue to submit" is a handoff instead. Combobox selection tries unfiltered fuzzy matching before typing a filter, and never presses Enter (R-PS-9).
- **Consequences:** Spec 01 R-PS-8 updated. Zero-wrong-submission guarantee does not depend on approval UX.

## ADR-011: The model proposes values only; code derives actions and caps ungrounded confidence

- **Date:** 2026-10-25
- **Status:** Accepted
- **Context:** Spec 05 R-AL-6 had the model return `action` per field. On real `gemma3:4b-it-qat`, 4 of 6 answers used the wrong action name (`set_checked` for a radio, `fill` for a select) and were discarded. The model also auto-filled values it computed ("6 years", wrong) or guessed ("How did you hear: Company website") at confidence 0.9–1.0.
- **Decision:** The plan schema is `{field_id, value, skip, confidence, rationale, sensitive}`; the action comes from the field kind in code, so the model cannot express clicks or uploads at all. Confidence is capped at 0.7 (below the 0.85 auto threshold) when a typed value is not stated in the profile as a whole word/phrase, or when a choice shares no meaningful word with the profile. Prompt v2 asks for ≤ 0.7 on anything calculated or guessed.
- **Consequences:** With the same model, grounded answers auto-fill, inferred ones go to approval, unknown ones are skipped. Spec 05 R-AL-6 updated.

## ADR-012: Site access is requested per site at Start

- **Date:** 2026-10-25
- **Status:** Accepted (supersedes the open part of ADR-002)
- **Context:** Fixtures run on loopback, which the extension can always access. Real ATS pages need host access; cross-origin job-board iframes (Greenhouse embeds) need their own; and `activeTab` alone is revoked when a multi-step form navigates.
- **Decision:** `host_permissions` stay loopback-only. `optional_host_permissions` is `https://*/*` and `http://*/*`, but nothing is granted at install. Clicking the toolbar icon gives `activeTab`, which lets the panel read the tab's URL and list its iframes. On Start (a user gesture) the panel requests exactly the tab's site plus any known job-board iframe sites in one Chrome prompt; if already granted there is no prompt. Without `activeTab` the panel asks the user to click the icon on the job page.
- **Consequences:** Users see one plain Chrome prompt per site they apply on. No broad access, and no `tabs` permission (which would expose all tab URLs).

## ADR-013: Multi-step navigation and hidden blockers

- **Date:** 2026-10-25
- **Status:** Accepted
- **Decision:** When a step's required fields are all resolved and the page shows a Next/Continue control (`isNavLike && !isSubmitLike`), the runner proposes a "Go to the next step?" card instead of entering review. Approving it sends the only click Lazy Apply ever makes (`approvedNav: true`, re-checked in the page). "Not yet" is remembered until new fields appear. After any step change the runner re-scans, and re-injects the content script if a full page load dropped it. Blockers (CAPTCHA, OAuth, recorder) only count when visible, so a CAPTCHA on step 3 doesn't block step 1. Text inside web-component buttons is read through `<slot>` assigned nodes.
- **Consequences:** Multi-step forms work with one approval per step. Workable, SmartRecruiters (web components with shadow roots) and a three-step shadow-DOM form are covered by e2e.

## ADR-014: Scanned-PDF fallback via OCR transcription; 300 s model timeout

- **Date:** 2026-10-25
- **Status:** Accepted
- **Context:** Spec 02 R-PI-4 asked to send scanned page images to a multimodal Gemma for extraction. Sending images straight into the structured extraction would bypass the grounding filter (ADR-005), which needs document text.
- **Decision:** Two steps. Gemma first transcribes each scanned page (≤ 3 pages, rendered by pdf.js to JPEG in the panel; temperature 0; prompt `ocr` v1), then the transcript goes through the normal extraction, grounding and review. A real image-only CV fixture (`fixtures/profiles/alex-rivera-scanned.pdf`, made by `scripts/make-scanned-pdf.ts`) is read correctly by `gemma3:4b-it-qat` except one misread word ("Globelex"), in about 22–27 s per page. The default model timeout goes from 120 s to 300 s: on battery power the same Mac ran long schema-constrained outputs ~10× slower (CV extraction 100–115 s instead of 12 s), and a timed-out extraction leaves the user with an empty profile.
- **Consequences:** Spec 07 R-MR-4 updated. OCR errors are visible in the profile editor before first use.

## ADR-015: Semantic answer memory with EmbeddingGemma, calibrated

- **Date:** 2026-10-25
- **Status:** Accepted
- **Context:** Spec 09 R-AM-4 proposed cosine ≥ 0.82. Measured on 12 question pairs with `embeddinggemma`: without a task prefix, paraphrases (0.627–0.848) and unrelated questions (0.481–0.699) overlapped, and 0.82 matched only 1 of 6 paraphrases. With the prefix `task: search result | query: `, paraphrases scored 0.594–0.772 and unrelated pairs 0.332–0.525.
- **Decision:** Use model-specific task prefixes (EmbeddingGemma as above; nomic-embed-text `search_query: `) and a calibrated threshold of 0.56 for EmbeddingGemma (0.82 elsewhere, uncalibrated). The embedding model is picked automatically when installed ("auto"), never chosen as a chat model, and older saved answers get vectors on first use. Semantic matches carry their similarity as confidence (< 0.85), so the policy always sends them to approval; exact word matches can still auto-fill non-sensitive answers.
- **Consequences:** Reworded questions are pre-filled for one-click approval; a wrong semantic match can't land without the user seeing it.

## ADR-016: Workday dropdowns and step transitions

- **Date:** 2026-10-25
- **Status:** Accepted
- **Decision:** `button[aria-haspopup=listbox]` is a combobox field (opened by click, listbox found via `aria-controls`), never an action button. Combobox options are read before stage 1, so the mapper can match "USA" to "United States of America". After an approved Next click the runner counts as busy until the new step's fields are scanned (or 4 quiet polls), so another "Next" can never be offered before the new step has been read; "Go to the next step?" cards always sort last.
- **Consequences:** Found by tracing a Workday run, where an early Next card let a user skip a step of unanswered questions.
