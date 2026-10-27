import { expect, test } from '@playwright/test';
import { evaluateInterventions, recencyBonus } from '../src/agent/engine';
import { PILOT_CONFIGURATION } from '../src/experiment/conditions';
import { birthdayTask } from '../src/tasks/birthday';
import { createSession, consentToSession, revealTask, updateTaskState } from '../src/experiment/session';
import { loadSession } from '../src/experiment/persistence';
import { weekendTask } from '../src/tasks/weekend';
import { scheduleTask } from '../src/tasks/schedule';

test('all tasks separate high and low eagerness early and escalate unresolved issues later', () => {
  for (const task of [birthdayTask, weekendTask, scheduleTask]) {
    const signals = task.evaluateSignals(task.initialState);
    const context = { now: 30000, issueStartedAt: Object.fromEntries(signals.map(signal => [signal.id, 0])),
      displays: [], inFlightSignalIds: [], reservedSignalIds: [], resolvedSignalIds: [] };
    const high = evaluateInterventions(signals, PILOT_CONFIGURATION.conditions.high, context);
    expect(high.selected).not.toBeNull();
    expect(high.evaluations.every(item => item.finalScore < 0.75)).toBe(true);
    expect(evaluateInterventions(signals, PILOT_CONFIGURATION.conditions.low, context).selected).toBeNull();
    expect(evaluateInterventions(signals, PILOT_CONFIGURATION.conditions.low, { ...context, now: 120000 }).selected).not.toBeNull();
  }
  const signals = [{ id: 'optional', type: 'efficiency' as const, severity: .45, message: 'Optional improvement' }];
  const context = { now: 60000, issueStartedAt: { optional: 0 }, displays: [], inFlightSignalIds: [], reservedSignalIds: [], resolvedSignalIds: [] };
  expect(evaluateInterventions(signals, PILOT_CONFIGURATION.conditions.high, context).selected).not.toBeNull();
  expect(evaluateInterventions(signals, PILOT_CONFIGURATION.conditions.low, { ...context, now: 120000 }).selected).toBeNull();
  expect(evaluateInterventions(signals, PILOT_CONFIGURATION.conditions.low, { ...context, now: 180000 }).selected).not.toBeNull();
});

test('meaningful edits persist reservations without replay or exposure; damaged histories cannot recover', () => {
  const active = revealTask(consentToSession(createSession('E001', 5, 1000), 1000), 1000);
  expect(active.events.some((event) => event.eventType.includes('evaluat'))).toBe(false);
  const state = { items: [{ id: 'food', optionId: 'sandwich-platter', quantity: 1 }] };
  const edited = updateTaskState(active, state, { type: 'item_added', payload: {} }, 1000);
  expect(edited.trials[0].agentHistory?.selections).toHaveLength(1);
  expect(edited.trials[0].agentHistory?.selections[0]).toMatchObject({ selectedAt: 1000, stateRevision: 1 });
  expect(edited.trials[0].agentHistory?.displays).toEqual([]);
  expect(updateTaskState(edited, state, { type: 'item_updated', payload: {} }, 2000)).toBe(edited);
  const recovered = loadSession({ getItem: () => JSON.stringify(edited), setItem: () => {} })!;
  expect(recovered.events).toEqual(edited.events);
  const repeated = updateTaskState(recovered, { items: [{ ...state.items[0], quantity: 2 }] }, { type: 'item_updated', payload: {} }, 2000);
  expect(repeated.events.filter((event) => event.eventType === 'signal_evaluated').slice(-3).some((event) => event.payload.exclusionReason === 'reserved')).toBe(true);
  expect(repeated.events.some((event) => event.eventType === 'agent_intervention_shown')).toBe(false);
  const damaged = structuredClone(edited);
  damaged.trials[0].agentHistory!.selections[0].stateRevision = 99;
  expect(() => loadSession({ getItem: () => JSON.stringify(damaged), setItem: () => {} })).toThrow();
});

