import type { ExperimentSession } from '../types/experiment';
import { PILOT_SCENARIOS } from './scenarios';
import { BIRTHDAY_CATALOG, BIRTHDAY_CATALOG_VERSION } from '../tasks/birthday';
import { WEEKEND_ACTIVITIES, WEEKEND_LODGING, WEEKEND_TRANSPORT, WEEKEND_TRAVEL, WEEKEND_BOUNDARIES, WEEKEND_CATALOG_VERSION, WEEKEND_LOCATIONS } from '../tasks/weekend';
import { FIXED_COMMITMENTS, SCHEDULE_VERSION, WEEKDAYS, EDITABLE_SCHEDULE_KINDS } from '../tasks/schedule';
import { experimentSequences } from './sequences';

/** Keep raw session fields so future surveys and generation records remain lossless. */
export function createSessionExport(session: ExperimentSession, now = Date.now()) {
  const snapshot = structuredClone(session);
  delete snapshot.supervisorAccess;
  const failures = snapshot.events.filter((event) => event.eventType === 'persistence_failed');
  return {
    exportVersion: 'planning-pilot-export-v1',
    exportedAt: now,
    completion: session.phase === 'complete' ? 'complete' : 'incomplete',
    units: { duration: 'milliseconds', timestamp: 'unix-epoch-milliseconds', taskSchedule: 'minutes' },
    retention: {
      compromised: failures.length > 0,
      lastSuccessfulSaveAt: session.persistedAt ?? null,
      failureCount: failures.length,
      downloadConfirmedSaved: false,
    },
    session: snapshot,
    trialMetrics: session.trials.map((trial) => ({
      trialId: trial.id,
      outcome: trial.outcome ?? null,
      elapsedMs: trial.elapsedMs ?? (trial.startedAt === undefined ? null : Math.max(0, now - trial.startedAt)),
      successfulCompletionMs: trial.successfulCompletionMs ?? null,
      selectionCount: trial.agentHistory?.selections.length ?? 0,
      displayCount: session.events.filter((event) => event.trialId === trial.id && event.eventType === 'agent_intervention_shown').length,
    })),
    materials: {
      scenarios: structuredClone(PILOT_SCENARIOS),
      sequences: structuredClone(experimentSequences),
      conditions: structuredClone(session.configuration.conditions),
      engine: {
        version: session.configuration.policyVersion,
        formula: 'min(1, rawSeverity * severityWeight + recencyBonus(unresolvedSeconds))',
        severityWeight: 0.5,
        recencyBonusThresholds: [
          { minSeconds: 0, maxSeconds: 30, bonus: 0 },
          { minSeconds: 30, maxSeconds: 60, bonus: 0.15 },
          { minSeconds: 60, maxSeconds: 120, bonus: 0.30 },
          { minSeconds: 120, maxSeconds: 180, bonus: 0.45 },
          { minSeconds: 180, maxSeconds: null, bonus: 0.60 },
        ],
        displayCooldowns: structuredClone(session.configuration.displayCooldowns),
        maxConcurrentInterventions: 1,
        idleEvaluationDelayMs: 30_000,
      },
      signals: {
        version: session.configuration.signalVersion,
        birthday: {
          missingFood: { severity: 0.85, type: 'missing-category' },
          missingDrink: { severity: 0.85, type: 'missing-category' },
          missingActivity: { severity: 0.80, type: 'missing-category' },
          coverageFormula: '0.4 + 0.4 * missingFraction',
          budgetPressureFormula: '0.6 * (cost - 240) / 60 when 240 < cost <= 300',
          budgetExcessFormula: '0.8 + 0.2 * (cost - 300) / 300 when cost > 300, capped at 1',
          budgetPressureFloor: 240,
          windowViolation: { severity: 0.9, type: 'schedule-conflict' },
          overlapViolation: { severity: 0.9, type: 'schedule-conflict' },
          scheduleGapFormula: '0.35 * gap / 180 when gap >= 90 minutes',
          scheduleGapType: 'efficiency',
        },
        weekend: {
          missingLodging: { severity: 0.85, type: 'missing-category' },
          missingTransport: { severity: 0.85, type: 'missing-category' },
          coverageFormula: '0.4 + 0.4 * (required - count) / required',
          budgetPressureFormula: '0.6 * (cost - 400) / 100 when 400 < cost <= 500',
          budgetExcessFormula: '0.8 + 0.2 * (cost - 500) / 500 when cost > 500, capped at 1',
          budgetPressureFloor: 400,
          openingViolation: { severity: 0.9, type: 'schedule-conflict' },
          overlapViolation: { severity: 0.9, type: 'schedule-conflict' },
          travelViolation: { severity: 0.9, type: 'schedule-conflict' },
          routeBacktracking: { severity: 0.45, type: 'efficiency', optional: true },
        },
        schedule: {
          preparationFormula: '0.4 + 0.45 * (240 - prepared) / 240',
          preparationType: 'coverage',
          boundsViolation: { severity: 0.9, type: 'schedule-conflict' },
          deadlineViolation: { severity: 0.9, type: 'deadline' },
          overlapViolation: { severity: 0.9, type: 'schedule-conflict' },
          backToBackFormula: '0.45 * (15 - gap) / 15 when 0 <= gap < 15',
          backToBackType: 'efficiency',
          optionalMissing: { severity: 0.45, type: 'missing-category', optional: true, kinds: ['meal', 'rest', 'exercise'] },
        },
      },
      birthday: { version: BIRTHDAY_CATALOG_VERSION, catalog: structuredClone(BIRTHDAY_CATALOG), guests: 12, budget: 300, startMinute: 840, endMinute: 1020 },
      weekend: { version: WEEKEND_CATALOG_VERSION, locations: [...WEEKEND_LOCATIONS], activities: structuredClone(WEEKEND_ACTIVITIES), lodging: structuredClone(WEEKEND_LODGING), transport: structuredClone(WEEKEND_TRANSPORT), travel: structuredClone(WEEKEND_TRAVEL), boundaries: structuredClone(WEEKEND_BOUNDARIES), budget: 500, activitiesPerDay: 2 },
      schedule: { version: SCHEDULE_VERSION, weekdays: [...WEEKDAYS], editableKinds: [...EDITABLE_SCHEDULE_KINDS], fixedCommitments: structuredClone(FIXED_COMMITMENTS), startMinute: 480, endMinute: 1200, preparationMinutes: 240, deadline: { day: 4, minute: 1020 }, intervals: 'start-inclusive-end-exclusive' },
      survey: { version: session.configuration.surveyVersion, helpfulness: { question: 'How helpful was the assistant during this task?', minimum: 1, maximum: 7, minimumLabel: 'Not at all helpful', maximumLabel: 'Extremely helpful', noDisplayAnswer: 'not-applicable' }, interruption: { question: 'How much did the assistant interrupt your planning during this task?', minimum: 1, maximum: 7, minimumLabel: 'Not at all interruptive', maximumLabel: 'Extremely interruptive', noDisplayAnswer: 'not-applicable' }, preference: { question: 'Which trial experience did you prefer overall?', noPreference: null } },
    },
  };
}

export function downloadSession(session: ExperimentSession) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(createSessionExport(session), null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `planning-pilot-${session.participantId}-${session.sessionId}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  // Delay cleanup until the browser has consumed the download URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

