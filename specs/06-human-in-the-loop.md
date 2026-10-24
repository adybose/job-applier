# 06 Human in the loop

## Purpose

Define how the agent asks for approval, asks questions, hands control to the human, and hands over the final review, so the human stays in charge with as little effort as possible.

## Requirements

### Approval card

- **R-HL-1** Shows the question (field label), the section, the proposed value, and the rationale. Buttons: **Approve**, **Edit** (inline editor, then Approve), **Regenerate** (free-text only, re-runs stage 3), **Skip**.
- **R-HL-2** A "Remember this answer" checkbox saves the final value to `profile.custom` and to answer memory (spec 09). It is unchecked by default for sensitive fields and checked by default otherwise.
- **R-HL-3** Approve applies the value with the normal action path; if verification fails, the card turns into a handoff card.

### Question card

- **R-HL-4** Used when a required field has no answer. Shows the label, help text, and options (as buttons/select for choice fields, an input otherwise). On answer, it fills the field and offers "Save to my profile" (checked by default for non-sensitive fields).

### Handoff card ("Your turn")

- **R-HL-5** Created for anything the agent cannot or must not do:
  - uploading a non-resume file (cover letter file, transcript, portfolio PDF, work samples, ID documents),
  - video or audio responses and one-way interview recorders,
  - CAPTCHA, sign-in or account creation, OAuth "Apply with …" buttons, e-signatures, assessments or tests,
  - any field whose action failed to stick.
- **R-HL-6** The card says exactly what to do in one sentence (e.g. "Upload your portfolio PDF here."), scrolls to the field, and draws a highlight overlay (an absolutely positioned outline element; the field itself is not restyled).
- **R-HL-7** The agent watches for completion and marks the handoff done automatically:
  - text/select fields: `change` event with a non-empty value,
  - file inputs: `files.length > 0`,
  - blockers: the blocker element disappears or a CAPTCHA response token field becomes non-empty,
  - other: MutationObserver on the field's container.
  **I did it** and **Skip** buttons are always available.
- **R-HL-8** During a handoff the agent keeps filling other fields.

### Queue

- **R-HL-9** Cards are shown in page order. Handoffs and required questions appear before optional approvals. A counter shows "N things need you".
- **R-HL-10** Clicking a card scrolls to and focuses its field.

### Review screen

- **R-HL-11** Entered when all required fields are filled, skipped, or resolved. Lists every field the agent touched: label, final value (sensitive values shown, since the data is local), and how it was decided: **Auto**, **Approved**, **Edited**, **You did it**, **Skipped**.
- **R-HL-12** Clicking a row scrolls to that field. Required fields that were skipped are flagged in amber.
- **R-HL-13** The screen highlights the page's Submit button with the `submit` overlay style and says: **"Review and click Submit yourself."** The agent never clicks it.

### Control

- **R-HL-14** A Pause/Stop control is visible in every Run state. Pause stops dispatching actions and keeps cards; Resume continues; Stop ends the run and clears overlays.

## Acceptance criteria

- **AC-HL-1** Given an approval card, when the user clicks Edit, changes the value, and approves, then the edited value is filled and the review shows **Edited**.
- **AC-HL-2** Given an approval card with "Remember" checked, when approved, then `profile.custom` and answer memory contain the answer.
- **AC-HL-3** Given a "Portfolio (PDF)" upload, when the run reaches it, then a handoff card says to upload the portfolio and the field has a visible overlay.
- **AC-HL-4** Given that handoff, when a file is set on the input (test sets `files` via Playwright), then the card is marked done without clicking "I did it".
- **AC-HL-5** Given an open handoff, when other auto fields remain, then they are filled while the handoff is open.
- **AC-HL-6** Given a fake CAPTCHA div, when the div is removed, then the CAPTCHA handoff resolves.
- **AC-HL-7** Given all required fields resolved, when the run finishes, then the Review screen lists each touched field with its decision and the Submit button has the submit overlay, and it received no click.
- **AC-HL-8** Given Pause, when pressed, then no new actions are dispatched until Resume.
- **AC-HL-9** Given an approved value that fails verification, when applied, then the card becomes a handoff.

## Out of scope

- Approving on behalf of the user via keyboard shortcuts outside the side panel.
- Mobile layouts.

## Open questions

- None.
