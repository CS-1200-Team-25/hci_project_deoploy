# Local Gemini intervention provider

Requires Node 22.12+. Copy .env.example to .env and set GEMINI_API_KEY. Run
npm run provider and npm run dev in separate terminals, then open
http://localhost:5173. Restart the provider after changing .env and reload the
browser to fetch the updated configuration. APP_ORIGIN must match the browser
origin. Vite proxies /api to 127.0.0.1:8787 in dev and preview; production still
needs the service. Keep .env private and never prefix credentials with VITE_.

## Gemini configuration

The pilot uses Gemini's native generateContent API only. The default model is
gemini-3.5-flash-lite; GEMINI_MODEL selects a different available Gemini model.
The request uses systemInstruction, contents and a JSON-schema responseFormat.
Gemini 3 Flash-Lite requests explicitly send thinkingConfig.thinkingLevel = minimal.
Other configured models retain thinkingBudget = 0. The public configuration and
retained request/response settings record the actual setting; historical records
remain readable. Gemini 3 Flash-Lite rejects a zero budget and does not support
full thinking-off. Minimal is its supported lowest thinking level, not a guarantee
of disabled thinking or faster responses. See [Google?s thinking guide](https://ai.google.dev/gemini-api/docs/generate-content/thinking).
The server validates the returned signal ID, target and advice before exposure.
OpenAI Responses and chat-completions-compatible services are no longer supported.

GEMINI_API_KEY is primary, with GOOGLE_API_KEY as a fallback. Existing LLM_API_KEY,
LLM_MODEL and LLM_BASE_URL remain migration aliases; Gemini-specific settings take
precedence. LLM_PROVIDER may be omitted or set to gemini; other values fail at
startup. There is no runtime provider selection or automatic fallback.

The default API root is https://generativelanguage.googleapis.com/v1beta.
GEMINI_BASE_URL optionally overrides that root for a Gemini-protocol endpoint.
Include the API prefix without /models or :generateContent. URLs must use HTTPS,
or loopback HTTP, without embedded credentials, queries or fragments. Redirects
are rejected. A key is required even for a loopback endpoint.

GENERATION_TIMEOUT_MS defaults to 15000 (integer100-120000). Freeze provider,
model, prompt/schema and settings before a pilot; active conditions share them.
Browser configuration exposes provider/model, versions, output-token limit and
timeout. Keys and custom endpoint URLs remain server-only. Requests and displays
retain provider identity; normalized responses retain the upstream response ID
and actual model version when supplied. Historical records without a provider
field remain historical OpenAI-era data; they are not rewritten.

## Contract and failures

The loopback server accepts same-origin JSON POSTs, caps bodies at32KiB, allows
two concurrent calls and twenty per minute, and aborts on timeout or disconnect.
It has no study database or request logging. Only the selected signal and task
summary go upstream; participant/session/trial/selection identities stay local.
These are supervised local safeguards, not public authentication. Provider
retention terms still apply; no zero-retention claim is made.

GET /api/interventions/config reports public configuration. POST
/api/interventions accepts session/trial/task/selection/request IDs, revision,
signal and bounded JSON context. Unknown top-level fields (including condition)
are rejected. The Gemini parser normalizes output; shared validation checks signal/target
identity, type and bounded nonempty message. Refusal, truncation, malformed output
and provider errors yield sanitized failures, never fabricated advice.

The browser permits one pending request per trial; edits, completion, termination
and reload cancel/interrupt it. Recovery never replays requests. Display rechecks
provider/model/configuration, revision, unresolved signal and actual-display
cooldowns (30seconds global, 60 per signal). Only actual displays change exposure
history. Acknowledgement/dismissal are explicit responses; silence and later edits
do not imply ignoring or causation. Supervisor failures remain visible while
editing/submission work.

## Verification

Prompt `intervention-prompt-v2` requests one concrete edit plus a brief reason,
using the available UI labels, current plan and constraints. Task summaries
include supported edits and time encodings; schedule inputs list all editable
block types and mark fixed commitments immutable. Catalogs, schema, model and
the300-token output limit are unchanged. This is prompt guidance, not a semantic
feasibility guarantee or automatic plan editing.

For live qualitative samples, configure `.env` and run in PowerShell:

    $env:RUN_LIVE_ADVICE = '1'
    npx playwright test tests/advice-live.spec.ts --reporter=line
    Remove-Item Env:RUN_LIVE_ADVICE

This opt-in check starts its own local provider endpoint and sends three
fictional plans. Review the printed advice for a named option or specific edit,
a factual reason, and feasibility against the supplied plan. It is skipped in
the normal suite; passing structural checks alone does not prove advice quality.

Run npm run test:provider for controlled-upstream endpoint checks and npm test
for browser/session checks. A live smoke run needs a real configured key and both
services. In a non-baseline task, wait thirty seconds after reveal and edit while
leaving a qualifying issue. Confirm actual advice, the local generation request,
and provider/model/context/latency/display records in the export. Acknowledge or
dismiss advice and edit while waiting. Stop the service and trigger another
eligible selection: confirm supervisor failure status and no fabricated advice.
Visible non-baseline tasks also check unresolved issues after30 seconds of
inactivity, without a plan edit. Thresholds and display cooldowns still apply;
inactivity does not guarantee advice when no issue qualifies. Hidden tabs skip
these checks, and reload waits a fresh30 seconds before checking.
Baseline sends no proactive requests. Account access, real output quality and
latency require this manual run; mocked tests cannot prove them.

References: Google's [structured-output guide](https://ai.google.dev/gemini-api/docs/generate-content/structured-output),
[generateContent reference](https://ai.google.dev/api/generate-content), and
[chat-completions compatibility guide](https://ai.google.dev/gemini-api/docs/openai).

## Diagnosing timeouts

First request GET http://127.0.0.1:8787/api/interventions/config and confirm the
model and timeout match .env. This checks local availability, not upstream access.
A generation HTTP 504 with provider-timeout means the request exceeded the configured
budget. Raising the timeout allows a longer wait; it does not reduce latency.
Failures remain in the supervisor warning even after a later successful request.

To isolate Gemini from the local service, import this cURL into Postman and set
GEMINI_API_KEY and GEMINI_MODEL as private Postman environment variables:

```bash
curl --request POST 'https://generativelanguage.googleapis.com/v1beta/models/{{GEMINI_MODEL}}:generateContent' \
  --header 'x-goog-api-key: {{GEMINI_API_KEY}}' \
  --header 'Content-Type: application/json' \
  --data-raw '{"contents":[{"parts":[{"text":"Reply with exactly the word OK."}]}],"generationConfig":{"maxOutputTokens":20}}'
```

Compare the direct request's elapsed time with the local request. If the minimal
direct request is also slow, simplifying the app prompt does not explain that
latency. Check model availability and provider service health, and compare an
available alternative Gemini model with the same key. Do not share credentials
or authorization headers when reporting results. Controlled tests verify request
format and lifecycle behavior; they cannot guarantee live Gemini latency.

Generation failures retain the stable error code and include diagnostics with
provider/model, failure stage and elapsedMs. Upstream HTTP failures include
upstreamStatus and Gemini error status/message when available. Messages are
bounded, the configured key is redacted, and URLs are removed. Raw upstream
bodies, headers and exception messages are never returned. Transport errors
include recognized cause codes; timeouts include timeoutMs. Participant warnings
remain generic; Postman and retained response records expose these details.
