import type { ExperimentSession, FinalSurveyDraft, PostTaskSurveyDraft } from '../types/experiment';
import { recordEvent } from './logger';
import { startAssignedTask } from './session';
import { getTask } from '../tasks/registry';
import type { TaskResolver } from '../tasks/registry';

export function isRating(value: unknown): value is number { return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 7; }
export function assistanceWasDisplayed(session: ExperimentSession, trialId: string) {
  return session.events.some((event) => event.trialId === trialId && event.eventType === 'agent_intervention_shown');
}
export function validPostTaskDraft(session: ExperimentSession, trialId: string, draft: PostTaskSurveyDraft) {
  return [draft.helpfulness, draft.interruption].every((answer) => answer === undefined || isRating(answer)
    || (answer === 'not-applicable' && !assistanceWasDisplayed(session, trialId)));
}
export function setPostTaskSurveyDraft(session: ExperimentSession, draft: PostTaskSurveyDraft, now = Date.now()): ExperimentSession {
  const trial = session.trials[session.currentTrialIndex];
  if (session.phase !== 'post-task-survey' || session.postTaskSurveys[trial.id]) return session;
  if (trial.status !== 'completed' && trial.status !== 'terminated') return session;
  if (!validPostTaskDraft(session, trial.id, draft)) throw new Error('Survey ratings must be 1–7; not-applicable is allowed only without displayed assistance.');
  if (JSON.stringify(session.postTaskSurveyDrafts[trial.id] ?? {}) === JSON.stringify(draft)) return session;
  return recordEvent({ ...session, postTaskSurveyDrafts: { ...session.postTaskSurveyDrafts, [trial.id]: { ...draft } } },
    'post_task_survey_draft_updated', { answers: draft }, now);
}
export function submitPostTaskSurvey(session: ExperimentSession, now = Date.now(), resolve: TaskResolver = getTask): ExperimentSession {
  const trial = session.trials[session.currentTrialIndex];
  if (session.phase !== 'post-task-survey' || session.postTaskSurveys[trial.id]) return session;
  if (trial.status !== 'completed' && trial.status !== 'terminated') return session;
  const draft = session.postTaskSurveyDrafts[trial.id];
  if (!draft || draft.helpfulness === undefined || draft.interruption === undefined || !validPostTaskDraft(session, trial.id, draft)) throw new Error('Both post-task survey responses are required.');
  const survey = { helpfulness: draft.helpfulness, interruption: draft.interruption, submittedAt: now };
  let next = recordEvent({ ...session, postTaskSurveys: { ...session.postTaskSurveys, [trial.id]: survey } }, 'post_task_survey_submitted', { answers: survey }, now);
  if (session.currentTrialIndex === session.trials.length - 1) return { ...next, phase: 'final-survey' };
  next = { ...next, currentTrialIndex: session.currentTrialIndex + 1 };
  return startAssignedTask(next, now, resolve);
}

function validTrialRanking(session: ExperimentSession, ranking: unknown): ranking is string[] {
  return Array.isArray(ranking) && ranking.length === session.trials.length
    && new Set(ranking).size === session.trials.length
    && ranking.every(id => session.trials.some(trial => trial.id === id));
}
export function validFinalDraft(session: ExperimentSession, draft: FinalSurveyDraft) {
  return typeof draft.explanation === 'string' && typeof draft.noPreference === 'boolean'
    && validTrialRanking(session, draft.rankedTrialIds);
}
export function setFinalSurveyDraft(session: ExperimentSession, draft: FinalSurveyDraft, now = Date.now()): ExperimentSession {
  if (session.phase !== 'final-survey' || session.finalSurvey) return session;
  if (!validFinalDraft(session, draft)) throw new Error('Rank every trial exactly once or choose no preference.');
  if (JSON.stringify(session.finalSurveyDraft) === JSON.stringify(draft)) return session;
  return recordEvent({ ...session, finalSurveyDraft: { ...draft, rankedTrialIds: [...draft.rankedTrialIds] } }, 'final_survey_draft_updated', { answers: draft }, now);
}
export function submitFinalSurvey(session: ExperimentSession, now = Date.now()): ExperimentSession {
  if (session.phase !== 'final-survey' || session.finalSurvey) return session;
  const draft = session.finalSurveyDraft;
  if (!validFinalDraft(session, draft)) throw new Error('A complete trial ranking or no preference is required.');
  if (session.trials.some((trial) => !session.postTaskSurveys[trial.id])) throw new Error('Every post-task survey is required.');
  const survey = { rankedTrialIds: draft.noPreference ? null : [...draft.rankedTrialIds], noPreference: draft.noPreference, explanation: draft.explanation, submittedAt: now };
  let next = recordEvent({ ...session, phase: 'complete', finalSurvey: survey, completedAt: now }, 'final_survey_submitted', { answers: survey }, now);
  next = recordEvent(next, 'session_completed', {}, now);
  return next;
}

function isSurveyRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

/** Validate draft ranges, exposure eligibility and phase gates before restoring saved instruments. */
export function validSurveyState(session: ExperimentSession) {
  if (!isSurveyRecord(session.finalSurveyDraft) || !validFinalDraft(session, session.finalSurveyDraft)) return false;
  for (const [trialId, draft] of Object.entries(session.postTaskSurveyDrafts)) {
    const trial = session.trials.find((candidate) => candidate.id === trialId);
    if (!trial || (trial.status !== 'completed' && trial.status !== 'terminated')
      || !isSurveyRecord(draft) || !validPostTaskDraft(session, trialId, draft)) return false;
  }
  for (const [trialId, survey] of Object.entries(session.postTaskSurveys)) {
    const trial = session.trials.find((candidate) => candidate.id === trialId);
    if (!trial || (trial.status !== 'completed' && trial.status !== 'terminated') || !isSurveyRecord(survey)
      || !validPostTaskDraft(session, trialId, survey) || survey.helpfulness === undefined || survey.interruption === undefined
      || !Number.isFinite(survey.submittedAt) || survey.submittedAt < (trial.completedAt ?? Infinity)) return false;
  }
  const needsAll = session.phase === 'final-survey' || session.phase === 'complete';
  if (!session.trials.every((trial, index) => Boolean(session.postTaskSurveys[trial.id]) === (needsAll || index < session.currentTrialIndex))) return false;
  if (session.phase !== 'complete') return session.finalSurvey === undefined && session.completedAt === undefined;
  const final = session.finalSurvey;
  return isSurveyRecord(final) && typeof final.explanation === 'string' && typeof final.noPreference === 'boolean'
    && (final.noPreference ? final.rankedTrialIds === null : validTrialRanking(session, final.rankedTrialIds))
    && Number.isFinite(final.submittedAt) && session.completedAt === final.submittedAt;
}
