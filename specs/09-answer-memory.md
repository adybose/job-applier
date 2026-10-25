# 09 Answer memory

## Purpose

Remember the user's answers to recurring questions so each new application is faster, without bypassing the policy.

## Requirements

- **R-AM-1** Store entries in IndexedDB store `answers`:
  `{ id, question_text, normalized_key, answer, field_kind, options_hash?, used_count, last_used, sensitive }`
- **R-AM-2** `normalized_key`: lowercase, strip punctuation and digits, remove stopwords and ATS boilerplate ("please", "your", "(optional)", "*"), lemmatize simple plurals, sort tokens, join with spaces.
- **R-AM-3** Matching (P0): Jaccard token overlap between normalized keys, with a synonym list applied first (e.g. `salary≈compensation≈pay`, `sponsorship≈visa`, `relocate≈relocation`, `start≈available≈availability`, `notice≈notice period`). A match requires overlap ≥ 0.6 and compatible `field_kind`. For choice fields, the remembered answer must match one of the current options (fuzzy).
- **R-AM-4** (P2) Embedding matching via Ollama `/api/embed` with EmbeddingGemma or `nomic-embed-text`, using each model's task prefix; cosine ≥ 0.56 for EmbeddingGemma (calibrated, ADR-015), 0.82 otherwise. Embeddings are stored locally. Falls back to P0 matching when the model is missing.
- **R-AM-5** Memory is consulted between stage 1 and stage 2. A memory hit becomes a proposal with `origin: "memory"` and `confidence = overlap score`. It still goes through the policy (spec 05): sensitive answers are pre-filled into approval cards, not auto-filled.
- **R-AM-6** Entries are written only when the user checks "Remember this answer" or "Save to my profile" (spec 06). On reuse, `used_count` and `last_used` update.
- **R-AM-7** The Profile view lists saved answers with edit and delete.

## Acceptance criteria

- **AC-AM-1** Given a saved answer for "Are you willing to relocate?", when a field "Would you consider relocating?" appears, then it matches.
- **AC-AM-2** Given a saved answer for "Desired salary", when "Expected compensation (USD)" appears, then it matches and routes to approval with the value pre-filled.
- **AC-AM-3** Given "Why do you want to work at Acme?" saved, when "Why do you want to work at Globex?" appears, then the overlap rule decides; a drafted free-text answer from memory is always routed to approval.
- **AC-AM-4** Given a saved choice answer "Yes" and current options ["Yes, I am", "No"], when matched, then "Yes, I am" is proposed.
- **AC-AM-5** Given an approval with "Remember" unchecked, when approved, then no memory entry is written.
- **AC-AM-6** Given the second run on the same fixture with answers remembered, when it completes, then fewer cards are shown than in the first run.

## Out of scope

- Syncing memory across devices.
- Sharing answer libraries between users.

## Open questions

- Should free-text answers ever be reused verbatim across companies? Default: reuse as a starting draft, always via approval.
