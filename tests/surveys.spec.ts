import { expect, test } from '@playwright/test';
import { consentToSession, createSession, revealTask, submitTask, terminateTask, updateTaskState } from '../src/experiment/session';
import { setFinalSurveyDraft, setPostTaskSurveyDraft, submitFinalSurvey, submitPostTaskSurvey } from '../src/experiment/surveys';
import { authorizeSupervisor, configureSupervisorAccess } from '../src/experiment/supervisor';
import type { ExperimentTask } from '../src/types/task';
import { recordEvent } from '../src/experiment/logger';
import { birthdayTask } from '../src/tasks/birthday';
import { loadSession, saveSession } from '../src/experiment/persistence';

test('not-applicable answers are rejected after displayed assistance and damaged survey recovery is preserved', () => {
  const active = revealTask(consentToSession(createSession('Q004', 1, 1000), 1500), 2000);
  const plan = { items: [
    { id: 'food', optionId: 'wrap-buffet', quantity: 1 }, { id: 'drink', optionId: 'water-pack', quantity: 1 },
    { id: 'activity', optionId: 'trivia', quantity: 1, startMinute: 840 },
  ] };
  expect(birthdayTask.validate(plan).isComplete).toBe(true);
  const ended = submitTask(updateTaskState(active, plan, { type: 'item_updated', payload: {} }, 2500), 3000);
  const draft = setPostTaskSurveyDraft(ended, { helpfulness: 'not-applicable', interruption: 'not-applicable' }, 3050);
  const submitted = submitPostTaskSurvey(draft, 3075);
  let saved: string | null = null;
  const validStorage = { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } };
  saveSession(submitted, validStorage, 3080);
  expect(loadSession(validStorage)?.postTaskSurveys[ended.trials[0].id].interruption).toBe('not-applicable');
  const exposed = recordEvent(ended, 'agent_intervention_shown', {}, 3100);
  expect(() => setPostTaskSurveyDraft(exposed, { helpfulness: 'not-applicable', interruption: 1 })).toThrow(/not-applicable/);
  expect(() => setPostTaskSurveyDraft(exposed, { helpfulness: 4, interruption: 'not-applicable' })).toThrow(/not-applicable/);
  const invalid = [
    { ...ended, postTaskSurveyDrafts: { [ended.trials[0].id]: { helpfulness: 8 } } },
    { ...ended, postTaskSurveys: { [ended.trials[0].id]: { helpfulness: 4, interruption: 1, submittedAt: 3200 } } },
    { ...ended, phase: 'final-survey' as const },
    { ...ended, finalSurveyDraft: { preferredTrialId: 'unknown-trial', explanation: '' } },
  ];
  for (const session of invalid) {
    let serialized: string | null = null;
    const storage = { getItem: () => serialized, setItem: (_key: string, value: string) => { serialized = value; } };
    saveSession(session, storage, 4000);
    const original = serialized;
    expect(() => loadSession(storage)).toThrow(/incompatible or damaged/);
    expect(serialized).toBe(original);
  }
});

