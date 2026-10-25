# 07 Model runtime

## Purpose

Define how the extension talks to a local open-weight model, which models ship as presets, how context budgets are enforced, and how the user checks their setup.

## Requirements

### Endpoints

- **R-MR-1** Default runtime is **Ollama** at `http://localhost:11434`, using the native `/api/chat` endpoint with `stream: false`, `format: <JSON schema>` for structured output, and `options.num_ctx` and `options.temperature` set explicitly on **every** call (Ollama's default context is small and silently truncates).
- **R-MR-2** An OpenAI-compatible `/v1/chat/completions` endpoint is supported for LM Studio and the llama.cpp server, using `response_format: {type: "json_schema", json_schema}`. Listing models uses `/v1/models`.
- **R-MR-3** Every endpoint URL passes `isLoopbackUrl` (spec 01) at save time and at call time.
- **R-MR-4** Calls time out after 300 s (configurable; ADR-014); timeouts surface as a plain error and the affected fields become question cards.

### Presets and slots

- **R-MR-5** Two built-in presets for a 16 GB Apple Silicon laptop:
  | Preset | Model | `num_ctx` | Note |
  |---|---|---|---|
  | Fast (default) | `gemma3:4b-it-qat` | 16384 | Light and quick |
  | Quality | `gemma3:12b-it-qat` | 8192 | Needs roughly 9 GB free memory |
- **R-MR-6** Settings has two slots, **Mapping model** (profile extraction, stages 1–2) and **Drafting model** (stage 3), and a **"Use the same model for both"** toggle, on by default.
- **R-MR-7** Each slot is a dropdown of the presets plus every model returned by `/api/tags` (or `/v1/models`). A preset that isn't installed is greyed out with its `ollama pull <name>` command and a copy button. An advanced text field allows any model name.
- **R-MR-8** `num_ctx` comes from the preset and can be overridden per slot.
- **R-MR-9** Model choice must not change behavior or safety: the policy, schemas, and tests are model-independent.

### Budgets

- **R-MR-10** Prompts are trimmed to a per-stage token budget computed from the slot's `num_ctx` (token estimate: `ceil(chars / 3.5)`), reserving output tokens:
  | Stage | Output reserve | Job description share | Profile share |
  |---|---|---|---|
  | Profile extraction | 4096 | — | (input text) |
  | Stage 2 planning | 2048 | 25% | 35% |
  | Stage 3 drafting | 1024 | 40% | 40% |
  The rest is for instructions and field data. Trimming removes oldest experience bullets first, then job description tail.
- **R-MR-11** A unit test asserts every prompt built from the largest fixture fits within `num_ctx = 8192`.

### Sampling and prompts

- **R-MR-12** Temperature 0.2 for extraction and mapping; 0.6 for drafting.
- **R-MR-13** Prompts live in `extension/src/prompts/*.ts`, each exporting `{ id, version, build(input) }`. Page data is wrapped in `<<<PAGE_DATA … PAGE_DATA>>>` (spec 01 R-PS-10).

### Onboarding checks

- **R-MR-14** Onboarding and Settings check, in order:
  1. Is the endpoint reachable? (`GET /api/version`). If not: "Start Ollama" instructions per OS.
  2. Is CORS configured? A 403 from Ollama means the extension origin is not allowed: show OS-specific instructions to set `OLLAMA_ORIGINS=chrome-extension://*` (macOS: `launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"` then restart Ollama; Linux: systemd override; Windows: user environment variable).
  3. Is each selected model pulled? Otherwise show `ollama pull <name>`.
- **R-MR-15** A **Quick benchmark** button runs a short fixed prompt on each selected model and shows tokens per second (from Ollama's `eval_count / eval_duration`) and total latency, so the user can choose between 4B and 12B with real numbers.

### Logging

- **R-MR-16** For each call, log locally `{ts, model, promptId, promptVersion, stage, inputTokens, outputTokens, latencyMs, ok}` to IndexedDB for the Stats view. Never log prompt or response content.

### Alternatives

- **R-MR-17** Qwen3 and Llama 3.x are documented in the README as alternatives. The demo uses Gemma. (P1) A multimodal Gemma model is used for scanned-PDF fallback (spec 02 R-PI-4) via `images` on `/api/chat`.

## Acceptance criteria

- **AC-MR-1** Given the mock server, when the client calls Ollama native chat, then the request body includes `format`, `options.num_ctx`, `options.temperature`, and `stream: false`.
- **AC-MR-2** Given the OpenAI-compat mode, when called, then the request uses `/v1/chat/completions` with `response_format.type === "json_schema"`.
- **AC-MR-3** Given an endpoint `http://192.168.1.5:11434`, when the client is invoked, then it throws before any request.
- **AC-MR-4** Given `/api/tags` lists only `gemma3:4b-it-qat`, when Settings renders, then the 12B preset is greyed out with `ollama pull gemma3:12b-it-qat`.
- **AC-MR-5** Given the mock returns 403 on `/api/chat`, when onboarding checks run, then CORS instructions for the current OS are shown.
- **AC-MR-6** Given the largest fixture and full profile, when each prompt is built for `num_ctx = 8192`, then its estimated tokens plus output reserve ≤ 8192.
- **AC-MR-7** Given "Use the same model for both" off and different models per slot, when stage 2 and stage 3 run, then each uses its slot's model (asserted on mock request logs).
- **AC-MR-8** Given a completed call, when the stats store is read, then a row with model, tokens, and latency exists and no prompt text is stored.
- **AC-MR-9** Given the mock returns `eval_count` and `eval_duration`, when benchmark runs, then tokens/s is computed correctly.

## Out of scope

- Bundling a model or runtime inside the extension (WebGPU in-browser inference is a possible future option).
- Remote or hosted model endpoints of any kind.

## Open questions

- Gemma 3 QAT tag names may differ on the Ollama library at build time; verify with `ollama list` and record any change in DECISIONS.md.
