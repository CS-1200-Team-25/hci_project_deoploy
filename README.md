# Planning study prototype

React + TypeScript + Vite prototype for a supervised planning pilot. The current
implementation assigns a participant session, collects draft consent, displays
shared instructions, supports timed birthday planning and restores progress
after a reload. `ARCHITECTURE.md` defines the full study contract; `CONTEXT.md`
describes the implemented domain and remaining work.

## Development

Use Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

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
This incremental prototype does not yet provide session export or a reset UI.

The birthday workspace uses the versioned fixed catalog with editable quantities
and scheduled activity starts. Submission checks guest coverage, budget and
scheduling requirements. Failed attempts keep editing and timing active; a
passing attempt freezes the final plan and successful completion time. A
supervisor-ended trial retains its unsuccessful outcome and elapsed duration
without a successful completion time. Both outcomes stop at the reserved
post-task phase until surveys are implemented.

Weekend/schedule workspaces, interventions and surveys remain reserved for later
tickets. Unimplemented workspaces have disabled completion. The assistant panel
remains neutral. Consent and scenario wording are internal pilot drafts. Earlier
scaffold sessions without implemented task data are preserved if they cannot
be safely recovered; no silent migration changes their assignment or timer.

## Verification

```sh
npx playwright install chromium
npm test
```

Playwright runs the participant-visible setup, consent, instructions, scenario
reveal and reload flow with a controlled clock. Recorded outcomes are inspected
through the public session persistence interface. Public session-contract tests
verify all 36 sequences and duplicate-action guards. Typechecking and the
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
