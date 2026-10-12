import { expect, test } from '@playwright/test';
import { consentToSession, createSession, recoverSession, revealTask, submitTask, updateTaskState } from '../src/experiment/session';
import { beginGeneration, finishGeneration } from '../src/experiment/generation';
import { loadSession, saveSession } from '../src/experiment/persistence';
import { getTask } from '../src/tasks/registry';

const config = { model: 'test-model', promptVersion: 'advice-v1', schemaVersion: 'advice-v1', settings: { maxOutputTokens: 300 }, timeoutMs: 15000 };
const fixture = { items: [{ id: 'food', optionId: 'sandwich-platter', quantity: 2 }, { id: 'drink', optionId: 'water-pack', quantity: 1 }, { id: 'games', optionId: 'party-games', quantity: 1, startMinute: 840 }, { id: 'craft', optionId: 'craft-workshop', quantity: 1, startMinute: 885 }] };
function selected() {
  const session = revealTask(consentToSession(createSession('PUBLIC', 5, 1000), 1000), 1000,
    (id) => id === 'birthday' ? { ...getTask(id)!, initialState: fixture } : getTask(id));
  return updateTaskState(session, { items: fixture.items.map((item) => item.id === 'food' ? { ...item, quantity: 1 } : item) }, { type: 'item_updated', payload: {} }, 2000);
}

test('public lifecycle cancels resolved requests before successful completion, late responses cannot expose advice', () => {
  let session = selected();
  session = beginGeneration(session, session.trials[0].agentHistory!.selections[0].id, config, 2000);
  const record = session.trials[0].agentHistory!.requests![0];
  expect(beginGeneration(session, record.request.selectionId, config, 2000)).toBe(session);
  session = updateTaskState(session, fixture, { type: 'item_updated', payload: {} }, 3000);
  session = submitTask(session, 4000);
  expect(session.phase).toBe('post-task-survey');
  expect(session.trials[0].agentHistory!.requests![0].status).toBe('canceled');
  expect(finishGeneration(session, record.id, 'succeeded', { ...config, signalId: record.request.signal.id, type: 'suggestion', message: 'Old advice', target: null }, undefined, 5000)).toBe(session);
  expect(session.trials[0].agentHistory!.displays).toEqual([]);
});

test('recovery interrupts pending request with original trial context and rejects damaged request identity', () => {
  let session = selected();
  session = beginGeneration(session, session.trials[0].agentHistory!.selections[0].id, config, 2000);
  const recovered = recoverSession(session, 3000);
  expect(recovered.trials[0].agentHistory!.requests![0].status).toBe('interrupted');
  expect(recovered.events.find((event) => event.eventType === 'agent_request_finished')).toMatchObject({ trialId: session.trials[0].id, taskId: 'birthday', condition: 'high' });
  const damaged = structuredClone(session);
  damaged.trials[0].agentHistory!.requests![0].request.trialId = 'wrong';
  let value = '';
  const storage = { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
  saveSession(damaged, storage, 3000);
  expect(() => loadSession(storage)).toThrow('incompatible or damaged');
});

test('provider identity survives recovery and mismatched provider output cannot display', () => {
  let session = selected();
  const providerConfig = { ...config, provider: 'gemini' };
  session = beginGeneration(session, session.trials[0].agentHistory!.selections[0].id, providerConfig, 2000);
  const request = session.trials[0].agentHistory!.requests![0];
  const advice = { ...providerConfig, provider: 'openai', signalId: request.request.signal.id, type: 'suggestion', message: 'Wrong provider advice', target: null };
  const shown = finishGeneration(session, request.id, 'succeeded', { ...advice, provider: 'gemini' }, undefined, 3000);
  expect(shown.events.find(event => event.eventType === 'agent_intervention_shown')?.payload).toMatchObject({ provider: 'gemini' });
  session = finishGeneration(session, request.id, 'succeeded', advice, undefined, 3000);
  expect(session.trials[0].agentHistory!.requests![0].status).toBe('invalid');
  expect(session.trials[0].agentHistory!.displays).toEqual([]);
  let value = '';
  const storage = { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
  saveSession(session, storage, 3000);
  expect(loadSession(storage)!.trials[0].agentHistory!.requests![0]).toMatchObject({ provider: 'gemini', status: 'invalid' });
});
