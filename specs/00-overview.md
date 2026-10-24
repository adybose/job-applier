# 00 Overview

## Purpose

Lazy Apply is a local-first Chrome extension that fills in job application forms with an open-weight model running on the user's own machine. It works like a browser agent, but it is dedicated to job applications and is built around human control: it fills what it safely can, asks when judgment is needed, hands off what it must not do, and never submits.

This spec defines users, goals, scope, and the hackathon constraints. Every other spec refines one part of it.

## Users

- Job seekers applying to many roles on ATS-hosted forms.
- They are comfortable installing a Chrome extension and running Ollama, but they are not necessarily developers.
- They care about not leaking personal data and about not sending a wrong application.

## Requirements

- **R-OV-1** Support these form hosts by priority:
  - P0: Greenhouse (hosted and embedded), Lever, Ashby, generic HTML forms.
  - P1: Workable, SmartRecruiters.
  - P2: Workday (shadow DOM, multi-step).
- **R-OV-2** Reduce human time per application from roughly 15–20 minutes to **under 3 minutes**, measured from opening the side panel to the user clicking Submit, on a P0 fixture with an existing profile.
- **R-OV-3** Zero wrong submissions: the extension never submits an application (see spec 01).
- **R-OV-4** All inference runs on the user's machine through a loopback model endpoint. The default model is Gemma 3 (4B QAT), with Gemma 3 12B QAT as the quality preset (see spec 07).
- **R-OV-5** The main flow is:
  1. The user opens an application page and clicks the extension icon; the side panel opens.
  2. If no profile exists, the panel asks for a CV PDF and/or a LinkedIn PDF export. A local model extracts a structured profile, which the user reviews once (spec 02).
  3. The agent snapshots the form (spec 03) and fills fields (specs 04, 05).
  4. It pauses for approval where judgment, sensitivity, or low confidence is involved (spec 06).
  5. It hands control to the human for anything it cannot or must not do, watches for completion, and continues (spec 06).
  6. It shows a review summary and highlights Submit for the user to click (spec 06).
- **R-OV-6** The project is new code, licensed Apache-2.0, and the open-weight model is central to its function.
- **R-OV-7** Deadline: **2026-10-25 23:59 PDT**. Any commit after it is noted in the README changelog.

## Acceptance criteria

- **AC-OV-1** Given a user with a saved profile on a Greenhouse fixture, when they run Lazy Apply and handle all cards, then every required field is filled, skipped, or resolved and the Submit button is highlighted but not clicked.
- **AC-OV-2** Given any run on any fixture, when the network log is inspected, then the only requests the extension made went to the configured loopback model endpoint.
- **AC-OV-3** Given the repository, when `LICENSE` is read, then it is Apache-2.0.

## Out of scope (non-goals)

- Auto-submitting applications.
- Mass-applying or queuing many applications unattended.
- Job search and discovery.
- Creating accounts on ATS sites.
- Any cloud backend that stores or processes user data.
- Scraping LinkedIn. Users upload LinkedIn's own PDF export instead.
- Browsers other than Chrome (Chromium-based browsers may work but are untested).

## Glossary

- **ATS**: applicant tracking system (Greenhouse, Lever, …).
- **Run**: one pass of the agent over one application in one tab.
- **Card**: a side panel item asking the human for something (approval, question, handoff).
- **Handoff**: a step the human must do in the page themselves.

## Open questions

- Should the "under 3 minutes" metric be measured automatically in Stats (spec 08) or only reported from manual timing? Default: estimate in Stats from run duration and card count.
