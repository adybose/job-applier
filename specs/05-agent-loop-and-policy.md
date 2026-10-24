# 05 Agent loop and policy

## Purpose

Define the agent's state machine, its three filling stages, and the code-based policy that routes every field to auto-fill, approval, or human handoff.

## Requirements

### State machine

- **R-AL-1** States: `IDLE → NEEDS_PROFILE → SCANNING → FILLING → (WAITING_APPROVAL | WAITING_HUMAN) → FILLING … → REVIEW → DONE`, plus `PAUSED` and `STOPPED` reachable from any active state.
  - `IDLE → NEEDS_PROFILE` if no saved profile, else `IDLE → SCANNING`.
  - A step navigation (URL or step hint change) from any filling state returns to `SCANNING`.
  - `FILLING` with open cards shows as `WAITING_APPROVAL` / `WAITING_HUMAN`, but filling of other fields continues (R-AL-12).
  - `REVIEW` is entered only when every required field is filled, skipped, or its handoff is resolved.
- **R-AL-2** The state machine is a pure reducer `(state, event) → state` in `shared/agent/machine.ts`, unit-tested without a browser.

### Stage 1: deterministic mapper (no model)

- **R-AL-3** Map fields straight from the profile using, in order:
  1. The `autocomplete` attribute (`given-name`, `family-name`, `name`, `email`, `tel`, `url`, `address-level2`, `country`, `country-name`, `postal-code`, …).
  2. A label dictionary of normalized patterns: first/last/full/preferred name, email, phone, LinkedIn, GitHub, portfolio/website, city, location, country, postal code, resume/CV (upload), current company, current title.
- **R-AL-4** Stage 1 values have `confidence: 1` and `origin: "mapper"`.

### Stage 2: model planner

- **R-AL-5** Send the remaining fields (id, kind, label, help, options, required, constraints, section), the relevant profile slice (spec 07 budgets), and the job description to the Mapping model.
- **R-AL-6** The model returns a JSON plan validated by zod:
  `{ actions: [{ field_id, value, skip: boolean, confidence: 0..1, rationale, sensitive: boolean }] }`. The action is derived from the field kind in code (ADR-011). Confidence is capped at 0.7 when the value is not stated in the profile (typed values) or shares no meaningful word with it (choices).
  The request passes the JSON schema as structured output (`format` for Ollama, `response_format` for OpenAI-compat).
- **R-AL-7** On a schema failure, retry once with the validation error appended. On a second failure, every field in that batch becomes a question card.
- **R-AL-8** Discard plan items with unknown `field_id`, actions not valid for the field kind, select values not in `options` (after fuzzy match), and any `click`/`upload_file`.
- **R-AL-9** Fields are batched (max 15 per call) to fit the context budget.

### Stage 3: free-text drafting

- **R-AL-10** Each textarea or long free-text question ("Why do you want to work here?", cover letter text box) is drafted in its own call to the Drafting model, grounded in the profile and job description, within the field's `maxLength` (or 1,200 characters if none). The prompt forbids inventing experience, employers, degrees, or numbers not in the profile. Output is plain text; it is truncated at a sentence boundary if over the limit.

### Policy engine (code, not model)

- **R-AL-11** `route(field, proposal, context) → "auto" | "approval" | "handoff" | "question"`:
  - **handoff** if: kind is `password`; kind is `file` and it is not a resume field (or no CV is stored); the field is in or behind a blocker; the action previously failed verification; the field is an e-signature, assessment, or recorder.
  - **question** if: the field is required and there is no proposal (or the proposal is `skip` / empty).
  - **approval** if any: `confidence < 0.85`; the field is sensitive (by code-side classifier, OR'ed with the model's `sensitive` flag); the value is drafted free text; it would overwrite an existing non-empty value; the value came from answer memory and the field is sensitive; resume would be the LinkedIn PDF.
  - **auto** if: origin is `mapper`, or `confidence ≥ 0.85` and not sensitive.
- **R-AL-12** The code-side sensitivity classifier matches label/section/help text against: salary/compensation/pay, sponsorship/visa/work authorization/right to work, gender/race/ethnicity/sexual orientation/pronouns (EEO), disability, veteran/military, criminal/conviction/background check, references, legal attestations ("I certify", "I agree", "consent", "acknowledge", privacy policy), and date of birth/age.
- **R-AL-13** EEO and demographic questions default to proposing "Decline to self-identify" (or the closest option, e.g. "I don't wish to answer") and always route to approval.
- **R-AL-14** Salary uses `profile.salaryExpectation`; if `askEachTime` is true, it becomes a question card.
- **R-AL-15** Approvals are batched: the agent queues cards and keeps filling other fields. Approved values are applied as they arrive.

### Navigation

- **R-AL-16** (P1) In multi-step forms, when all fields on the current step are resolved, the agent proposes clicking the `isNavLike && !isSubmitLike` button through an approval card ("Go to the next step?"). On approval it clicks, returns to `SCANNING`, and continues.

## Acceptance criteria

- **AC-AL-1** Given the reducer, when each valid event sequence is applied, then the expected states result; invalid events leave state unchanged.
- **AC-AL-2** Given fields with `autocomplete="email"` and a label "LinkedIn profile URL", when stage 1 runs, then both are mapped from the profile with `origin: "mapper"` and routed `auto`.
- **AC-AL-3** Given a plan item with confidence 0.9 for "Years of experience with Python", when routed, then `auto`; with 0.7, then `approval`.
- **AC-AL-4** Given a plan item with confidence 0.99 for "Expected salary", when routed, then `approval` even if the model said `sensitive: false`.
- **AC-AL-5** Given a "Gender" select, when planned, then the proposal is the decline option and the route is `approval`.
- **AC-AL-6** Given a required field with no proposal, when routed, then `question`.
- **AC-AL-7** Given a "Portfolio (PDF)" file field, when routed, then `handoff`; given "Resume/CV" with a stored CV, then `auto`.
- **AC-AL-8** Given invalid JSON twice from the mock model, when stage 2 runs, then those fields become question cards and no exception escapes.
- **AC-AL-9** Given a plan with an unknown field id and a select value not in options, when validated, then both are discarded.
- **AC-AL-10** Given a drafted answer of 2,000 characters for a field with `maxLength=500`, when post-processed, then it is ≤ 500 characters and ends at a sentence boundary.
- **AC-AL-11** Given an open approval card, when other auto fields exist, then they are filled before the card is answered.

## Out of scope

- Model-decided routing or model-decided clicks.
- Learning policy thresholds from user behavior.

## Open questions

- Is 0.85 the right threshold for small models? Default: keep 0.85; revisit with Stats data and record in DECISIONS.md.
