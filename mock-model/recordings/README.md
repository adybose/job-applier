# Recorded model responses

Each `*.json` file here is one recording:

```json
{
  "match": ["substring that must appear in the prompt", "another one"],
  "response": { "any": "JSON value, or a plain string" }
}
```

The mock joins all chat messages and returns the first recording (by file name) whose `match` strings all appear. If none matches, it returns the smallest value that fits the request's JSON schema, or a short plain-text reply.

Name files `<fixture>-<prompt-id>.json`, for example `greenhouse-plan.json`. Use match strings that identify the fixture (a field label unique to it) and the prompt (its id line), not wording that changes often.
