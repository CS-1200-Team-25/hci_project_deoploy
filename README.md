# Planning study prototype

React + TypeScript + Vite prototype for a supervised planning pilot. The current
implementation assigns a participant session, collects draft consent, displays
shared instructions, reveals the assigned first scenario and restores progress
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

Assignment, phase, timing anchors, configuration and ordered event records are
stored under `planning-pilot-session-v1` in browser local storage after each
committed action. Reload resumes that same session. Consent checkboxes remain
unchecked until consent is committed. The elapsed wall-clock timer starts at
scenario reveal and includes time in hidden tabs and across reloads.

Damaged or incompatible saved data is preserved and blocks a replacement
session. Saving failures show an alert and retain current data in memory; keep
that tab open for the supervisor. Clearing browser data removes local records.
For disposable QA sessions (including Issue #19), edit or remove
`planning-pilot-session-v1` in the browser's Application/Storage panel. Then use
**Reload saved session** under **Supervisor storage tools**, or on blocked setup,
to apply the change. Deleting that key returns to setup; editing it revalidates
the record. Invalid JSON or inconsistent phases block recovery and remain
preserved. Do not change only the phase to go backwards: start a fresh QA session
instead. The app checks for external storage changes before saving and on focus,
including changes from another tab, so its old in-memory copy cannot undo an
edit or deletion. Reloading discards unsaved in-memory changes, including data
retained after a save failure. This prototype does not yet provide session export.

Planning workspaces and validators, interventions, surveys and completion are
reserved for later tickets. The task completion button stays disabled, and the
assistant panel remains neutral. Consent and scenario wording are internal
pilot drafts.

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
