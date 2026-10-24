# 02 Profile ingestion

## Purpose

Turn a CV PDF and/or a LinkedIn "Save to PDF" export into one structured, user-reviewed `Profile`, entirely on the user's machine.

## Requirements

### Input

- **R-PI-1** Accept a CV PDF, a LinkedIn PDF export, or both. Each file is limited to 10 MB and must have MIME type `application/pdf` (checked by magic bytes `%PDF-`).
- **R-PI-2** Extract text locally with `pdfjs-dist`, with the worker bundled into the extension (no CDN). Preserve line breaks and page order.
- **R-PI-3** Detect a LinkedIn export when at least 3 of these headings appear as standalone lines: `Contact`, `Top Skills`, `Summary`, `Experience`, `Education`. Use the LinkedIn extraction prompt for it, and the CV prompt otherwise.
- **R-PI-4** (P1) If a page yields fewer than 50 characters of text, render it to a PNG with pdf.js and send it to a multimodal Gemma model (spec 07) for extraction.

### Extraction

- **R-PI-5** Extraction uses the Mapping model with a JSON schema derived from the zod `Profile` schema (`zod-to-json-schema`). The output is validated with zod. On failure, retry once with the validation error; on a second failure, show the user an empty editor pre-filled with whatever parsed, plus a plain error message.
- **R-PI-6** Text is trimmed to the context budget of the selected preset (spec 07). For long CVs, extraction runs per section chunk and the results are merged.

### Merge

- **R-PI-7** Merge both sources into one `Profile`:
  - CV wins for contact details and work history.
  - LinkedIn fills fields that are empty in the CV result.
  - Experience entries are matched by normalized company name and overlapping dates; matched entries keep CV values and take missing values from LinkedIn.
- **R-PI-8** When both sources have different non-empty values for the same scalar field (for example email or a job title for the same company), record a `Conflict {path, cvValue, linkedinValue}`. The user resolves each conflict in the profile editor before the profile is saved.

### Schema

- **R-PI-9** `Profile` (zod) contains:
  - `identity`: `fullName`, `firstName`, `lastName`, `preferredName?`, `pronouns?`
  - `contact`: `email`, `phone`, `city`, `region?`, `country`, `postalCode?`
  - `links`: `linkedin?`, `github?`, `portfolio?`, `website?`, `other[] {label, url}`
  - `workAuthorization[] {country, authorized: boolean, status?}`
  - `sponsorshipNeeded: boolean | null`
  - `noticePeriod?` (free text, e.g. "4 weeks"), `earliestStartDate?` (ISO date)
  - `salaryExpectation {amount?, currency?, period?: "year"|"month"|"hour", askEachTime: boolean}`
  - `relocation {willing: boolean | null, locations[]}`, `remotePreference: "remote"|"hybrid"|"onsite"|"any"|null`
  - `experience[] {company, title, start, end | "present", location?, bullets[]}`
  - `education[] {institution, degree?, field?, start?, end?, grade?}`
  - `skills[]`, `languages[] {name, level?}`, `certifications[] {name, issuer?, year?}`
  - `custom: Record<string, string>` (saved answers)
- **R-PI-10** Every leaf value is stored as `{ value, source: "cv" | "linkedin" | "user" }`. Any user edit sets `source` to `user`.
- **R-PI-11** The profile is saved in `chrome.storage.local` under `profile.v1`, with a schema version for migrations.

### Files

- **R-PI-12** The original CV file is stored as a Blob in IndexedDB (`files` store) with name, type, size, and kind `resume`. The agent attaches it to resume upload fields (spec 04).
- **R-PI-13** The LinkedIn PDF is stored with kind `linkedin` and is never attached as a resume unless the user approves that in a card.

### Editor

- **R-PI-14** The profile editor shows every field, its source badge, and conflicts at the top. All fields are editable. The user must click "Save profile" once before the first run.

## Acceptance criteria

- **AC-PI-1** Given a 12 MB PDF, when uploaded, then it is rejected with "This file is over 10 MB."
- **AC-PI-2** Given a renamed `.pdf` that is really a PNG, when uploaded, then it is rejected with "This doesn't look like a PDF."
- **AC-PI-3** Given the text of a LinkedIn export fixture, when classified, then it is detected as LinkedIn; given a CV fixture, then as CV.
- **AC-PI-4** Given recorded model output for the CV fixture, when parsed, then it validates against `Profile` and every leaf has `source: "cv"`.
- **AC-PI-5** Given CV and LinkedIn results where the CV lacks GitHub and LinkedIn has it, when merged, then `links.github.source === "linkedin"`.
- **AC-PI-6** Given CV email `a@x.com` and LinkedIn email `b@y.com`, when merged, then a conflict on `contact.email` is listed and the profile cannot be saved until it is resolved.
- **AC-PI-7** Given invalid model JSON twice, when extraction runs, then the editor opens with partial data and an error message, and no exception escapes.
- **AC-PI-8** Given a saved CV, when IndexedDB is read, then the Blob round-trips with identical bytes.
- **AC-PI-9** Given a LinkedIn PDF only (no CV) and a resume upload field, when the run reaches that field, then an approval card asks "Use your LinkedIn PDF as your resume?" instead of auto-attaching.

## Out of scope

- DOCX or plain-text CV input (P2 at best).
- Fetching anything from linkedin.com.
- Generating or rewriting the CV.

## Open questions

- Should multiple CV variants be supported (e.g. per role type)? Default: one CV in v1; record if added later.