test('filters before ranking and uses stable IDs and actual display cooldown boundaries', () => {
  const signals = ['z', 'a', 'busy', 'resolved'].map((id) => ({ id, type: 'coverage' as const, severity: 0.8, message: id }));
  const context = { now: 60_000, issueStartedAt: Object.fromEntries(signals.map(signal => [signal.id, 0])), displays: [{ signalId: 'z', timestamp: 0 }], inFlightSignalIds: ['busy'], reservedSignalIds: [], resolvedSignalIds: ['resolved'] };
  expect(evaluateInterventions(signals, PILOT_CONFIGURATION.conditions.high, context).selected?.signal.id).toBe('a');
  expect(evaluateInterventions(signals, PILOT_CONFIGURATION.conditions.high, { ...context, now: 29_999 }).selected).toBeNull();
  const at30 = evaluateInterventions(signals, PILOT_CONFIGURATION.conditions.high, { ...context, now: 30_000 });
  expect(at30.selected?.signal.id).toBe('a');
  expect(at30.evaluations.find((entry) => entry.signalId === 'z')).toMatchObject({ signalType: 'coverage', exclusionReason: 'signal-cooldown' });
  expect(evaluateInterventions([], PILOT_CONFIGURATION.conditions.high, context)).toEqual({ selected: null, evaluations: [] });
});

test('birthday signals are normalized, stable, and independent of policy; feasible plans can have no signals', () => {
  expect(birthdayTask.evaluateSignals({ items: [] }).map((signal) => signal.id)).toEqual(['birthday:missing:food', 'birthday:missing:drink', 'birthday:missing:activity', 'birthday:missing:decoration']);
  const state = { items: [
    { id: 'food', optionId: 'sandwich-platter', quantity: 1 },
    { id: 'drink', optionId: 'water-pack', quantity: 1 },
    { id: 'games', optionId: 'trivia', quantity: 1, startMinute: 915 },
    { id: 'decoration', optionId: 'banners', quantity: 1 },
  ] };
  expect(birthdayTask.evaluateSignals(state)).toMatchObject([{ id: 'birthday:coverage:food', severity: 0.6 }]);
  expect(birthdayTask.evaluateSignals({ items: state.items.map((item) => item.id === 'food' ? { ...item, quantity: 2 } : item) })).toEqual([]);
  const invalid = birthdayTask.evaluateSignals({ items: [...state.items, { id: 'late', optionId: 'trivia', quantity: 1, startMinute: 1010 }, { id: 'cost', optionId: 'banners', quantity: 100 }] });
  expect(invalid.map((signal) => signal.id)).toContain('birthday:budget');
  expect(invalid.map((signal) => signal.id)).toContain('birthday:window:late');
  expect(invalid.every((signal) => signal.severity >= 0 && signal.severity <= 1)).toBe(true);
});

test('identical signals follow disabled baseline and the lower high threshold without claiming a display', () => {
  const signals = [{ id: 'coverage', type: 'coverage' as const, severity: 0.6, message: 'Guest coverage is short.' }];
  const context = { now: 1000, issueStartedAt: { coverage: 1000 }, displays: [], inFlightSignalIds: [], reservedSignalIds: [], resolvedSignalIds: [] };
  expect(evaluateInterventions(signals, PILOT_CONFIGURATION.conditions.baseline, context)).toMatchObject({ selected: null, evaluations: [{ threshold: null, proactive: false, rawSeverity: 0.6, recencyBonus: 0, finalScore: 0.3, triggered: false, exclusionReason: 'baseline' }] });
  expect(evaluateInterventions(signals, PILOT_CONFIGURATION.conditions.low, context).selected).toBeNull();
  expect(evaluateInterventions(signals, PILOT_CONFIGURATION.conditions.high, { ...context, now: 31000 }).selected?.signal.id).toBe('coverage');
  expect([0, 29, 30, 59, 60, 119, 120, 179, 180, 100000].map(recencyBonus)).toEqual([0, 0, 0.15, 0.15, 0.3, 0.3, 0.45, 0.45, 0.6, 0.6]);
});
