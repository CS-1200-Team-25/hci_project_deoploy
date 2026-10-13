import { evaluateIdleTrial } from '../src/experiment/interventions';
import { expect, test } from '@playwright/test';
import { weekendTask } from '../src/tasks/weekend';
import { FIXED_COMMITMENTS, scheduleTask } from '../src/tasks/schedule';
import { consentToSession, createSession, revealTask, submitTask, updateTaskState } from '../src/experiment/session';
import { beginGeneration, finishGeneration } from '../src/experiment/generation';
import { getTask } from '../src/tasks/registry';
import { evaluateInterventions } from '../src/agent/engine';
import { PILOT_CONFIGURATION } from '../src/experiment/conditions';
import { validRequest } from '../server/provider.mjs';

const passing = { lodgingId: 'guesthouse', transportId: 'transit-pass', activities: [
  { id: 'a', optionId: 'museum', startMinute: 600 }, { id: 'b', optionId: 'gallery', startMinute: 720 },
  { id: 'c', optionId: 'park-walk', startMinute: 1980 }, { id: 'd', optionId: 'harbor-tour', startMinute: 2100 },
] };
test('weekend passing and flawed real plans expose stable structured independent signals', () => {
  expect(weekendTask.validate(passing).isComplete).toBe(true);
  expect(weekendTask.evaluateSignals(passing)).toEqual([]);
  const missing = weekendTask.evaluateSignals(weekendTask.initialState);
  expect(missing).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'weekend:lodging', severity: .85 }), expect.objectContaining({ id: 'weekend:transport', severity: .85 })]));
  const flawed = { ...passing, lodgingId: 'luxury-suite', activities: passing.activities.map(item => item.id === 'a' ? { ...item, startMinute: 559 } : item) };
  expect(weekendTask.evaluateSignals(flawed)).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'weekend:budget', type: 'budget' }), expect.objectContaining({ id: 'weekend:opening:a', severity: .9 }), expect.objectContaining({ id: 'weekend:travel:arrival:a', severity: .9 })]));
  expect(weekendTask.getAgentContext(passing).summary).toMatchObject({ plan: passing, constraints: { budget: 500 }, travel: { 'transit-pass': { station: { museum: 20 } } } });
});
test('schedule preparation, deadlines, conflicts and optional wellbeing are distinct stable signals', () => {
  const prepared = { blocks: [...FIXED_COMMITMENTS, { id: 'prep', kind: 'preparation' as const, day: 0, startMinute: 720, durationMinutes: 240 }] };
  expect(scheduleTask.validate(prepared).isComplete).toBe(true);
  expect(scheduleTask.evaluateSignals(prepared).map(signal => signal.id)).toEqual(['schedule:optional:meal', 'schedule:optional:rest', 'schedule:optional:exercise']);
  expect(scheduleTask.evaluateSignals(scheduleTask.initialState).find(signal => signal.id === 'schedule:preparation')?.severity).toBeCloseTo(.85);
  const flawed = { blocks: [...FIXED_COMMITMENTS, { id: 'late', kind: 'preparation' as const, day: 4, startMinute: 990, durationMinutes: 90 }, { id: 'collision', kind: 'meal' as const, day: 0, startMinute: 550, durationMinutes: 30 }] };
  const signals = scheduleTask.evaluateSignals(flawed);
  expect(signals).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'schedule:deadline:late', severity: .9 }), expect.objectContaining({ id: 'schedule:overlap:class-mon:collision', severity: .9 })]));
  expect(scheduleTask.evaluateSignals({ blocks: [...flawed.blocks].reverse() }).map(signal => signal.id).sort()).toEqual(signals.map(signal => signal.id).sort());
  const adjacent = { blocks: [...prepared.blocks, { id: 'meal', kind: 'meal' as const, day: 0, startMinute: 660, durationMinutes: 60 }] };
  expect(scheduleTask.validate(adjacent).isComplete).toBe(true);
  expect(scheduleTask.evaluateSignals(adjacent)).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'schedule:back-to-back:class-mon:meal', severity: .45 })]));
  expect(scheduleTask.getAgentContext(prepared).summary).toMatchObject({ plan: prepared, constraints: { preparationMinutes: 240, deadline: { day: 4, minute: 1020 } } });
});
const generation = { model: 'fixture', promptVersion: 'advice-v1', schemaVersion: 'advice-v1', settings: { maxOutputTokens: 300 }, timeoutMs: 15000 };
for (const [sequence, task, state] of [[17, 'weekend', { ...passing, lodgingId: null }], [29, 'schedule', { blocks: [...FIXED_COMMITMENTS, { id: 'prep', kind: 'preparation', day: 0, startMinute: 720, durationMinutes: 60 }] }]] as const) {
  test(`${task} uses shared selection, generation, display and duplicate guard`, () => {
    let session = revealTask(consentToSession(createSession('SIGNALS', sequence, 1000), 1000), 1000);
    expect(session.trials[0].task).toBe(task);
    expect(session.trials[0].condition).toBe('high');
    session = updateTaskState(session, state, { type: 'item_updated', payload: {} }, 2000);
    session = evaluateIdleTrial(session, 62000);
    const selection = session.trials[0].agentHistory?.selections[0];
    expect(selection).toBeDefined();
    session = beginGeneration(session, selection!.id, generation, 62000);
    const request = session.trials[0].agentHistory!.requests![0];
    expect(request.request.context).toEqual(getTask(task)!.getAgentContext(state));
    expect(validRequest(request.request)).toBe(true);
    const advice = { ...generation, signalId: selection!.signal.id, type: 'suggestion', message: 'Review the selected constraint.', target: null };
    session = finishGeneration(session, request.id, 'succeeded', advice, undefined, 63000);
    expect(session.trials[0].agentHistory!.displays).toHaveLength(1);
    expect(finishGeneration(session, request.id, 'succeeded', advice, undefined, 64000)).toBe(session);
    expect(session.events.filter(event => event.eventType === 'agent_intervention_shown')).toHaveLength(1);
  });
}
test('identical optional schedules expose controlled low/high differences while all conditions share passing requirements', () => {
  const state = { blocks: [...FIXED_COMMITMENTS, { id: 'prep', kind: 'preparation' as const, day: 0, startMinute: 720, durationMinutes: 240 }] };
  const signals = scheduleTask.evaluateSignals(state);
  const history = { now: 61000, issueStartedAt: Object.fromEntries(signals.map(signal => [signal.id, 1000])), displays: [], inFlightSignalIds: [], reservedSignalIds: [], resolvedSignalIds: [], displayCooldowns: PILOT_CONFIGURATION.displayCooldowns };
  expect(evaluateInterventions(signals, PILOT_CONFIGURATION.conditions.baseline, history).selected).toBeNull();
  expect(evaluateInterventions(signals, PILOT_CONFIGURATION.conditions.low, history).selected).toBeNull();
  expect(evaluateInterventions(signals, PILOT_CONFIGURATION.conditions.high, history).selected?.signal.id).toBe('schedule:optional:exercise');
  expect(scheduleTask.validate(state).isComplete).toBe(true);
});
test('real edits record only verified corrections and signal resolution without claiming advice causation', () => {
  let session = revealTask(consentToSession(createSession('CORRECT', 17, 1000), 1000), 1000);
  session = updateTaskState(session, { ...passing, lodgingId: null }, { type: 'item_updated', payload: {} }, 2000);
  session = submitTask(session, 2500);
  const worse = updateTaskState(session, { ...passing, lodgingId: null, transportId: null }, { type: 'item_updated', payload: {} }, 3000);
  expect(worse.events.filter(event => event.eventType === 'participant_correction')).toHaveLength(0);
  session = updateTaskState(worse, passing, { type: 'item_updated', payload: {} }, 4000);
  expect(session.events.filter(event => event.eventType === 'participant_correction')).toEqual([expect.objectContaining({ taskId: 'weekend', condition: 'high', payload: expect.objectContaining({ interventionId: null, correctedRequirements: expect.arrayContaining(['Select Saturday-night lodging.', 'Select a transport option.']) }) })]);
  expect(session.events.filter(event => event.eventType === 'signal_resolved')).toEqual(expect.arrayContaining([expect.objectContaining({ payload: expect.objectContaining({ signalId: 'weekend:lodging', attribution: 'unspecified' }) })]));
});


