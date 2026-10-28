import { openSupervisorTools } from './supervisor-tools';
import { expect, test, type Page } from '@playwright/test';
import { consentToSession, createSession, revealTask } from '../src/experiment/session';
import { SESSION_STORAGE_KEY } from '../src/experiment/persistence';

const config = { model: 'rehearsal-fixture', promptVersion: 'advice-v1', schemaVersion: 'advice-v1', settings: { maxOutputTokens: 300 }, timeoutMs: 15000 };
async function survey(page: Page, displayed = false) {
  await page.getByLabel('Helpfulness rating').selectOption(displayed ? '4' : 'not-applicable');
  await page.getByLabel('Interruption rating').selectOption('2');
  await page.getByRole('button', { name: 'Submit post-task survey' }).click();
}
for (const endSchedule of ['successful', 'unsuccessful'] as const) {
  test(`assigned real three-task pilot exports ${endSchedule} outcome with complete event audit and recoverable exposure`, async ({ page }) => {
    const requests: any[] = [];
    await page.clock.install({ time: new Date('2026-10-11T12:00:00Z') });
    await page.clock.pauseAt(new Date('2026-10-11T12:00:01Z'));
    await page.route('**/api/interventions/config', route => route.fulfill({ json: config }));
    await page.route('**/api/interventions', route => {
      const request = route.request().postDataJSON(); requests.push(request);
      return route.fulfill({ json: { ...config, signalId: request.signal.id, type: 'suggestion', message: `Review ${request.taskId} constraints.`, target: null } });
    });
    await page.goto('/');
    await page.getByLabel('Participant ID').fill(`FULL_${endSchedule}`);
    await page.getByLabel('Supervisor access code').fill('research-only');
    await page.getByRole('button', { name: 'Create session' }).click();
    await page.getByLabel('I consent to take part in this supervised pilot').check();
    await page.getByRole('button', { name: 'Continue to instructions' }).click();
    await page.getByRole('button', { name: 'Reveal first task' }).click();
    await page.getByRole('button', { name: 'Complete task' }).click();
    await expect(page.getByRole('alert')).toContainText('requirements');
    await page.getByRole('button', { name: 'Add Wrap buffet', exact: true }).click();
    await page.getByRole('button', { name: 'Add Water pack', exact: true }).click();
    await page.getByRole('button', { name: 'Add Trivia', exact: true }).click();
    await page.getByRole('button', { name: 'Add Banners', exact: true }).click();
    await page.getByRole('button', { name: 'Add Craft workshop', exact: true }).click();
    const craft = page.getByRole('group', { name: /Craft workshop/ });
    await craft.getByLabel('Start time').fill('15:00');
    await craft.getByRole('button', { name: 'Remove' }).click();
    await page.clock.runFor(10000);
    await page.getByRole('button', { name: 'Complete task' }).click();
    expect(requests).toHaveLength(0);
    await survey(page);
    await page.getByLabel('Saturday-night lodging').selectOption('guesthouse');
    await page.clock.fastForward(120000);
    await expect(page.getByText('Review weekend constraints.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
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
    await page.clock.runFor(10000);
    const priorEvents = await page.evaluate(() => JSON.parse(localStorage.getItem('planning-pilot-session-v1')!).events);
    const priorCalls = requests.length;
    await page.reload();
    await expect(page.getByRole('region', { name: 'AI Assistant' })).toHaveCount(0);
    expect(requests).toHaveLength(priorCalls);
    await page.getByRole('button', { name: 'Complete task' }).click();
    await survey(page, true);
    await page.clock.fastForward(30000);
    await expect(page.getByText('Review schedule constraints.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Add preparation block' }).click();
    await page.getByRole('button', { name: 'Acknowledge' }).click();
    await page.getByRole('group', { name: 'preparation block 1' }).getByLabel('Duration (minutes)').fill('90');
    await page.clock.runFor(10000);
    if (endSchedule === 'successful') {
      const prep = page.getByRole('group', { name: 'preparation block 1' });
      await prep.getByLabel('Start time').fill('12:00');
      await page.getByRole('button', { name: 'Add preparation block' }).click();
      const tuesday = page.getByRole('group', { name: 'preparation block 2' });
      await tuesday.getByLabel('Day').selectOption('1');
      await tuesday.getByLabel('Duration (minutes)').fill('90');
      await page.getByRole('button', { name: 'Add preparation block' }).click();
      await page.getByRole('group', { name: 'preparation block 3' }).getByLabel('Day').selectOption('2');
      await page.getByRole('button', { name: 'Complete task' }).click();
    } else {
      await openSupervisorTools(page);
      await page.getByText('Supervisor access', { exact: true }).click();
      await page.getByLabel('Supervisor access code').fill('research-only');
      await page.getByRole('button', { name: 'Unlock supervisor controls' }).click();
      await page.getByLabel('Termination reason').fill('Supervised rehearsal interruption.');
      await page.getByRole('button', { name: 'End unsuccessful trial' }).click();
    }
    await survey(page, true);
    await page.getByLabel('Preferred trial experience', { exact: true }).selectOption('no-preference');
    await page.getByLabel('Least preferred trial experience').selectOption('no-preference');
    await page.getByRole('button', { name: 'Submit final survey' }).click();
    await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible();
    await openSupervisorTools(page);
    await page.getByText('Supervisor storage tools', { exact: true }).click();
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download session JSON' }).click();
    const stream = await (await downloading).createReadStream(); let json = '';
    for await (const chunk of stream!) json += chunk.toString();
    const exported = JSON.parse(json); const session = exported.session; const events = session.events;
    expect(session.trials.map((trial: any) => [trial.task, trial.condition, trial.outcome])).toEqual([
      ['birthday', 'baseline', 'successful'], ['weekend', 'low', 'successful'], ['schedule', 'high', endSchedule],
    ]);
    expect(session.trials.map((trial: any) => trial.elapsedMs)).toEqual([10000, 130000, 40000]);
    expect(session.trials[2].successfulCompletionMs ?? null).toBe(endSchedule === 'successful' ? 40000 : null);
    expect(exported.trialMetrics.map((trial: any) => trial.displayCount)).toEqual([0, 1, 1]);
    expect(session.configuration.conditions.baseline).toEqual({ proactive: false, threshold: null });
    expect(session.configuration.signalVersion).toBe('planning-signals-v4');
    expect(events.slice(0, priorEvents.length)).toEqual(priorEvents);
    expect(new Set(events.map((event: any) => event.id)).size).toBe(events.length);
    expect(events.map((event: any) => event.sequence)).toEqual(events.map((_event: any, index: number) => index + 1));
    const types = events.map((event: any) => event.eventType);
    expect(types).toEqual(expect.arrayContaining(['item_added', 'item_removed', 'item_updated', 'item_moved', 'task_validation_requested', 'task_validation_result', 'signal_evaluated', 'intervention_evaluation_summary', 'agent_request_started', 'agent_request_finished', 'agent_intervention_shown', 'agent_intervention_acknowledged', 'agent_intervention_dismissed', 'participant_correction', 'signal_resolved', 'task_completed', 'post_task_survey_submitted', 'final_survey_submitted', 'session_recovered']));
    for (const event of events) {
      expect(event).toMatchObject({ sessionId: session.sessionId, participantId: session.participantId, timestamp: expect.any(Number) });
      if (event.trialId) {
        const trial = session.trials.find((trial: any) => trial.id === event.trialId);
        expect(event).toMatchObject({ taskId: trial.task, condition: trial.condition });
      }
      if (/^(item_|signal_|intervention_|agent_|participant_correction|task_|post_task_)/.test(event.eventType)) expect(event.trialId).toBeTruthy();
    }
    expect(types.filter((type: string) => type === 'task_started')).toHaveLength(3);
    expect(types.filter((type: string) => type === 'agent_intervention_shown')).toHaveLength(2);
    expect(types.filter((type: string) => type === 'post_task_survey_submitted')).toHaveLength(3);
    expect(types.filter((type: string) => type === 'final_survey_submitted')).toHaveLength(1);
    expect(Object.keys(session.postTaskSurveys)).toHaveLength(3);
    expect(requests.map(request => request.taskId)).toEqual(['weekend', 'schedule']);
    expect(requests.every(request => !('condition' in request))).toBe(true);
    expect(session.trials.slice(1).every((trial: any) => trial.agentHistory.requests[0].latencyMs === 0)).toBe(true);
  });
}
for (const [sequence, task, firstEdit, nextEdit] of [
  [17, 'weekend', 'lodging', 'transport'], [29, 'schedule', 'preparation', 'rest'],
] as const) {
  test(`${task} late and failed advice never exposes text and storage failures remain exportable`, async ({ page }) => {
    const session = revealTask(consentToSession(createSession('FAILURES', sequence)));
    const now = new Date(session.trials[0].startedAt!);
    await page.clock.install({ time: now });
    await page.clock.pauseAt(now);
    await page.goto('/');
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: SESSION_STORAGE_KEY, value: JSON.stringify(session) });
    await page.reload();
    await page.route('**/api/interventions/config', route => route.fulfill({ json: config }));
    let release!: () => void; const delayed = new Promise<void>(resolve => { release = resolve; });
    let calls = 0;
    await page.route('**/api/interventions', async route => {
      const number = ++calls; const request = route.request().postDataJSON();
      if (number === 1) {
        await delayed;
        await route.fulfill({ json: { ...config, signalId: request.signal.id, type: 'suggestion', message: 'Late advice must stay hidden.', target: null } }).catch(() => {});
      } else await route.fulfill({ status: 502, json: { error: 'provider-error' } });
    });
    if (firstEdit === 'lodging') await page.getByLabel('Saturday-night lodging').selectOption('guesthouse');
    else await page.getByRole('button', { name: 'Add preparation block' }).click();
    await expect.poll(() => calls).toBe(1);
    await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('Full', 'QuotaExceededError'); }; });
    if (nextEdit === 'transport') await page.getByLabel('Transport option').selectOption('transit-pass');
    else await page.getByRole('button', { name: 'Add optional block' }).click();
    await expect.poll(() => calls).toBe(2);
    await expect(page.getByRole('status', { name: 'Supervisor generation status' })).toContainText('failed');
    release();
    await expect(page.getByText('Late advice must stay hidden.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Complete task' })).toBeEnabled();
    await page.getByRole('button', { name: 'Complete task' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Local saving failed' })).toBeVisible();
    await openSupervisorTools(page);
    await page.getByText('Supervisor storage tools', { exact: true }).click();
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download session JSON' }).click();
    const stream = await (await downloading).createReadStream(); let json = '';
    for await (const chunk of stream!) json += chunk.toString();
    const exported = JSON.parse(json); const trial = exported.session.trials[0];
    expect(trial.agentHistory.requests.map((request: any) => request.status)).toEqual(['canceled', 'failed']);
    expect(exported.trialMetrics[0].displayCount).toBe(0);
    expect(exported.retention.compromised).toBe(true);
    expect(exported.session.events.filter((event: any) => ['agent_request_finished', 'persistence_failed'].includes(event.eventType)).every((event: any) => event.trialId === trial.id && event.taskId === task && event.condition === 'high')).toBe(true);
    expect(new Set(exported.session.events.map((event: any) => event.id)).size).toBe(exported.session.events.length);
  });
}
