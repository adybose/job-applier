# 08 Side panel UI

## Purpose

Define the views, layout, and accessibility of the React side panel, the user's single control surface.

## Requirements

- **R-UI-1** Built with React and the `chrome.sidePanel` API. Clicking the extension icon opens the panel for the current tab (`setPanelBehavior({ openPanelOnActionClick: true })`).
- **R-UI-2** Views (tab bar or simple router):
  - **Onboarding**: model checks and benchmark (spec 07 R-MR-14, R-MR-15). Shown first until checks pass once.
  - **Profile**: upload CV/LinkedIn PDFs, extraction progress, conflicts, editor with source badges (spec 02).
  - **Run**: start button, state label, progress bar of required fields done (`resolved / required`), live action log (newest first, each line: field label, action, decision), card queue (spec 06), Pause/Stop.
  - **Review**: spec 06 R-HL-11 to R-HL-13.
  - **Settings**: endpoint and API style, model slots, `num_ctx` overrides, "Delete all my data".
  - **Stats**: applications filled, estimated minutes saved, fields auto-filled vs. approved vs. human, per-model latency and tokens/s (spec 07 R-MR-16).
- **R-UI-3** The panel connects to the background with a long-lived port; disconnect stops the run (spec 01 R-PS-14).
- **R-UI-4** Accessibility: all controls reachable by keyboard with visible focus, cards are a list with headings, live action log uses `aria-live="polite"`, buttons have text labels, color is never the only signal, contrast meets WCAG AA.
- **R-UI-5** Dark mode follows `prefers-color-scheme`. Styling uses local CSS only; no external fonts, icons, or images (inline SVG only).
- **R-UI-6** Copy is plain and short. Errors say what happened and what to do next.
- **R-UI-7** "Minutes saved" estimate: `max(0, 17 − humanMinutes)` per application, where `humanMinutes` = time with open cards + 1 minute review. Labeled as an estimate.

## Acceptance criteria

- **AC-UI-1** Given a fresh install, when the panel opens, then Onboarding is shown.
- **AC-UI-2** Given checks passed and no profile, when the panel opens, then Profile is shown.
- **AC-UI-3** Given a running run with 4 of 10 required fields resolved, when Run renders, then the progress bar reads "4 of 10 required fields".
- **AC-UI-4** Given keyboard-only navigation, when the user tabs through Run, then every button is reachable and focus is visible (Playwright check).
- **AC-UI-5** Given dark mode emulation, when the panel renders, then the dark palette applies.
- **AC-UI-6** Given the built extension, when its files are searched, then no `http(s)://` URLs to non-loopback hosts appear in HTML/CSS (fonts, images, scripts).

## Out of scope

- Popup UI (the side panel is the only UI besides in-page overlays).
- Localization (English only in v1).

## Open questions

- None.
