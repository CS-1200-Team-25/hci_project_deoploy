# Proactive AI Study Prototype — Architecture & Implementation Contract

This document is the source of truth for implementing the HCI study prototype. It favors experimental control, reproducibility, and consistent participant experience over production-scale complexity.

## Study design assumptions

Each participant completes **three trials**. Every trial pairs one task with one AI condition:

| Tasks | AI conditions |
| --- | --- |
| Birthday-party planning | Baseline |
| Weekend-itinerary planning | Low eagerness |
| Weekly-schedule planning | High eagerness |

Each participant sees every task and every condition exactly once. Assignment must rotate task-condition pairings and trial order across participants; do not permanently pair a condition with a task.

## Non-negotiable design rules

1. All tasks run inside one shared experiment shell. Do **not** create independent mini-apps with separate navigation.
2. The shell layout, task controls, agent-panel location, and completion workflow remain identical in all conditions.
3. Individual task components never decide which page comes next. They emit task-state changes and `completeTrial()` requests; the experiment controller owns navigation.
4. The intervention engine uses deterministic, structured task signals. Do not let an LLM independently decide when to interrupt.
5. The agent returns structured interventions; presentation belongs to the UI.
6. Log every important participant action and every intervention evaluation, including evaluations that do not trigger an intervention.
7. Keep the first version frontend-first and simple. Add persistence/API only where needed to reliably retain study data.

## Participant flow

```text
WELCOME / CONSENT
  → INSTRUCTIONS
  → TASK 1
  → POST-TASK SURVEY 1
  → TASK 2
  → POST-TASK SURVEY 2
  → TASK 3
  → POST-TASK SURVEY 3
  → FINAL SURVEY
  → COMPLETE
```

The `ExperimentController` is the only component allowed to advance this state machine.

## Experiment session model

```ts
type ExperimentPhase =
  | "welcome"
  | "instructions"
  | "task"
  | "post-task-survey"
  | "final-survey"
  | "complete";

type TaskId = "birthday" | "weekend" | "schedule";
type ConditionId = "baseline" | "low" | "high";

interface Trial {
  id: string;
  task: TaskId;
  condition: ConditionId;
  status: "pending" | "active" | "completed";
  startedAt?: number;
  completedAt?: number;
}

interface ExperimentSession {
  sessionId: string;
  participantId: string;
  phase: ExperimentPhase;
  trials: Trial[];
  currentTrialIndex: number;
  startedAt: number;
}
```

Use a small, predetermined set of counterbalanced sequences. Assign the next sequence round-robin or with a simple participant-ID mapping. A sequence pairs task and condition, then controls presentation order.

```ts
const experimentSequences: { trials: Omit<Trial, "id" | "status">[] }[] = [
  {
    trials: [
      { task: "birthday", condition: "baseline" },
      { task: "weekend", condition: "low" },
      { task: "schedule", condition: "high" },
    ],
  },
  {
    trials: [
      { task: "weekend", condition: "high" },
      { task: "schedule", condition: "baseline" },
      { task: "birthday", condition: "low" },
    ],
  },
  {
    trials: [
      { task: "schedule", condition: "low" },
      { task: "birthday", condition: "high" },
      { task: "weekend", condition: "baseline" },
    ],
  },
];
```

Before data collection, expand this to a balanced set of sequences agreed on by the research team. Do not silently randomize a sequence per page refresh.

## Shared task contract

The experiment layer must not need to know how each workspace works. Each task implements a common contract.

```ts
interface ValidationResult {
  isComplete: boolean;
  errors: string[];
  warnings: string[];
}

interface AgentContext {
  taskId: TaskId;
  summary: Record<string, unknown>;
}

interface ExperimentTask<TState> {
  id: TaskId;
  title: string;
  instructions: string;
  initialState: TState;
  validate(state: TState): ValidationResult;
  getAgentContext(state: TState): AgentContext;
  evaluateSignals(state: TState): AgentSignal[];
}
```

`TaskRenderer` selects the current task using `trial.task` and places its workspace inside `ExperimentShell`.

## Stable task-screen layout

```text
┌──────────────────────────────────────────────────────────────────┐
│ Task 2 of 3 · Weekend itinerary                    Elapsed 06:42 │
├──────────────────────────────────────────┬───────────────────────┤
│ Instructions and task workspace          │ AI Assistant          │
│                                          │                       │
│                                          │ Structured messages   │
│                                          │ appear here           │
├──────────────────────────────────────────┴───────────────────────┤
│                                             [ Complete task ]    │
└──────────────────────────────────────────────────────────────────┘
```

The agent panel is always visible. In the baseline condition it should occupy the same space and say something neutral such as “No suggestions right now.” Do not remove or resize the panel by condition.

## Intervention engine

Task evaluators generate candidate signals. The generic intervention engine applies the experimental condition's policy and decides whether to show one.

```ts
type SignalType =
  | "budget"
  | "missing-category"
  | "coverage"
  | "schedule-conflict"
  | "deadline"
  | "efficiency";

interface AgentSignal {
  id: string;
  type: SignalType;
  severity: number; // normalized to 0–1
  message: string;
  target?: string;
  metadata?: Record<string, unknown>;
}

interface Intervention {
  id: string;
  signalId: string;
  type: "warning" | "suggestion" | "conflict" | "budget" | "reminder";
  message: string;
  target?: string;
  timestamp: number;
}
```

### Conditions

