# Supervised pilot rehearsal

Use a supervised desktop with pseudonymous rehearsal IDs. These materials and
`pilot-5` / `planning-signals-v2` / `pilot-policy-v3` are proposed defaults for research-team review.
They do not establish recruitment approval, task equivalence or statistical
power. Consent, survey wording, catalogs, policies and deployment configuration
need review and a recorded freeze before recruitment.

## Setup and actual provider check (pending)

- [ ] Follow `docs/provider.md`: configure the server-side key, model, app origin
      and finite timeout; run both the provider and Vite. Keep credentials out
      of the browser and exports. Record deployment model, prompt/schema,
      output-token limit and timeout from the exported generation records.
- [ ] Rehearse each task in an active condition with a real provider. Wait for
      actual advice after a selected edit; note displayed text, selected signal,
      request outcome and latencyMs. Confirm advice uses available fictional
      options and does not autonomously edit, navigate or impose optional rules.
- [ ] Check baseline makes no config/generation requests and retains the same
      assistant space, task controls, instructions and passing criteria.
- [ ] Inspect low/high actual exposure under comparable plans, noting cooldown,
      revisions, completion and provider failures. Do not require high to have
      strictly more displays on every evolving trace. Count display events, not
      selected evaluations or requests, as exposure.

## Participant flow and feasibility (pending human observation)

- [ ] Create session, consent and reveal task using only keyboard (Tab, Shift+Tab,
      Enter, Space, arrow keys). Check focus visibility/order, catalog buttons,
      numeric/time fields, day/type selectors, assistant responses, validation
      toast dismissal, surveys and supervisor controls. Check the desktop panel
      remains usable alongside the workspace.
- [ ] Read instructions before editing. Ask the observer to explain budget,
      coverage, opening/travel rules, preparation deadline and optional items.
      Note ambiguities and difficulty; do not treat automated passing fixtures
      as evidence that human participants understand the task.
- [ ] Birthday passing example: Wrap buffet + Water pack + Trivia at14:00.
      Try missing drinks, excessive cost and overlapping activities; correct
      a failed submission and verify timing continues.
- [ ] Weekend passing example: station guesthouse + transit pass; Saturday
      Museum10:00 and Gallery12:00, Sunday Park09:00 and Harbor11:00. Check all
      fees count and overnight travel works. Try a closed-time booking and a
      one-minute travel shortfall; distinguish optional backtracking advice.
- [ ] Schedule passing example: preserve fixed commitments and add Monday
      preparation12:00 for240 minutes. Try overlapping blocks and preparation
      beyond Friday17:00. Confirm meals/rest/exercise/buffers remain optional.
- [ ] Rehearse all three assigned trials and required post-task/final surveys.
      Read rating anchors and not-applicable eligibility; note wording problems.
      Final preference names task/order and permits no preference. Check a
      supervisor-ended trial has a reason and unsuccessful duration, with no
      successful completion time, and still requires its survey.

## Recovery, failure and interpretation (pending human observation)

- [ ] Reload during editing, shown advice, a survey draft and completion. Check
      assignment, plans, answers and elapsed wall-clock anchors persist, prior
      event IDs remain unchanged and advice is neither replayed nor redisplayed.
      Reload relocks supervisor authorization. Check hidden-tab elapsed time.
- [ ] Disconnect/provider fail and delayed-response cancellation: editing and
      submission remain usable, failed requests appear in supervisor status,
      and canceled/resolved/reloaded responses cannot become new exposure.
- [ ] Rehearse storage read/write failure in a disposable QA browser. Keep the
      tab open, export its available in-memory data and inspect persistence
      failure context and compromised retention. Do not clear study data to
      recover a production session. Preserve damaged/incompatible records.
- [ ] Download incomplete and complete exports. Verify they contain sequence,
      configurations, catalogs/travel matrices, original ordered events, plans,
      validations/submission attempts, separate successful/unsuccessful timing,
      raw surveys and generation outcomes with latency and actual shown text.
      The supervisor code verifier is excluded. Download initiation does not
      guarantee a file was saved, and never clears local records.
- [ ] Match action/evaluation/request/display/response/correction/survey events
      to the correct trial, task and condition; inspect unique IDs/sequences.
      `triggered` means selection, not display. Explicit acknowledgement and
      dismissal are participant responses; silence is not inferred ignoring.
      Corrections and signal resolution have unspecified attribution; prior
      exposure association does not prove the suggestion caused the change.
- [ ] Flag provider/storage failures and recovery gaps when interpreting timing
      and exposure. Successful completion time excludes unsuccessful outcomes.
      Final preference may reflect task preference. Compare pilot evidence by
      participant and task before proposing revised difficulty/thresholds.

## Automated rehearsal observations

The browser checks use a controlled clock and a replaceable generation endpoint;
they test the app lifecycle, not real provider quality or latency. A complete
sequence1 rehearsal completes birthday/baseline, weekend/low and schedule/high;
a second version exceptionally terminates schedule. Both submit all required
surveys, recover before completion and download a self-contained export. The
controlled examples retain10000ms per ended trial; the terminated schedule has
no successfulCompletionMs. Each has zero baseline requests/displays and one
weekend and one schedule display, with dismissal/acknowledgement retained.
Stub response latency is0ms; this is not an observed real provider latency.

Focused passing/flawed fixtures and controlled policy checks show that required
.85/.9 signals can reach active policies, optional .45 improvements are eligible
for high but below low at zero recency, and baseline never selects. Existing
policy tests cover bounded recency, stable ties, cooldown and at most one
selection per meaningful edit. No inference about strict high>low counts on
every actual participant trace follows from these checks.

New weekend/schedule browser checks cancel delayed advice, retain provider
failure outcomes, keep submission usable and export in-memory records during
storage failure without displaying stale advice. Full-suite checks also cover
malformed advice, timeout, reload interruption, damaged storage and unsuccessful
outcomes. Event audits check trial context, prior IDs retained across recovery,
unique sequence numbers and no duplicate task/survey/display transitions.

No live provider smoke or supervised human usability rehearsal was performed in
this implementation. Real credentials and an observer are required for the
unchecked items. Record date, deployment versions, model, real latency/outcomes,
layout/keyboard observations, instruction/survey problems and proposed changes
before review. Version each adjustment; later freeze is a separate research
team decision. `PILOT_TEST_PORT` optionally isolates browser checks from another
checkout (default4173); the dev test server uses a strict requested port.
