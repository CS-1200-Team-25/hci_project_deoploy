# Task difficulty observation — 27 October 2026

This is the historical observation before the weekly task was tightened.
See [the follow-up](weekly-schedule-difficulty-observation.md) for current rules
and results. The historical runner is preserved in commit `a5430c3`; the current
runner exercises the revised weekly requirements.

The current tasks are structurally uneven. The birthday change adds a genuine
budget tradeoff, but weekend planning still requires more coordination. Weekly
scheduling has the easiest passing shortcut: add a preparation block at its
default Monday 11:00 start, then change its duration to 240 minutes.

These observations apply to application commit `f361a42`, configuration
`pilot-7`, scenarios `pilot-scenarios-v4` and signals `planning-signals-v3`.

## Method

I ran nine Chromium walkthroughs through the actual participant controls and
inspected screenshots of the passing birthday, weekend and weekly workspaces.
Each walkthrough used a fresh browser context and put its task first under
baseline, using sequence 1, 13 or 25. Thus task position and assistant exposure
were held constant. Session setup, consent and submission clicks are excluded
from edit counts; each counted edit was checked against a committed state
revision. Scrolling and reading effort are not included.

Correction walkthroughs deliberately introduced specified mistakes. Their
failed-submission counts show enforcement and repair effort; they are not
observed human error rates. The clock was paused. These runs establish working
paths and structural differences, not human completion times, subjective
difficulty, or statistical task equivalence. The demonstrated paths are not
all proven minimum edit counts.

Reproduce from the repository root with `node scripts/observe-task-difficulty.mjs`.
The script starts and stops its own Vite server on port 4175, which must be free.
It writes operation logs, final plans, validation results, enumeration results
and screenshots to `test-results/task-difficulty/`. It uses disposable browser
storage and does not use a provider or a participant's saved session.

## Browser results

| Walkthrough | Committed edits | Failed submissions | Passing result |
| --- | ---: | ---: | --- |
| Birthday, direct solution | 4 | 0 | Wraps, water, trivia at 14:00, banners; $158 |
| Birthday, missing decoration and budget repair | 7 | 2 | Add banners, then replace wraps with two sandwich platters; craft workshop plan costs $198 |
| Birthday, serving repair | 5 | 1 | Increase one sandwich platter to two; party-games plan costs $168 |
| Weekend, repeated free activity | 10 | 0 | Guesthouse, transit, park walks at 10:00 and 11:00 each day; $140 |
| Weekend, four different activities | 11 | 0 | Museum and gallery Saturday, park and harbor Sunday; $260 |
| Weekend, budget/opening/travel repair | 15 | 1 | Replace luxury lodging and adjust three booking times; $260 |
| Weekly schedule, direct solution | 2 | 0 | Add preparation, change 60 to 240 minutes; Monday 11:00–15:00 |
| Weekly schedule, four separate days | 7 | 0 | Four 60-minute preparation blocks, Monday–Thursday at 11:00 |
| Weekly schedule, overlap/deadline repair | 6 | 2 | Move an overlapping Monday block to Friday, then shift 14:00–18:00 to 13:00–17:00 |

The birthday correction trace first failed only for missing decorations. After
adding banners it failed only for exceeding $200: wraps, water, craft workshop
and banners cost $203. Switching the food to two sandwich platters produced a
passing $198 plan. Food coverage was independently enforced in the third trace.

The weekend correction trace produced three simultaneous blocking errors:
$560 total cost, a museum visit beginning before its opening window, and no
45-minute transfer between the Sunday park walk and harbor tour. Repairing
lodging and three start times resolved them. Even its repeated-activity
shortcut still needed four bookings, two Sunday day changes and two start-time
changes, in addition to lodging and transport selections.

Weekly scheduling accepted the two-edit solution with only optional wellbeing
warnings. The default start is already after Monday class; preserving fixed
commitments requires no user action because they are prefilled and immutable.
The task does not require spreading preparation across days or adding any
optional blocks. Overlap and deadline mistakes are enforced, but neither must
be encountered along the direct solution.

## Feasible choices

For birthday I enumerated all 18 combinations of one food option, one drink
option and one activity, with the minimum whole quantities to cover 12 guests,
one banners selection, and the activity starting at 14:00. Fourteen passed.
All four rejected combinations contained the craft workshop: sandwich/pizza
with lemonade cost $204, wraps with water cost $203, and wraps with lemonade
cost $209. Sandwich/pizza with water and crafts cost $198 and passed. Every
catalog option remains usable. All non-craft combinations in this set pass,
so choosing trivia or party games avoids a difficult budget decision.

For weekly scheduling I checked a single four-hour preparation block at each
15-minute start from 08:00 through 16:00 on each weekday, preserving all fixed
commitments. Sixty-one starts passed: 21 each on Monday and Wednesday, five
each on Tuesday and Thursday, and nine on Friday. A valid single-block solution
exists every weekday. These search spaces differ; their passing percentages
must not be compared as probabilities of task difficulty.

## Assessment

My structural ranking is **weekly schedule easiest, birthday intermediate,
weekend hardest**. That judgement uses the observed passing paths and their
constraint interactions, not edit counts alone. Birthday combines selection,
serving arithmetic and occasional budget substitution. Weekend combines more
bookings with day coverage, opening windows and travel between locations.
Weekly scheduling leaves many large free intervals and permits one block to
satisfy its sole additional required category.

The birthday requirements and $200 cap work as intended. I would not describe
all three tasks as matched in difficulty. Tightening birthday further would
increase its distance from the easy weekly task. The clearest next balancing
target is the weekly task's single-block shortcut. Requiring preparation on
multiple days, with a per-day limit, would create additional planning work;
that is a proposed rule change, not part of this observation. Repeating the
same free weekend activity is also an available simplification, although the
demonstrated route still takes more edits than the direct birthday solution.

No participant requirements were changed during this observation.
