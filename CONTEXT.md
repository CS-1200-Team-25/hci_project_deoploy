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
submissions show blocking requirements in a dismissible toast,
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
responses are required. Either response can instead be the distinct string
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
and deterministic assistant evaluators. Incompatible or damaged data must be preserved instead
of silently reassigned. Save failures retain in-memory data and a failure record.
External storage edits and deletions trigger recovery instead of being overwritten
by the current tab. Supervisor storage tools allow an explicit reload for QA;
deleting the saved record and reloading returns to setup.

Scenario, sequence and condition-policy identifiers are versioned pilot drafts.
Baseline's disabled threshold is serialized explicitly as `null` alongside
`proactive: false`. Study knobs and content must be frozen after piloting before
recruitment. See `ARCHITECTURE.md` and GitHub issues #3 and #4 for the full
contract and issues #4–#9 for the implemented slices.

Birthday signal version1 is independent of condition. Missing food/drink have
severity .85 and missing activity .8. Present food/drink with fewer than12
servings score .4 + .4 × missing fraction. Budget pressure above$240 through$300
scores .6 × (cost−240)/60; excess scores .8 + .2 × (cost−300)/300, capped at1.
Activities outside14:00–17:00 and each overlapping pair score .9, with stable
item/pair IDs. A valid activity schedule's largest gap of at least90 minutes
scores .35 × gap/180 (optional efficiency). All scores clamp to[0,1]. Stable
category IDs remain unchanged across revisions; pair IDs sort item IDs.

Policy version2 disables baseline explicitly; low/high thresholds are .75/.4.
Meaningful committed edits evaluate across all tasks. Visible active tasks also
evaluate after30 seconds without an evaluation, using the same policy and
generation path without changing plan revisions. Baseline, pending requests and
reserved selections skip idle checks. Mount/reload waits a fresh30 seconds;
hidden tabs skip checks. Reveal, unchanged edits and reload do not immediately
evaluate or replay requests. Recency uses the last actual display, or trial start:0 below30 seconds,
.05 at30, .1 at60 and .2 at120, then remains bounded. Final score caps at1.
Actual displays impose30-second global and60-second per-signal cooldowns.
Resolved, in-flight, reserved and cooling candidates are excluded before
ranking by score then stable ID; at most one candidate is selected per edit.
Every candidate and an explicit summary (including zero candidates) are logged.

Persisted selection snapshots include timestamp and task revision. A selection
reserves its signal until a meaningful edit resolves it; recovery retains that
reservation without replay. Reservations are distinct from real provider
requests and actual display history. Future generation owns reservation release
on failure/completion/revalidation and records exposure only when advice is
shown. Selected signals from all three tasks use a loopback server to request structured
advice through a provider-neutral server adapter, defaulting to Google Gemini.
Native Gemini, OpenAI Responses and configurable chat-completions-compatible
services are supported; other protocols require a server adapter. Baseline makes
no generation requests. Provider identity, model, prompt/schema,
output limit and finite timeout are shared across active conditions and recorded
with every request; condition is never sent to the provider. The provider key
stays on the server. See `docs/provider.md` for startup and live smoke checks.

Generation permits one pending request per trial. Every meaningful edit cancels
its prior revision; completion, termination and reload also end pending requests.
Late responses cannot display. Responses are validated against selection and
configuration, then current revision, unresolved signal and display cooldowns
are rechecked. Failures release reservations and log explicit outcomes without
fallback advice. Actual display alone updates cooldowns and survey eligibility.
Selections, requests, responses and actual shown text are separate retained
records. Reload restores shown history without creating another exposure or
replaying generation. Acknowledgement and dismissal record explicit participant
responses; lack of acknowledgement is not classified as ignoring. Recovery
checks generation identity and displayed-history integrity.
Assistance appears in fixed, scrollable toasts instead of a sidebar. Active
suggestions never time out and close only on explicit acknowledgement or
dismissal. Unanswered suggestions persist through reload; successful task
submission requires responding to them first. Editing remains available.
Responded suggestions remain in the session/export records, not on screen.
Unanswered suggestions block new edit-triggered selections and generation
requests as well as idle evaluations, including after recovery. Edits still log
signal evaluations and resolutions. Responding to the last outstanding suggestion
starts a fresh30-second idle period; display cooldowns continue to use shown times.