test('weekend optional backtracking and every overlapping pair retain stable identities with exact travel boundaries', () => {
  const route = { ...passing, activities: [
    { id: 'sat-museum', optionId: 'museum', startMinute: 600 },
    { id: 'sat-park', optionId: 'park-walk', startMinute: 720 },
    { id: 'sat-gallery', optionId: 'gallery', startMinute: 840 },
    ...passing.activities.filter(item => ['c', 'd'].includes(item.id)),
  ] };
  expect(weekendTask.validate(route).isComplete).toBe(true);
  expect(weekendTask.evaluateSignals(route)).toEqual([expect.objectContaining({ id: 'weekend:route:0', type: 'efficiency', severity: .45 })]);
  const overlapping = { ...passing, activities: [
    { id: 'long', optionId: 'boat-ride', startMinute: 660 },
    { id: 'short-a', optionId: 'gallery', startMinute: 670 },
    { id: 'short-b', optionId: 'park-walk', startMinute: 735 },
  ] };
  const signals = weekendTask.evaluateSignals(overlapping);
  expect(signals).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'weekend:overlap:long:short-a', severity: .9 }), expect.objectContaining({ id: 'weekend:overlap:long:short-b', severity: .9 })]));
  expect(weekendTask.evaluateSignals({ ...overlapping, activities: [...overlapping.activities].reverse() }).map(signal => signal.id).sort()).toEqual(signals.map(signal => signal.id).sort());
  const boundary = { ...passing, activities: passing.activities.map(item => item.id === 'a' ? { ...item, optionId: 'gallery', startMinute: 560 } : item) };
  expect(weekendTask.evaluateSignals(boundary).filter(signal => signal.type === 'schedule-conflict')).toEqual([]);
});
