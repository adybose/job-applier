# Demo script (60–90 seconds)

Use the fictional **Alex Rivera** profile (`fixtures/profiles/alex-rivera-cv.pdf` and `alex-rivera-linkedin.pdf`) so no real personal data is on screen. Pick a real public Greenhouse posting on the day. **Never submit on it.**

## Before recording

- Laptop plugged in: on battery, schema-constrained calls ran about 10× slower in testing.
- Ollama running with `OLLAMA_ORIGINS=chrome-extension://*`; `gemma3:4b-it-qat` pulled and warmed up (run Quick benchmark once).
- Extension loaded from `extension/.output/chrome-mv3`; Settings → Delete all my data, so onboarding starts clean.
- Profile preferences to set after extraction: sponsorship No, authorized in the United States Yes, salary 165,000 USD per year.
- A small `portfolio.pdf` on the desktop for the handoff.
- Window: Chrome on the left two-thirds, a terminal on the right third for the last shot. Record at 1080p, 30 fps.

## Shot list

| Time | Show | Say (voice-over or captions) |
|---|---|---|
| 0–8 s | A real Greenhouse application page. Click the Lazy Apply icon; the side panel opens on Onboarding with green checks. | "This is Lazy Apply. It fills job applications with Gemma, running on my laptop." |
| 8–20 s | Profile → add the CV and LinkedIn PDFs → Read my files. The editor fills in; click "Use CV" on the email conflict; Save profile. | "It reads my CV and LinkedIn export locally, and only keeps what's actually in them." |
| 20–40 s | Run → Start → Chrome's site-access prompt → Allow. Fields fill live; the action log scrolls; cards appear. | "Name, contact, links and my CV go in automatically. Anything sensitive waits for me." |
| 40–50 s | Approve the salary card. Approve "Decline to self-identify" on Gender. Open the drafted "Why Acme?" answer, Approve. | "Salary, visa and diversity questions are one click, and I can edit or regenerate the drafted answer." |
| 50–60 s | The Portfolio upload is outlined: "Your turn". Upload `portfolio.pdf` by hand; the card disappears by itself. | "Uploads other than my CV, CAPTCHAs and passwords are my job. It notices when I'm done." |
| 60–70 s | Review appears; the Submit button on the page is outlined in green: "Review and click Submit yourself." | "It never clicks Submit. I review, and I submit." |
| 70–80 s | A second posting: Start again. Saved answers fill in; fewer cards. | "Answers I chose to remember make the next application faster." |
| 80–90 s | Terminal: `ollama ps` shows gemma3:4b-it-qat. DevTools → Network on the side panel, filtered to "all": only `localhost:11434`. | "No cloud, no API bill, nothing leaves this laptop." |

## Backup plan

If the live posting changes or blocks the demo, record the same flow on `fixtures/greenhouse.html` served with `node scripts/static-server.ts fixtures 4173`.
