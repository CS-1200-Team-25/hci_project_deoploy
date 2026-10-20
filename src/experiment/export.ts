import type { ExperimentSession } from '../types/experiment';
import { PILOT_SCENARIOS } from './scenarios';
import { BIRTHDAY_CATALOG, BIRTHDAY_CATALOG_VERSION } from '../tasks/birthday';
import { WEEKEND_ACTIVITIES, WEEKEND_LODGING, WEEKEND_TRANSPORT, WEEKEND_TRAVEL, WEEKEND_BOUNDARIES, WEEKEND_CATALOG_VERSION } from '../tasks/weekend';
import { FIXED_COMMITMENTS, SCHEDULE_VERSION, WEEKDAYS } from '../tasks/schedule';

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
      birthday: { version: BIRTHDAY_CATALOG_VERSION, catalog: structuredClone(BIRTHDAY_CATALOG), guests: 12, budget: 300, startMinute: 840, endMinute: 1020 },
      weekend: { version: WEEKEND_CATALOG_VERSION, activities: structuredClone(WEEKEND_ACTIVITIES), lodging: structuredClone(WEEKEND_LODGING), transport: structuredClone(WEEKEND_TRANSPORT), travel: structuredClone(WEEKEND_TRAVEL), boundaries: structuredClone(WEEKEND_BOUNDARIES), budget: 500, activitiesPerDay: 2 },
      schedule: { version: SCHEDULE_VERSION, weekdays: [...WEEKDAYS], fixedCommitments: structuredClone(FIXED_COMMITMENTS), startMinute: 480, endMinute: 1200, preparationMinutes: 240, deadline: { day: 4, minute: 1020 }, intervals: 'start-inclusive-end-exclusive' },
      survey: { version: session.configuration.surveyVersion, helpfulness: { question: 'How helpful was the assistant during this task?', minimum: 1, maximum: 7, minimumLabel: 'Not at all helpful', maximumLabel: 'Extremely helpful', noDisplayAnswer: 'not-applicable' }, interruption: { question: 'How much did the assistant interrupt your planning during this task?', minimum: 1, maximum: 7, minimumLabel: 'Not at all interruptive', maximumLabel: 'Extremely interruptive', noDisplayAnswer: 'not-applicable' }, preference: { question: 'Rank the trial experiences from most to least preferred.', responseField: 'rankedTrialIds', order: 'most-to-least-preferred', noPreference: null, noPreferenceField: 'noPreference' } },
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

