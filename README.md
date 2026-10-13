# Planning study prototype

React + TypeScript + Vite prototype for a supervised planning pilot. The current
implementation assigns a participant session, collects draft consent, displays
shared instructions, supports all three timed planning tasks and required surveys, and restores progress
after a reload. `ARCHITECTURE.md` defines the full study contract; `CONTEXT.md`
describes the implemented domain and remaining work.

## Development

Use Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite (normally http://localhost:5173). For a
task-only dry run, leave the provider stopped and use a baseline sequence:
**1** for birthday first, **13** for weekend first, or **25** for weekly schedule
first. Enter a disposable participant ID and a supervisor access code of at
least six characters, then complete consent and reveal the first task.

To enable AI suggestions, copy `.env.example` to `.env` and set
`GEMINI_API_KEY`. Start the provider in a second terminal while Vite stays running:

```sh
npm run provider
```

Keep `.env` private. Restart the provider after changing its configuration and
reload the browser. See [provider setup and troubleshooting](docs/provider.md).
Low/high sessions without the provider can show a configuration failure when
an issue qualifies; they cannot display generated suggestions.

For focused testing, choose the first task and condition with these sequence indices:

| First task | Baseline | Low eagerness | High eagerness |
| --- | ---: | ---: | ---: |
| Birthday | 1 | 3 | 5 |
| Weekend | 13 | 15 | 17 |
| Weekly schedule | 25 | 27 | 29 |

Build and typecheck with:

```sh
npm run typecheck
npm run build
npm run preview
```

## Supervised session setup

Enter a pseudonymous participant ID (letters, numbers, underscores or hyphens;
no names or contact details) and a sequence index from 1 to 36. The supervisor
allocates indices sequentially, wrapping to 1 after a full cycle. Each sequence
crosses one of six task orders with one of six condition orders. Full-cycle
balance does not guarantee balance for a smaller pilot.

Set a supervisor access code of at least six characters before handing the
session to the participant. Keep the code with the supervisor. Exceptional
termination requires unlocking supervisor controls and entering a reason;
reload locks the controls again. A salted SHA-256 verifier is stored locally,
not the plaintext code. This protects ordinary supervised controls; it is not
remote authentication or a defense against someone modifying browser data.

Assignment, phase, timing anchors, configuration and ordered event records are
stored under `planning-pilot-session-v1` in browser local storage after each
committed action. Reload resumes that same session. Consent checkboxes remain
unchecked until consent is committed. The elapsed wall-clock timer starts at
scenario reveal and includes time in hidden tabs and across reloads.

Damaged or incompatible saved data is preserved and blocks a replacement
session. Saving failures show an alert and retain current data in memory; keep
that tab open for the supervisor. Clearing browser data removes local records.
Use supervisor storage tools to download session JSON before clearing data.

## Inspecting session JSON

In Chrome or Edge, open **Dev Tools → Application → Local Storage → the app's
origin** (normally `http://localhost:5173`). Select the
**`planning-pilot-session-v1`** key. Its value is the saved session JSON,
including assignment, trials, plans, configuration and ordered events.

To inspect a parsed copy in the Dev Tools Console:

```js
JSON.parse(localStorage.getItem('planning-pilot-session-v1'))
```

For a downloadable analysis file, open **Supervisor tools → Supervisor storage
tools → Download session JSON**. The export includes the session, ordered events
and derived trial metrics, and excludes the supervisor verifier. Raw local
storage includes that verifier and is not the same format as the export.

Use `trialMetrics[].displayCount` in the export or `agent_intervention_shown`
events to count actual popups. Requests and selections are separate from displays;
generation records include `requestedAt`, `finishedAt` and `latencyMs`.

To start a fresh disposable test, export any records you need, delete only the
`planning-pilot-session-v1` key in Local Storage and reload. Local storage belongs
to the browser profile and origin; another port or browser can have different data.
Incompatible saved sessions are preserved rather than silently migrated.

The birthday workspace uses the versioned fixed catalog with editable quantities
and scheduled activity starts. Submission checks guest coverage, budget and
scheduling requirements. Failed attempts keep editing and timing active; a
passing attempt freezes the final plan and successful completion time. A
supervisor-ended trial retains its unsuccessful outcome and elapsed duration
without a successful completion time. Both outcomes require a post-task survey
before the assigned next task opens.

Weekend planning includes fixed entry fees, daily opening hours, one-night
lodging and prepaid transport choices. The chosen transport exposes a complete
travel-time table. Times are whole minutes in a fictional two-day weekend;
Sunday is offset by 1440 minutes. The traveler starts at the station Saturday
09:00, stays at lodging Saturday22:00–Sunday08:00, and returns to the station
by Sunday18:00. Travel to/from all these anchors must fit. Overnight activity
bookings are not offered by the catalogs; visits must fit within a listed
same-day opening window. Feasible route backtracking may produce an optional
warning but does not block completion.

Weekly scheduling preserves fixed Monday/Wednesday/Friday09:00–11:00 classes
and Tuesday/Thursday13:00–17:00 work. Editable preparation and optional blocks
use positive whole-minute durations within Monday–Friday08:00–20:00. Adjacent
blocks are allowed; overlaps are not. At least240 preparation minutes must fall
before Friday17:00; a block spanning that deadline contributes only its earlier
portion. Optional meals, rest, exercise and buffers are not required, but all
selected blocks must fit the same bounds and conflict rules. Fixed commitments
are read-only and altered saved commitments block recovery.

After each trial, answer helpfulness and interruption on fixed1–7 scales with
visible endpoint anchors. Helpfulness has a distinct not-applicable option when
no assistance was displayed. Draft answers persist immediately and reload
restores them. After three task/survey pairs, select a preferred trial experience
by task/order, or no preference, with an optional explanation. Final submission
reaches completion; ended plans and submitted surveys remain immutable.

Survey and consent wording are internal pilot drafts, not recruitment-approved
instruments. All three tasks evaluate deterministic, versioned signals and record
candidate decisions, selection reservations, generation requests and actual
suggestion displays separately. Suggestions appear as popups requiring explicit
acknowledgement or dismissal. Open supervisor tools and enable **Show AI issue
scores on main page** to inspect scoring without requesting advice. See the
[issue eligibility state reference](docs/provider.md#issue-eligibility-states).
Earlier
scaffold sessions without implemented task data are preserved if they cannot
be safely recovered; no silent migration changes their assignment or timer.

## Verification

```sh
npx playwright install chromium
npm test
```

Playwright runs the participant-visible setup, consent, instructions, scenario
reveal, task editing/submission and reload flow with a controlled clock. Recorded outcomes are inspected
through the public session persistence interface. Public session-contract tests
verify all 36 sequences, duplicate-action guards and the complete protocol using
replaceable task adapters independently of workspace rendering. Typechecking and the
production build remain required checks.

## Layout

- `src/app/experiment/`: Vite-rendered experiment entry (no framework routing).
- `src/components/experiment/`: controller, shared shell, header and timer.
- `src/components/agent/`: assistant UI and future intervention-card seam.
- `src/components/tasks/`: reserved task workspace modules.
- `src/types/`: experiment, task and assistant contracts.
- `src/experiment/`: assignment, versioned configuration, session transitions,
  persistence, event logging and draft scenarios.
- `src/tasks/`, `src/agent/`: later implementation seams.
- `tests/`: browser flow and public session-contract verification.
