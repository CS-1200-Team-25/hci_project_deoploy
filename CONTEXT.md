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

`ExperimentController` owns all participant navigation: welcome/consent,
instructions, three task/post-task-survey pairs, final survey and completion.
Birthday planning
now supports catalog selection, quantity edits, scheduled activity moves and
removal. Its public task contract validates 12 food servings, 12 drink servings,
one activity, the $300 budget and activities within 14:00–17:00 without overlap.
Decorations are an optional improvement. Weekend planning now supports lodging
and transport selections and activity add/remove/edit/day/time moves. Weekly
scheduling includes immutable fixed commitments plus editable preparation and
optional meal/rest/exercise/buffer blocks. All three workspaces now use the same
submission, timing and outcome lifecycle.

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

Schedule fixture version1 preserves Monday/Wednesday/Friday09:00–11:00 classes
and Tuesday/Thursday13:00–17:00 work. Blocks use day indices0–4 and local whole
minutes; durations are positive whole minutes and all blocks fit08:00–20:00.
Intervals include their start and exclude their end, allowing adjacent blocks.
At least240 non-overlapping preparation minutes must occur before Friday17:00.
The portion of a preparation block before the deadline counts, even when its
remaining time falls later. Optional blocks are not required; selected optional
blocks still obey daily bounds and overlap rules. Fixed commitments are
read-only and their exact presence is enforced by runtime edit/recovery guards.
Scenario version3 records these explicit boundary/duration semantics.

The shared lifecycle records every submission and validation result. Failed
submissions show blocking requirements in a dismissible toast and in the workspace,
and retain active timing and editing. Successful submissions freeze the
final plan, validation, elapsed milliseconds and successful completion time
exactly once. Trial outcomes distinguish successful completion from exceptional
unsuccessful supervisor termination with a required reason and elapsed duration.
Unsuccessful durations never populate successful completion time. Ended trials
cannot be edited or completed again. Both outcomes require post-task answers
before the controller reveals the next assigned scenario and starts its timer.

Survey instrument version1 is a fixed pilot draft, not a recruitment-approved
instrument. Helpfulness uses1=not at all helpful and7=extremely helpful;
interruption uses1=not at all interruptive and7=extremely interruptive. Both
responses are required. Helpfulness can instead be the distinct string
`not-applicable` when that trial has no recorded assistance-display event.
Drafts persist with ordered events. Submitted responses cannot be changed or
submitted twice. The final instrument requires a trial experience by task/order
or explicit no preference, plus an optional explanation. It reveals no condition
names. Completion requires all three ended trials and their required surveys.
Recovery validates rating ranges, display-linked eligibility and phase gates.

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
contract and issues #4–#8 for the implemented slices.