test('all three real tasks, persisted survey drafts and final trial preference reach a recovered completion', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Participant ID').fill('Q003');
  await page.getByLabel('Supervisor access code').fill('research-only');
  await page.getByRole('button', { name: 'Create session' }).click();
  await page.getByLabel('I consent to take part in this supervised pilot').check();
  await page.getByRole('button', { name: 'Continue to instructions' }).click();
  await page.getByRole('button', { name: 'Reveal first task' }).click();
  await page.getByRole('button', { name: 'Add Wrap buffet', exact: true }).click();
  await page.getByRole('button', { name: 'Add Water pack', exact: true }).click();
  await page.getByRole('button', { name: 'Add Trivia', exact: true }).click();
  await page.getByRole('button', { name: 'Complete task' }).click();
  await expect(page.getByRole('heading', { name: 'Post-task survey' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit post-task survey' })).toBeDisabled();
  await page.getByLabel('Helpfulness rating').selectOption('not-applicable');
  await page.reload();
  await expect(page.getByLabel('Helpfulness rating')).toHaveValue('not-applicable');
  await expect(page.getByRole('button', { name: 'Submit post-task survey' })).toBeDisabled();
  await page.getByLabel('Interruption rating').selectOption('not-applicable');
  await page.reload();
  await expect(page.getByLabel('Interruption rating')).toHaveValue('not-applicable');
  await page.getByRole('button', { name: 'Submit post-task survey' }).click();
  await expect(page.getByRole('heading', { name: 'Weekend-itinerary planning', exact: true })).toBeVisible();
  await page.getByLabel('Saturday-night lodging').selectOption('guesthouse');
  await page.getByLabel('Transport option').selectOption('transit-pass');
  await page.getByRole('button', { name: 'Add Museum visit', exact: true }).click();
  await page.getByRole('button', { name: 'Add Gallery visit', exact: true }).click();
  await page.getByRole('group', { name: 'Gallery visit booking 2' }).getByLabel('Start time').fill('12:00');
  await page.getByRole('button', { name: 'Add Park walk', exact: true }).click();
  await page.getByRole('group', { name: 'Park walk booking 3' }).getByLabel('Day').selectOption('1');
  await page.getByRole('group', { name: 'Park walk booking 3' }).getByLabel('Start time').fill('09:00');
  await page.getByRole('button', { name: 'Add Harbor tour', exact: true }).click();
  await page.getByRole('group', { name: 'Harbor tour booking 4' }).getByLabel('Day').selectOption('1');
  await page.getByRole('group', { name: 'Harbor tour booking 4' }).getByLabel('Start time').fill('11:00');
  await page.getByRole('button', { name: 'Complete task' }).click();
  await page.getByLabel('Helpfulness rating').selectOption('4');
  await page.getByLabel('Interruption rating').selectOption('2');
  await page.getByRole('button', { name: 'Submit post-task survey' }).click();
  await page.getByRole('button', { name: 'Add preparation block' }).click();
  const preparation = page.getByRole('group', { name: 'preparation block 1' });
  await preparation.getByLabel('Day').selectOption('4');
  await preparation.getByLabel('Start time').fill('13:00');
  await preparation.getByLabel('Duration (minutes)').fill('240');
  await page.getByRole('button', { name: 'Complete task' }).click();
  await page.getByLabel('Helpfulness rating').selectOption('not-applicable');
  await page.getByLabel('Interruption rating').selectOption('1');
  await page.getByRole('button', { name: 'Submit post-task survey' }).click();
  await expect(page.getByRole('heading', { name: 'Final survey' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit final survey' })).toBeDisabled();
  await page.getByLabel('Preferred trial experience').selectOption({ label: 'Trial 2 · Weekend-itinerary planning' });
  await page.getByLabel('Optional explanation').fill('I liked planning the trip.');
  await page.reload();
  await expect(page.getByLabel('Optional explanation')).toHaveValue('I liked planning the trip.');
  await expect(page.getByText(/baseline|low eagerness|high eagerness/i)).toHaveCount(0);
  await page.getByRole('button', { name: 'Submit final survey' }).click();
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
  const session = await page.evaluate(async () => {
    const path = '/src/experiment/persistence.ts';
    return (await import(path)).loadSession();
  });
  expect(session.trials.map((trial: { status: string }) => trial.status)).toEqual(['completed', 'completed', 'completed']);
  expect(session.finalSurvey.preferredTrialId).toBe(session.trials[1].id);
  expect(session.postTaskSurveys[session.trials[0].id].helpfulness).toBe('not-applicable');
  expect(session.postTaskSurveys[session.trials[0].id].interruption).toBe('not-applicable');
  expect(session.events.filter((event: { eventType: string }) => event.eventType === 'post_task_survey_submitted')).toHaveLength(3);
  expect(session.events.filter((event: { eventType: string }) => event.eventType === 'final_survey_submitted')).toHaveLength(1);
});

const resolve = (id: 'birthday' | 'weekend' | 'schedule'): ExperimentTask<unknown> => ({
    id, title: id, instructions: 'Protocol test task', version: 'test-task-v1', initialState: { ready: false },
    isState: (value: unknown): value is { ready: boolean } => typeof value === 'object' && value !== null && 'ready' in value && typeof value.ready === 'boolean',
    validate: (value) => ({ isComplete: (value as { ready: boolean }).ready, errors: (value as { ready: boolean }).ready ? [] : ['Finish the test task.'], warnings: [] }),
    getAgentContext: () => ({ taskId: id, summary: {} }), evaluateSignals: () => [],
});

test('test task adapters advance only after a valid post-task survey and duplicate requests do nothing', () => {
  let session = revealTask(consentToSession(createSession('Q001', 1, 1000), 1500), 2000, resolve);
  session = updateTaskState(session, { ready: true }, { type: 'item_updated', payload: {} }, 2500, resolve);
  session = submitTask(session, 3000, resolve);
  expect(() => submitPostTaskSurvey(session, 3500, resolve)).toThrow(/required/);
  session = setPostTaskSurveyDraft(session, { helpfulness: 'not-applicable', interruption: 1 }, 3500);
  const advanced = submitPostTaskSurvey(session, 4000, resolve);
  expect(advanced.currentTrialIndex).toBe(1);
  expect(advanced.phase).toBe('task');
  expect(advanced.trials[1].taskState).toEqual({ ready: false });
  expect(advanced.trials[1].startedAt).toBe(4000);
  expect(advanced.postTaskSurveys[advanced.trials[0].id]).toEqual({ helpfulness: 'not-applicable', interruption: 1, submittedAt: 4000 });
  expect(submitPostTaskSurvey(advanced, 5000, resolve)).toBe(advanced);
});

test('three adapter trials including unsuccessful termination require surveys before final preference and completion', async () => {
  let session = revealTask(await configureSupervisorAccess(consentToSession(createSession('Q002', 1, 1000), 1500), 'research-only'), 2000, resolve);
  for (let index = 0; index < 3; index++) {
    if (index === 1) {
      const access = (await authorizeSupervisor(session, 'research-only'))!;
      session = terminateTask(session, access, 'Protocol interruption.', 3000 + index * 1000, resolve);
    } else {
      session = updateTaskState(session, { ready: true }, { type: 'item_updated', payload: {} }, 2500 + index * 1000, resolve);
      session = submitTask(session, 3000 + index * 1000, resolve);
    }
    expect(session.phase).toBe('post-task-survey');
    expect(session.currentTrialIndex).toBe(index);
    session = setPostTaskSurveyDraft(session, { helpfulness: 'not-applicable', interruption: 1 }, 3100 + index * 1000);
    session = submitPostTaskSurvey(session, 3200 + index * 1000, resolve);
  }
  expect(session.phase).toBe('final-survey');
  expect(session.trials.map((trial) => trial.outcome)).toEqual(['successful', 'unsuccessful', 'successful']);
  expect(() => submitFinalSurvey(session, 5500)).toThrow(/preference/);
  session = setFinalSurveyDraft(session, { preferredTrialId: null, explanation: '' }, 5600);
  const completed = submitFinalSurvey(session, 5700);
  expect(completed.phase).toBe('complete');
  expect(completed.finalSurvey).toEqual({ preferredTrialId: null, explanation: '', submittedAt: 5700 });
  expect(submitFinalSurvey(completed, 5800)).toBe(completed);
  expect(completed.events.filter((event) => event.eventType === 'post_task_survey_submitted')).toHaveLength(3);
  expect(completed.events.filter((event) => event.eventType === 'final_survey_submitted')).toHaveLength(1);
});
