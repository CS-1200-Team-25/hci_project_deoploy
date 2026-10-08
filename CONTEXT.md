# Planning pilot domain context

The prototype supports an internal, supervised HCI pilot. Each participant
receives three ordered trials, covering birthday-party planning, weekend-
itinerary planning and weekly-schedule planning exactly once, with baseline,
low-eagerness and high-eagerness conditions exactly once. Conditions are study
metadata and are not labeled on participant task screens.

The supervisor enters a pseudonymous participant ID and a one-based sequence
index. The 36 fixed sequences cross all six task orders and all six condition
orders; each task and condition appears 12 times in each position and every
task-condition pairing appears 12 times over the complete allocation cycle.
Local storage does not coordinate allocations between browsers or supervisors.

`ExperimentController` owns participant navigation. Implemented phases are
welcome/consent, shared instructions and first-task reveal. Later phases remain
typed contracts: post-task survey, final survey and completion. Birthday planning
now supports catalog selection, quantity edits, scheduled activity moves and
removal. Its public task contract validates 12 food servings, 12 drink servings,
one activity, the $300 budget and activities within 14:00–17:00 without overlap.
Decorations are an optional improvement. Weekend and schedule workspaces cannot
currently pass because their tools and validators remain unimplemented.

The shared lifecycle records every submission and validation result. Failed
submissions show blocking requirements in a dismissible toast and in the workspace,
and retain active timing and editing. Successful submissions freeze the
final plan, validation, elapsed milliseconds and successful completion time
exactly once. Trial outcomes distinguish successful completion from exceptional
unsuccessful supervisor termination with a required reason and elapsed duration.
Unsuccessful durations never populate successful completion time. Ended trials
cannot be edited or completed again and enter the reserved post-task phase.

The supervisor sets an access code at session setup. Only a verified code issues
an in-memory authorization for exceptional termination of that session. Codes
are stored as salted verifiers; authorization is not persisted and reload
relocks controls. This is a local supervised safeguard, not remote authentication
or protection against a participant modifying the application/browser storage.

Task time begins when the scenario is revealed. Persisted wall-clock anchors
allow time to continue during hidden tabs and reloads. Recovery gaps and
visibility transitions are recorded; they do not pause or restart the timer.
Prior events retain their IDs and sequence numbers, and committed transitions
guard against duplicate consent and task starts.

Session schema version 1 persists assignment, trials, phase, configuration,
timing, event records and reserved survey fields. The public `createSession`,
`consentToSession`, `revealTask`, `updateTaskState`, `submitTask`, `terminateTask`,
`loadSession` and `saveSession` interfaces form the session boundary. Task
definitions provide versioned initial state, runtime state guards, validators
and future assistant evaluators. Incompatible or damaged data must be preserved instead
of silently reassigned. Save failures retain in-memory data and a failure record.
External storage edits and deletions trigger recovery instead of being overwritten
by the current tab. Supervisor storage tools allow an explicit reload for QA;
deleting the saved record and reloading returns to setup.

Scenario, sequence and condition-policy identifiers are versioned pilot drafts.
Baseline's disabled threshold is serialized explicitly as `null` alongside
`proactive: false`. Study knobs and content must be frozen after piloting before
recruitment. See `ARCHITECTURE.md` and GitHub issues #3 and #4 for the full
contract and issues #4–#5 for the implemented slices.
