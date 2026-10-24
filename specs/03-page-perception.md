# 03 Page perception (DOM-first)

## Purpose

Turn an application page into a compact, model-friendly `FormSnapshot` using the DOM, not screenshots. The snapshot is the single source of truth for what fields exist, what they are called, and what blocks the agent.

## Requirements

### Snapshot shape

- **R-PP-1** The content script produces:
  ```ts
  FormSnapshot {
    frameId: number; url: string; title: string;
    stepHint?: string;            // e.g. "2 of 4", from progress indicators/aria
    jobDescription?: string;      // main content text, trimmed
    fields: Field[]; buttons: Button[]; blockers: Blocker[];
  }
  ```
- **R-PP-2** Each `Field` has:
  - `id`: a stable id written to the element as `data-lazyapply-id` (reused if already present)
  - `kind`: `text | email | tel | url | number | date | textarea | select | combobox | radio-group | checkbox | file | contenteditable | password | unknown`
  - `label`, `helpText?`, `required`, `options?: {value, label}[]`, `value` (current), `constraints {maxLength?, pattern?, accept?, min?, max?}`, `section?` (nearest heading), `autocomplete?`, `name?`
- **R-PP-3** Each `Button` has `id`, `text`, `type`, `ariaLabel?`, `isSubmitLike` (spec 01 R-PS-7), and `isNavLike` (matches `next|continue|save and continue`).

### Labels

- **R-PP-4** Resolve labels in this order, taking the first non-empty: `label[for=id]`, wrapping `<label>`, `aria-labelledby` (joined), `aria-label`, `fieldset > legend` (for radio/checkbox groups), nearest preceding text node/element within the same field container, `placeholder`, `name`. Normalize whitespace and strip a trailing `*`.
- **R-PP-5** `required` is true for the `required` attribute, `aria-required="true"`, or a label ending in `*`.
- **R-PP-6** Radio inputs sharing a `name` are grouped into one `radio-group` field whose options are the individual radios' labels.

### Traversal

- **R-PP-7** Walk the document including **open shadow roots** (recursively) and **same-origin iframes**.
- **R-PP-8** Inject the content script with `all_frames: true` so cross-origin ATS iframes (such as Greenhouse embeds) produce their own snapshots. The background merges snapshots per `frameId`; actions are routed back to the owning frame.
- **R-PP-9** Skip fields that are hidden (`display:none`, `visibility:hidden`, `hidden`, `aria-hidden` ancestor), disabled, zero-size, off-screen honeypots (positioned far outside the viewport or `tabindex=-1` with a decoy name), and `type=hidden`.

### Custom controls

- **R-PP-10** Detect custom dropdowns: `role=combobox`, `role=listbox`, React-Select (`.select__control`, `[class*="-control"]` with an input), and Workday `data-automation-id` prompts. Report kind `combobox`. Options are read lazily by opening the control, reading `role=option` items, and closing it again (Escape) when the planner needs them.

### Job description

- **R-PP-11** Extract job description text from the page's main content: prefer `[data-qa*=job-description]`, `.posting-page`, `#content`, `main`, `article`; otherwise the largest text block outside the form. Limit to 12,000 characters before token trimming (spec 07).

### Updates

- **R-PP-12** Re-snapshot on DOM mutations (MutationObserver, debounced 400 ms), on step navigation (URL change or `stepHint` change), and after each batch of actions. Field ids remain stable across re-snapshots.

### Blockers

- **R-PP-13** Detect and report `blockers[]`:
  - `captcha`: iframes from `google.com/recaptcha`, `hcaptcha.com`, `challenges.cloudflare.com`; elements `.g-recaptcha`, `.h-captcha`, `.cf-turnstile`, `[data-sitekey]`.
  - `login`: a visible password field, or a form whose headings match "sign in|log in|create account".
  - `recorder`: video/audio recorder widgets (`<video>` with record controls, buttons matching "record|start recording", known one-way interview vendors).
  - `oauth`: buttons matching "apply with (linkedin|indeed|google|seek)".
  Each blocker has `id`, `type`, and a short description.

## Acceptance criteria

- **AC-PP-1** Given a fixture where each label strategy in R-PP-4 is used once, when snapshotted, then every field's label matches the expected text.
- **AC-PP-2** Given a field inside an open shadow root two levels deep, when snapshotted, then it appears with its correct label.
- **AC-PP-3** Given a hidden field, a disabled field, a zero-size field, and a honeypot, when snapshotted, then none appear.
- **AC-PP-4** Given three radios named `auth`, when snapshotted, then exactly one `radio-group` field with three options appears.
- **AC-PP-5** Given a React-Select control, when snapshotted, then it is kind `combobox`; when options are requested, then they are returned and the menu is closed afterward.
- **AC-PP-6** Given a fixture with a reCAPTCHA div, a password field, and "Apply with LinkedIn", when snapshotted, then `blockers` contains `captcha`, `login`, and `oauth`.
- **AC-PP-7** Given a re-render that replaces a field's DOM node with an identical one, when re-snapshotted, then the field keeps the same `id` (matched by name/label/kind).
- **AC-PP-8** Given the Greenhouse fixture, when snapshotted, then `jobDescription` contains the posting's first paragraph and no form labels.
- **AC-PP-9** Given buttons "Next", "Submit application", when snapshotted, then `Next.isNavLike` is true and `Submit application.isSubmitLike` is true.

## Out of scope

- Closed shadow roots (reported as `unknown` if detectable).
- Screenshot or vision-based perception of forms.
- Canvas-rendered forms.

## Open questions

- Cross-origin iframe merging depends on `all_frames` injection permission; see spec 01 open question.