Session exports use `planning-pilot-export-v1`: a lossless session snapshot
(excluding the supervisor verifier), original ordered events, explicit millisecond
units, derived selection/display counts and distinct successful versus unsuccessful
durations. The document includes scenario, catalog, travel matrix, schedule and
survey snapshots. Future session fields such as generation records are retained
without rebuilding them in the exporter. Downloads never clear local data and
cannot confirm that a file was saved. Failure events flag compromised retention;
`persistedAt` records the last successful save, independently of export time.
Supervisor storage tools offer downloads throughout the participant flow.


All-task signal configuration `pilot-4` / `planning-signals-v2` keeps the
birthday rules above and adds condition-independent weekend and schedule
signals. The evaluator never changes the validator or reads condition metadata.
Generation context includes the current plan, fixed constraints and applicable
catalog/travel/fixed-commitment data so advice can refer to fictional options.
Context also describes supported UI edits and time encodings. Schedule block
context includes readable weekday, start/end times, a description matching the
workspace's block type and time range, and explicit editability. Selected-signal
IDs can be matched to these descriptions without exposing IDs or minute offsets
in advice; daily bounds and the preparation deadline have readable labels.
Block choices share the same editable-kind list as the workspace and mark fixed
commitments immutable. Prompt `intervention-prompt-v2` asks for one specific
executable change plus a brief reason, grounded in available options and the
current plan, rather than repeated task instructions. Optional improvements
remain optional. Model, output schema and300-token limit are unchanged; this
guidance does not guarantee semantic feasibility or apply edits automatically.
The shared endpoint, prompt, model settings, policy and presentation serve all
three tasks; only selected signals request generation. Reveal and recovery do
not immediately evaluate or request advice; visible inactivity can trigger a
fresh evaluation after30 seconds. Session versions incompatible with this draft
are preserved and rejected, rather than silently converted for a new pilot.

Severity conventions: missing required selections score .85; missing day
activity coverage scores .4 + .4 times the missing fraction; budget pressure
above 80% through 100% scores .6 times the fraction through that band, while
excess scores .8 + .2 times the excess/budget ratio, capped at 1. Blocking time,
opening, travel, overlap and deadline problems score .9. Optional route,
wellbeing and adjacent-block improvements score .45 (no passing requirement).
These are comparable draft priorities, not validated measurements of difficulty.

Weekend identities are `weekend:lodging`, `weekend:transport`,
`weekend:coverage:<day>`, `weekend:budget`, `weekend:opening:<bookingId>`,
`weekend:overlap:<sortedIdPair>`, `weekend:travel:<fromId>:<toId>` and
`weekend:route:<day>`. Route anchors use arrival/lodging/departure IDs; travel
checks include arrival, overnight check-in/checkout and station departure.
Opening signals include trip bounds and listed same-day windows. Overlap checks
cover every intersecting pair; metadata retains bookings or travel minutes.
Returning to a location after visiting another location produces optional daily
backtracking advice. Exact travel and opening boundaries produce no conflict.

Schedule identities are `schedule:preparation`, `schedule:bounds:<blockId>`,
`schedule:deadline:<blockId>`,
`schedule:overlap:<sortedIdPair>`,
`schedule:back-to-back:<fromId>:<toId>` and
`schedule:optional:<meal|rest|exercise>`.
Preparation severity is .4 + .45 times the missing fraction of 240 minutes.
For assistance coverage, only valid, non-overlapping preparation minutes before
Friday17:00 count. Friday preparation extending after the deadline also has a
separate deadline signal. Missing optional kinds mean none anywhere in the week;
they do not impose daily hidden requirements. Non-overlapping successive blocks
with a gap below15 minutes score .45 times (15-gap)/15. Metadata preserves block
identities, times, category and whether a category is optional. Scores clamp to
[0,1]; tie ordering is independent of array order.

After a failed submission, an edit that removes a live blocking requirement
records `participant_correction`, the exact removed requirement text and state
revisions. Its `interventionId` is null and attribution is unspecified: temporal
association does not establish advice causation. Independently, resolved stable
signals record `signal_resolved` with prior exposure IDs as association only.
Ordinary edits that add errors or resolve none do not claim a correction.
These records use the same session/participant/trial/task/condition context and
unique append-only IDs/sequences as other task events.

See `docs/pilot-rehearsal.md` for automated observations and the supervised
manual checklist. Live provider behavior, keyboard usability and participant
understandability remain human pilot checks before researcher review and freeze.
