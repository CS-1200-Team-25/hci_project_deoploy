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
Decorations are an optional improvement. Weekend planning now supports lodging
and transport selections and activity add/remove/edit/day/time moves. The
schedule workspace cannot currently pass because its tools and validator remain
unimplemented.

Weekend catalog version1 uses integer minutes from fictional Saturday00:00;
Sunday times add1440. Trip anchors are station arrival Saturday09:00 and station
departure Sunday18:00. Selected lodging reserves Saturday22:00–Sunday08:00,
with travel to check-in and after checkout checked using the fixed selected-
transport matrix. All activity entry fees, one-night lodging and prepaid
transport costs count toward$500. Every day needs two activity bookings; each
visit must fit entirely in a listed same-day opening window. Activities cannot
overlap each other or overnight lodging. Exact travel/window/budget boundaries
pass. Feasible backtracking is optional, never a hidden passing requirement.
The explicit weekend scenario is included in scenario version2.

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
contract and issues #4–#6 for the implemented slices.
