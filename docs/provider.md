# Local intervention provider

Requires Node 22.12+ and an OpenAI project API key with access to the frozen
`gpt-4.1-mini-2025-04-14` default snapshot. `OPENAI_MODEL` can select a different
model before the pilot; freeze it for all conditions throughout the study.
`GENERATION_TIMEOUT_MS` defaults to 15000 and accepts integers 100–120000.
Copy `.env.example` to `.env`, set
`OPENAI_API_KEY`, run `npm run provider` in one terminal and `npm run dev` in
another. Open exactly `http://localhost:5173`; set `APP_ORIGIN` to the browser
origin if using a different port or preview (`http://localhost:4173`). Vite
proxies `/api` to the server on `127.0.0.1:8787`. Keep `.env` private; never
use a `VITE_` environment variable for credentials. `vite build` produces only
the browser bundle; the provider must run separately during a pilot.

The loopback service accepts JSON POSTs only from `APP_ORIGIN`, caps bodies at
32 KiB, permits two concurrent calls and twenty calls per minute process-wide,
and aborts calls after the configured timeout or when the browser disconnects. These are
local supervised-pilot protections, not a public deployment authentication
system. Do not expose this server publicly. No database or request logging is
used. Only the selected signal and current task summary reach OpenAI; session,
trial and selection identifiers stay local. `store: false` disables storage of
the response for retrieval; this is not a claim of zero provider data retention.

`GET /api/interventions/config` exposes the frozen model, prompt/schema versions,
maximum output tokens and timeout. Both active conditions use the same prompt,
model and settings. The POST contract accepts session/trial/task/selection IDs,
state revision, request ID, signal and `{taskId, summary}` context. Summary must
be a bounded JSON object containing finite numbers and safe JSON primitives;
task IDs and signal types must belong to the domain enums. Unknown top-level fields
(including condition) are rejected. The result carries `signalId`, intervention
`type`, `message`, `target`, model/settings/version metadata and optional provider
request ID. Strict structured output is checked again before returning it.
Failures return a JSON error and non-200 status; there is no canned fallback.

Run `npm run test:provider` for endpoint checks with a controlled upstream.
For a live smoke check, use a non-baseline birthday trial, wait at least thirty
seconds after reveal, then make a meaningful edit leaving a qualifying issue.
Confirm one suggestion appears, verify the network request goes to the local
`/api/interventions` endpoint, and inspect recorded generation/display events.
Remove the key or stop the provider and repeat with a fresh eligible selection:
confirm explicit failure with no fabricated suggestion or display event.
Live output quality, latency and account access require a real-key smoke run;
automated controlled-upstream tests do not establish those properties.

Client requests record the model/prompt/schema/settings returned by config before
generation. Request and response events remain distinct from actual display.
Every meaningful task edit invalidates the pending revision, including edits
resolving its issue; completion, termination and reload also cancel/interrupt it.
Only a validated current response updates display cooldowns (30 seconds globally,
60 seconds per signal). Failed attempts release reservations and can be selected
again on a later meaningful edit. Reload retains shown history and explicit
acknowledgement/dismissal without replay or a second display event. No response
is interpreted as ignoring, and subsequent edits are not labeled causal corrections.
Configuration, provider, timeout and invalid-output failures show a retained
supervisor status with a sanitized explanation and incident count. The warning
survives reload and survey navigation so failed generation remains visible when
assessing the pilot; cancellation after ordinary edits is not classified as failure.

Implementation follows the official OpenAI [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
