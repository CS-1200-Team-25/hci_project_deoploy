# Local intervention provider

Requires Node 22.12+. Copy .env.example to .env, set GEMINI_API_KEY, then run
npm run provider and npm run dev in separate terminals. The default is Gemini's
native API with gemini-2.5-flash-lite; LLM_MODEL selects the model. Open
http://localhost:5173. APP_ORIGIN must match the browser origin. Vite proxies
/api to 127.0.0.1:8787 in dev and preview; production still needs the service.
Keep .env private and never prefix credentials with VITE_.

## Provider and model configuration

| LLM_PROVIDER | API | Credential | Default model |
| --- | --- | --- | --- |
| gemini (default) | Google generateContent | GEMINI_API_KEY or GOOGLE_API_KEY | gemini-2.5-flash-lite |
| openai | OpenAI Responses | OPENAI_API_KEY | gpt-4.1-mini-2025-04-14 |
| openai-compatible | Chat completions | LLM_API_KEY | Explicit LLM_MODEL required |

LLM_API_KEY overrides provider-specific keys. LLM_MODEL overrides legacy
GEMINI_MODEL / OPENAI_MODEL. LLM_BASE_URL overrides the server's API root;
include its version/path prefix, without the operation. Built-in providers have
default roots; compatible endpoints require an explicit root. URLs must use
HTTPS, or loopback HTTP, without embedded credentials, queries or fragments.
Redirects are rejected. A local compatible service example:

    LLM_PROVIDER=openai-compatible
    LLM_MODEL=your-installed-model
    LLM_BASE_URL=http://127.0.0.1:11434/v1

Loopback compatible services can run without a key; remote services require
LLM_API_KEY. The model/service must support strict JSON-schema response_format,
system/user messages and max_tokens. Compatibility varies: unsupported settings
fail explicitly, without fallback advice or automatic provider switching.
Arbitrary APIs are not interchangeable. Add another protocol in
server/adapters.mjs with its default model/root, credential resolver, build and
parse functions. The parser returns {text, id?, model?} or ProviderOutputError.
Shared HTTP protections, validation, timeout and browser behavior then apply.

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
are rejected. Adapters normalize output; shared validation checks signal/target
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

Run npm run test:provider for controlled-upstream endpoint checks and npm test
for browser/session checks. A live smoke run needs a real configured key and both
services. In a non-baseline task, wait thirty seconds after reveal and edit while
leaving a qualifying issue. Confirm actual advice, the local generation request,
and provider/model/context/latency/display records in the export. Acknowledge or
dismiss advice and edit while waiting. Stop the service and trigger another
eligible selection: confirm supervisor failure status and no fabricated advice.
Baseline sends no proactive requests. Account access, real output quality and
latency require this manual run; mocked tests cannot prove them.

References: Google's [structured-output guide](https://ai.google.dev/gemini-api/docs/generate-content/structured-output),
[generateContent reference](https://ai.google.dev/api/generate-content), and
[chat-completions compatibility guide](https://ai.google.dev/gemini-api/docs/openai).
