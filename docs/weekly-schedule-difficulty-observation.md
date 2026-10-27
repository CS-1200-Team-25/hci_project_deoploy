# Weekly schedule difficulty follow-up — 27 October 2026

Weekly scheduling now requires four preparation hours before Friday17:00 on
at least three different weekdays, with no more than90 preparation minutes on
any day. The cap aggregates every preparation block on that day, including
minutes after the deadline. Classes/work, daily bounds, overlap checks and
optional wellbeing blocks keep their existing roles.

The new rules close the observed two-edit shortcut. Direct passing weekly
paths now take seven committed edits, between the unchanged four-edit birthday
and10–11-edit weekend examples. This is better structural balance; it does not
establish equal human effort or completion time.

## Repeated observation

Run `node scripts/observe-task-difficulty.mjs`. It starts a disposable local
Vite server on port4175 and exercises actual Chromium controls in separate
browser contexts. All tasks are first in their session and use baseline
(sequences1,13,25). No provider is involved. The clock is paused, setup and
submission clicks are excluded, and reported edits are checked against saved
state revisions. Logs and screenshots are generated under
`test-results/task-difficulty/`.

The rerun uses `pilot-8`, `pilot-scenarios-v5`, `planning-signals-v4` and
`schedule-fixture-v2`. Older sessions are preserved and rejected on recovery
rather than reinterpreted under the new rules.

| Walkthrough | Edits through success | Failed submissions | Result |
| --- | ---: | ---: | --- |
| Birthday, direct | 4 | 0 | Unchanged $158 plan |
| Birthday, decoration/budget repair | 7 | 2 | Unchanged $198 craft plan |
| Birthday, serving repair | 5 | 1 | Unchanged $168 games plan |
| Weekend, repeated park walks | 10 | 0 | Unchanged $140 plan |
| Weekend, different activities | 11 | 0 | Unchanged $260 plan |
| Weekend, budget/opening/travel repair | 15 | 1 | Unchanged $260 final plan |
| Weekly, former shortcut then repair | 8 | 1 | One240-minute block fails at edit2; redistribution then passes |
| Weekly, three-day plan | 7 | 0 | Monday11:00–12:30, Tuesday11:00–12:30, Wednesday11:00–12:00 |
| Weekly, four-day plan | 7 | 0 | Monday–Thursday11:00–12:00 |
| Weekly, overlap/deadline repair | 12 | 2 | Monday90, Tuesday90, Friday16:00–17:00, without conflicts |

The former shortcut failed for both insufficient preparation days and too
much Monday preparation, despite already meeting the four-hour total. The
correction trace separately exposed the existing overlap/deadline errors and
the new daily/distribution errors. These mistakes were deliberately seeded;
the failure counts are not observed participant error rates.

The runner also retried a single four-hour block at all165 weekday/start pairs
on the original15-minute grid: zero now pass, compared with61 previously.
Birthday still accepts14 of18 minimum-quantity catalog combinations. These
different search spaces do not supply comparable difficulty probabilities.

The rule checks also verify that90 minutes on a day passes and91 fails, that
separate blocks share the daily cap, that after-deadline-only preparation does
not qualify a day, and that a Friday block crossing the deadline contributes
only its earlier portion toward240 minutes while its full duration counts
toward the daily cap. Assistant context, stable signals, task instructions,
workspace totals and exported constraints all describe the same rules.

My assessment is that the weekly task now requires a comparable number of
planning actions and introduces distribution and daily-cap decisions. Weekend
planning still has the richest interactions because opening windows and travel
can constrain each other. The evidence supports removing the obvious weekly
shortcut and bringing its demonstrated paths between the other tasks; the
observed paths are not proven global minimum edit counts.
