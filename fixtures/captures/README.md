# Real captures

Pages saved from live job sites, used to check that Lazy Apply works on ordinary application forms it was not hand-tuned for. Unlike the replicas in `fixtures/`, these do not need the required elements (CAPTCHA, EEO block, second upload). They only need to load nothing remote and to count Submit clicks.

| File | Source | Captured |
|---|---|---|
| `clanx-real.html` | Recruitee careers page, `jobs.clanx.ai/o/ai-engineer-bangalore/c/new` | 2026-11-16 |

## What is kept exactly

The whole `<form>` subtree is byte-for-byte as served: ids (including Radix ids with `:` and `.`), `name`, `class`, `aria-*`, `autocomplete`, inline styles, label and question text. The tab list and tab panels around the form are kept too.

The only change inside the form is `data-submit=""` on the Send button, so `../shared/fixture.js` counts clicks and blocks the submit.

## What is removed or changed

- All scripts (the Recruitee app bundle, analytics, hCaptcha config), remote fonts (`@font-face`), images and the root `data-props` JSON.
- Remote `href`/`src` outside the form are replaced with `#`.
- The page chrome (navigation, footer) is dropped. The site's inline styled-components CSS is kept, so visibility checks (radios hidden as 1×1 px with clip, the file input at `opacity:0`) behave as on the live page.
- The job description in the hidden "Job details" panel is a short paraphrase, not the posting text. It includes one prompt-injection line, like the other fixtures.

Because the scripts are gone, React behavior is lost: the phone country picker does not open and inputs are not controlled. The tests cover reading and filling the form, not that behavior.

## Adding a capture

Save the page (DevTools → copy `<html>` outerHTML, or download it while signed out), keep the form as is, keep inline CSS but strip remote fonts and URLs, remove scripts, add `data-submit` to the submit button and `<script src="../shared/fixture.js">`. The tests in `e2e/fixtures.spec.ts` and `e2e/snapshot.spec.ts` pick up every `captures/*.html` on their own.
