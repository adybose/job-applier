# 11 Demo and submission

## Purpose

Define the demo, README, and DEV post needed to submit to the DEV Hacktoberfest Open-Source AI Challenge, Week 3, targeting the overall prize and the Gemma featured category. Writing quality is weighted highest.

## Requirements

### Demo

- **R-DS-1** A 60–90 second screen recording, scripted in `docs/demo-script.md`:
  1. (0–10 s) A real Greenhouse posting. Click the Lazy Apply icon; the side panel opens.
  2. (10–25 s) Upload the CV PDF; the profile appears; click Save.
  3. (25–45 s) Start. Fields fill live; the action log scrolls. An approval card appears for salary; approve it. A handoff card highlights the portfolio upload; upload it by hand; the card resolves and the agent continues.
  4. (45–60 s) Review screen. Submit is highlighted: "Review and click Submit yourself."
  5. (60–75 s) A second application: answer memory pre-fills; fewer cards.
  6. (75–90 s) Terminal showing `ollama ps` with Gemma loaded, and Chrome DevTools network panel showing only `localhost:11434` requests.
- **R-DS-2** Use a fictional CV ("Alex Rivera") so no real personal data appears.

### README

- **R-DS-3** `README.md` includes: one-paragraph pitch, demo GIF, **three-command setup** (`ollama pull gemma3:4b-it-qat`, `pnpm install && pnpm build`, load unpacked), CORS note, architecture diagram (Mermaid), privacy guarantees (spec 01 summary), model choice table (4B vs 12B, alternatives), license (Apache-2.0), and a **dated changelog** that flags any commit after 2026-10-25 23:59 PDT.

### DEV post

- **R-DS-4** Draft at `docs/devto-post.md` with the challenge's required structure and these sections:
  - What it does and the effort saved
  - Demo
  - Code (repo link)
  - How I built it (specs-first, DOM perception, policy in code, Gemma via Ollama, 4B vs 12B)
  - Why open matters: data stays local, no per-application API bill, works offline, swap the model
  - Lazy Payoff numbers (from Stats: minutes saved, auto vs. approved vs. human, tokens/s per model)
- **R-DS-5** Plain, specific, honest writing: report real measured numbers, name limitations.

### Landing page (optional, P2)

- **R-DS-6** `site/` contains a static page with install steps and a demo GIF, deployable as a Render static site or on a .tech domain. It collects no data: no forms, analytics, cookies, or third-party scripts.

## Acceptance criteria

- **AC-DS-1** Given a fresh clone on macOS with Ollama installed, when the README's three commands are followed, then the extension loads and Onboarding checks pass.
- **AC-DS-2** Given `docs/devto-post.md`, when read, then all six sections from R-DS-4 are present.
- **AC-DS-3** Given the README changelog, when read, then each entry is dated and post-deadline entries are labeled.
- **AC-DS-4** Given `site/`, when its HTML is searched, then there are no `<form>`, `<script src=http…>`, or analytics snippets.

## Out of scope

- Publishing to the Chrome Web Store before the deadline.

## Open questions

- Which real Greenhouse posting to record on? Pick one on demo day; never submit on it.