```ts
const CONDITION_POLICY = {
  baseline: { proactive: false, threshold: Infinity },
  low: { proactive: true, threshold: 0.75 },
  high: { proactive: true, threshold: 0.4 },
} as const;
```

The exact thresholds are pilot values, not final study claims. Keep them centralized in one config file so the team can tune them after piloting without rewriting task UI code.

### Decision pipeline

```text
Participant action
  → task state update
  → task evaluator returns signals
  → record each signal evaluation
  → choose strongest eligible signal
  → apply recency / cooldown policy
  → compare with condition threshold
  → show at most one structured intervention
  → log display and later acknowledgement/ignore behavior
```

Use elapsed time since the prior intervention as a bounded pressure bonus, not raw time:

```ts
function recencyBonus(secondsSinceLastIntervention: number) {
  if (secondsSinceLastIntervention < 30) return 0;
  if (secondsSinceLastIntervention < 60) return 0.05;
  if (secondsSinceLastIntervention < 120) return 0.1;
  return 0.2;
}
```

```ts
function chooseIntervention(
  signals: AgentSignal[],
  condition: ConditionId,
  secondsSinceLastIntervention: number,
): { signal: AgentSignal; score: number } | null {
  if (!CONDITION_POLICY[condition].proactive) return null;

  const strongest = signals
    .map((signal) => ({ signal, score: Math.min(1, signal.severity + recencyBonus(secondsSinceLastIntervention)) }))
    .sort((a, b) => b.score - a.score)[0];

  if (!strongest || strongest.score < CONDITION_POLICY[condition].threshold) return null;
  return strongest;
}
```

Prevent repeated messages about the same unresolved signal from firing continuously. Track recent signal IDs/types and enforce a short per-signal cooldown. High eagerness means a lower threshold—not a message for every possible issue at once.

### Task-specific evaluators

Each evaluator uses transparent heuristics:

- Birthday: budget exceeded/pressure, missing food or drinks, guest coverage, missing activities, schedule gaps.
- Weekend: budget pressure, overlapping or impossible travel/opening hours, missing lodging/transport, inefficient route.
- Schedule: conflicts, deadline risk, insufficient preparation time, missing meals/rest/exercise, unrealistic back-to-back blocks.

Keep severity scales documented and consistent enough to compare across conditions. A task evaluator must not read the participant's condition; it only describes the state.

## Event logging

Every event includes common context:

```ts
interface ExperimentEvent {
  sessionId: string;
  participantId: string;
  trialId?: string;
  taskId?: TaskId;
  condition?: ConditionId;
  timestamp: number;
  eventType: string;
  payload?: Record<string, unknown>;
}
```

Minimum event types:

```ts
type ExperimentEventType =
  | "session_started"
  | "instructions_viewed"
  | "task_started"
  | "item_added"
  | "item_removed"
  | "item_updated"
  | "item_moved"
  | "task_validation_requested"
  | "signal_evaluated"
  | "agent_intervention_shown"
  | "agent_intervention_acknowledged"
  | "agent_intervention_dismissed"
  | "participant_correction"
  | "task_completed"
  | "post_task_survey_submitted"
  | "final_survey_submitted";
```

For every `signal_evaluated`, include at least:

```ts
{
  signalType: signal.type,
  signalId: signal.id,
  rawSeverity: signal.severity,
  recencyBonus,
  finalScore,
  threshold: CONDITION_POLICY[condition].threshold,
  triggered: boolean,
}
```

This supports a manipulation check: high-eagerness should create more proactive interventions than low-eagerness under comparable task states.

## Suggested project structure

```text
src/
├── app/
│   └── experiment/
│       └── page.tsx
├── components/
│   ├── experiment/
│   │   ├── ExperimentController.tsx
│   │   ├── ExperimentShell.tsx
│   │   ├── TaskHeader.tsx
│   │   ├── Timer.tsx
│   │   └── ProgressIndicator.tsx
│   ├── agent/
│   │   ├── AgentPanel.tsx
│   │   └── InterventionCard.tsx
│   └── tasks/
│       ├── birthday/
│       ├── weekend/
│       └── schedule/
├── experiment/
│   ├── conditions.ts
│   ├── sequences.ts
│   ├── session.ts
│   └── logger.ts
├── tasks/
│   ├── birthday.ts
│   ├── weekend.ts
│   └── schedule.ts
├── agent/
│   ├── engine.ts
│   ├── cooldown.ts
│   └── messages.ts
└── types/
    ├── experiment.ts
    ├── task.ts
    └── agent.ts
```

## Implementation order

1. Define shared TypeScript types, trial sequences, and controller state machine.
2. Build the static shared shell with placeholder task workspace and persistent agent panel.
3. Implement welcome, instructions, post-task survey, final survey, and completion phases.
4. Implement all three task workspaces against the shared task contract.
5. Add validators and task evaluators with testable deterministic signals.
6. Add the intervention engine, conditions, per-signal cooldown, and intervention UI.
7. Add event logging and persistence/export.
8. Pilot the full flow, verify counterbalancing, tune thresholds, and freeze the configuration before recruiting.

## Explicit anti-patterns

- Do not let a task navigate directly to another task page.
- Do not render a different layout for baseline versus proactive conditions.
- Do not hardcode agent messages in individual task components.
- Do not use continuous open-ended LLM monitoring to decide whether to interrupt.
- Do not trigger multiple suggestions from a single participant action.
- Do not record only shown interventions; non-triggered evaluations are also data.
- Do not change thresholds, task data, or logging semantics during data collection without versioning the change.
