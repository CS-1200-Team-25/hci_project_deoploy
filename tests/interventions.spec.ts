import { expect, test } from '@playwright/test';
import { consentToSession, createSession, revealTask } from '../src/experiment/session';
import { getTask } from '../src/tasks/registry';
import { SESSION_STORAGE_KEY } from '../src/experiment/persistence';

for (const [sequence, condition] of [[1, 'baseline'], [3, 'low'], [5, 'high']] as const) {
  test(`same committed birthday state evaluates consistently in ${condition} and reloads without replay`, async ({ page }) => {
    const now = new Date('2026-10-05T12:00:00Z').getTime();
    await page.clock.install({ time: now });
    await page.clock.pauseAt(now);
    const fixture = { items: [
      { id: 'food', optionId: 'sandwich-platter', quantity: 2 },
      { id: 'drink', optionId: 'water-pack', quantity: 1 },
      { id: 'games', optionId: 'trivia', quantity: 1, startMinute: 915 },
      { id: 'decoration', optionId: 'banners', quantity: 1 },
    ] };
    // Public task adapter starts all policies at the same feasible state, with no selection history.
    const session = revealTask(consentToSession(createSession(`POL${sequence}`, sequence, now), now), now,
      (id) => id === 'birthday' ? { ...getTask(id)!, initialState: fixture } : getTask(id));
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: SESSION_STORAGE_KEY, value: JSON.stringify(session) });
    await page.goto('/');
    await page.getByRole('group', { name: 'Sandwich platter item 1' }).getByLabel('Quantity').fill('1');
    const records = await page.evaluate(async () => {
      const path = '/src/experiment/persistence.ts';
      return (await import(path)).loadSession();
    });
    const evaluations = records.events.filter((event: { eventType: string }) => event.eventType === 'signal_evaluated');
    expect(evaluations).toHaveLength(1);
    expect(evaluations[0].payload).toMatchObject({ signalId: 'birthday:coverage:food', signalType: 'coverage', rawSeverity: 0.6, recencyBonus: 0, triggered: false });
    expect(records.events.filter((event: { eventType: string }) => event.eventType === 'intervention_selected')).toHaveLength(0);
    expect(records.events.filter((event: { eventType: string }) => event.eventType === 'agent_intervention_shown')).toHaveLength(0);
    await expect(page.getByRole('region', { name: 'AI Assistant' })).toHaveCount(0);
    // Remove the initializer after the initial document so recovery uses the current saved record.
    const serialized = JSON.stringify(records);
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: SESSION_STORAGE_KEY, value: serialized });
    await page.reload();
    const recovered = await page.evaluate(async () => {
      const path = '/src/experiment/persistence.ts';
      return (await import(path)).loadSession();
    });
    expect(recovered.events.filter((event: { eventType: string }) => event.eventType === 'signal_evaluated')).toHaveLength(1);
    expect(recovered.trials[0].agentHistory).toEqual(records.trials[0].agentHistory);
    // Resolving the only signal produces the required explicit zero-candidate summary.
    await page.getByRole('group', { name: 'Sandwich platter item 1' }).getByLabel('Quantity').fill('2');
    const resolved = await page.evaluate(async () => {
      const path = '/src/experiment/persistence.ts';
      return (await import(path)).loadSession();
    });
    expect(resolved.events.filter((event: { eventType: string }) => event.eventType === 'intervention_evaluation_summary').at(-1).payload.candidateCount).toBe(0);
    expect(resolved.trials[0].agentHistory.selections).toHaveLength(0);
  });
}
