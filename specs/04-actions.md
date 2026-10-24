# 04 Actions

## Purpose

Define the small set of actions the agent may perform in the page, how each is executed so modern frameworks register it, and how success is verified.

## Requirements

### Tool set

- **R-AC-1** The only actions are:
  | Action | Args | Notes |
  |---|---|---|
  | `fill` | `fieldId, value` | text-like fields, textarea, contenteditable |
  | `select_option` | `fieldId, value` | native select, combobox, radio-group |
  | `set_checked` | `fieldId, checked` | checkbox |
  | `upload_file` | `fieldId, fileKind: "resume"` | resume only, from IndexedDB |
  | `click` | `buttonId` | navigation only, gated by policy (spec 01 R-PS-8) |
  | `scroll_to` | `fieldId` | |
  | `highlight` | `fieldId, style: "handoff"\|"submit"\|"focus"` | overlay, no DOM mutation of the field |
  | `clear` | `fieldId` | requires approval if the field is non-empty and user-typed |
- **R-AC-2** Actions are messages from the background to the owning frame's content script, validated with zod. Unknown actions are rejected.

### Execution

- **R-AC-3** `fill` uses the prototype's native value setter (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set`, or the textarea equivalent), then dispatches `focus`, `input` (bubbling), `change` (bubbling), and `blur`. This makes React and Vue state update.
- **R-AC-4** `fill` on contenteditable uses `document.execCommand('insertText')` after selecting the content; if unsupported, dispatch `beforeinput`/`input` `InputEvent`s with `inputType: "insertText"`.
- **R-AC-5** `select_option` on a native select sets `value` via the native setter and dispatches `change`. On a combobox, it opens the control, types the value to filter if there is an input, clicks the best matching `role=option` (case-insensitive exact, then prefix, then contains), and verifies. On a radio-group, it clicks the matching radio.
- **R-AC-6** `upload_file` reads the resume Blob from IndexedDB, builds a `File`, assigns it through `DataTransfer` to `input.files`, and dispatches `input` and `change`. It refuses `fileKind` values other than `resume`. If the input's `accept` excludes PDF, it becomes a handoff.
- **R-AC-7** `click` is executed only after the policy check passes in the background **and** a second check in the content script (`isSubmitLike` re-evaluated on the live element). Either check failing blocks the click.
- **R-AC-8** Never send the Enter key, never call `form.submit()` or `requestSubmit()`.

### Verification

- **R-AC-9** After every action, read the value back (input value, selected option label, `checked`, `files.length`, or text content). If it does not match, retry once with an alternative strategy (for example keyboard-like `InputEvent`s for fill, or click-based selection for selects). If it still fails, return `{ok:false, reason}` and the agent creates a handoff (spec 06).
- **R-AC-10** Re-read the value after 300 ms to catch frameworks that reset state; treat a reset as a failure.

### Safety

- **R-AC-11** All actions are idempotent: filling a field with the value it already has is a no-op returning `ok`.
- **R-AC-12** Never overwrite a non-empty field the user typed into (detected by a recorded `input` event not caused by the agent, or a value present before the run that differs from the proposal) without approval.
- **R-AC-13** Actions never type into `password` fields; the content script rejects it regardless of the caller.

## Acceptance criteria

- **AC-AC-1** Given a React-controlled input fixture, when `fill` runs, then the React state (rendered mirror text) shows the new value.
- **AC-AC-2** Given a contenteditable field, when `fill` runs, then its text content equals the value.
- **AC-AC-3** Given a React-Select combobox with options "United States", "United Kingdom", when `select_option("United Kingdom")` runs, then the control shows "United Kingdom".
- **AC-AC-4** Given a resume file input, when `upload_file` runs, then `files.length === 1`, `files[0].name` is the CV name, and a `change` event fired.
- **AC-AC-5** Given `upload_file` with `fileKind: "cover_letter"`, when executed, then it is rejected.
- **AC-AC-6** Given an input whose framework resets the value after 100 ms, when `fill` runs, then the result is `{ok:false}` after one retry.
- **AC-AC-7** Given a field the user typed "foo" into, when the agent proposes "bar", then no fill happens without approval.
- **AC-AC-8** Given `click` on a submit-like button that the background somehow allowed, when the content script re-checks, then the click is blocked.
- **AC-AC-9** Given `fill` on a password field, when executed, then it is rejected.

## Out of scope

- Drag-and-drop upload zones without an underlying `<input type=file>` (become handoffs).
- Date pickers that only accept clicks on a calendar widget (try typing first, else handoff).

## Open questions

- None.
