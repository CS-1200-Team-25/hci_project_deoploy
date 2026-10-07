import { expect, test } from '@playwright/test';
import { consentToSession, createSession, revealTask } from '../src/experiment/session';
import { loadSession, saveSession } from '../src/experiment/persistence';

test('recovery rejects phase or outcome contradictions without replacing timing anchors', () => {
  const active = revealTask(consentToSession(createSession('P009', 1, 1000), 2000), 3000);
  const inconsistent = [
    { ...active, phase: 'instructions' as const },
    { ...active, trials: active.trials.map((trial, index) => index === 0 ? { ...trial, completedAt: 4000 } : trial) },
  ];
  for (const session of inconsistent) {
    let serialized: string | null = null;
    const storage = { getItem: () => serialized, setItem: (_key: string, value: string) => { serialized = value; } };
    saveSession(session, storage, 5000);
    const original = serialized;
    expect(() => loadSession(storage)).toThrow(/incompatible or damaged/);
    expect(serialized).toBe(original);
  }
});

test('all 36 supervisor assignments contain every task and condition and balance each position and pairing', () => {
  const positions = Array.from({ length: 3 }, () => ({ tasks: new Map<string, number>(), conditions: new Map<string, number>() }));
  const pairings = new Map<string, number>();
  const sequences = new Set<string>();
  for (let sequenceIndex = 1; sequenceIndex <= 36; sequenceIndex++) {
    const session = createSession(`P${sequenceIndex}`, sequenceIndex, 1000);
    expect(session.trials.map((trial) => trial.task).sort()).toEqual(['birthday', 'schedule', 'weekend']);
    expect(session.trials.map((trial) => trial.condition).sort()).toEqual(['baseline', 'high', 'low']);
    sequences.add(JSON.stringify(session.trials.map(({ task, condition }) => ({ task, condition }))));
    session.trials.forEach((trial, position) => {
      positions[position].tasks.set(trial.task, (positions[position].tasks.get(trial.task) ?? 0) + 1);
      positions[position].conditions.set(trial.condition, (positions[position].conditions.get(trial.condition) ?? 0) + 1);
      const pairing = `${trial.task}-${trial.condition}`;
      pairings.set(pairing, (pairings.get(pairing) ?? 0) + 1);
    });
  }
  expect(sequences.size).toBe(36);
  expect(pairings.size).toBe(9);
  expect([...pairings.values()]).toEqual(Array(9).fill(12));
  for (const position of positions) {
    expect([...position.tasks.values()]).toEqual([12, 12, 12]);
    expect([...position.conditions.values()]).toEqual([12, 12, 12]);
  }
});

test('duplicate consent and reveal requests preserve first timing anchors and event identities', () => {
  const session = createSession('P005', 1, 1000);
  expect(revealTask(session, 2000)).toBe(session);
  const consented = consentToSession(session, 3000);
  expect(consentToSession(consented, 4000)).toBe(consented);
  const active = revealTask(consented, 5000);
  expect(revealTask(active, 6000)).toBe(active);
  expect(active.trials[0].startedAt).toBe(5000);
  expect(active.events.map((event) => event.eventType)).toEqual([
    'session_started', 'consent_given', 'instructions_viewed', 'task_started',
  ]);
});

test('invalid supervisor IDs and sequence indices cannot assign a session', () => {
  expect(() => createSession('Participant name', 1)).toThrow(/pseudonymous/);
  for (const index of [0, 37, 1.5, NaN]) expect(() => createSession('P006', index)).toThrow(/sequence index/);
});
