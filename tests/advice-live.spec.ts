import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { createProviderServer } from '../server/provider.mjs';
import { birthdayTask } from '../src/tasks/birthday';
import { weekendTask } from '../src/tasks/weekend';
import { FIXED_COMMITMENTS, scheduleTask } from '../src/tasks/schedule';
import type { AgentSignal } from '../src/types/agent';
import type { AgentContext } from '../src/types/task';

// Opt-in qualitative smoke checks: only fictional plans go to the configured provider.
test('live advice samples for missing selections, budget and scheduling conflicts', async () => {
  test.skip(process.env.RUN_LIVE_ADVICE !== '1', 'Requires an explicitly enabled configured provider.');
  test.setTimeout(65000);
  if (existsSync('.env')) loadEnvFile('.env');
  const birthday = { items: [
    { id: 'food', optionId: 'sandwich-platter', quantity: 2 },
    { id: 'activity', optionId: 'trivia', quantity: 1, startMinute: 840 },
  ] };
  const weekend = { lodgingId: 'luxury-suite', transportId: 'transit-pass', activities: [
    { id: 'a', optionId: 'museum', startMinute: 600 }, { id: 'b', optionId: 'gallery', startMinute: 720 },
    { id: 'c', optionId: 'park-walk', startMinute: 1980 }, { id: 'd', optionId: 'harbor-tour', startMinute: 2100 },
  ] };
  const schedule = { blocks: [...FIXED_COMMITMENTS, { id: 'prep', kind: 'preparation' as const, day: 0, startMinute: 570, durationMinutes: 60 }] };
  const samples: { name: string; signal: AgentSignal; context: AgentContext }[] = [
    { name: 'missing drinks', signal: birthdayTask.evaluateSignals(birthday).find(signal => signal.id.endsWith('missing:drink'))!, context: birthdayTask.getAgentContext(birthday) },
    { name: 'weekend budget', signal: weekendTask.evaluateSignals(weekend).find(signal => signal.type === 'budget')!, context: weekendTask.getAgentContext(weekend) },
    { name: 'schedule overlap', signal: scheduleTask.evaluateSignals(schedule).find(signal => signal.id.includes('overlap:'))!, context: scheduleTask.getAgentContext(schedule) },
  ];
  const origin = process.env.APP_ORIGIN ?? 'http://localhost:5173';
  const server = createProviderServer({ origin });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address() as { port: number };
    for (const sample of samples) {
      expect(sample.signal).toBeDefined();
      const response = await fetch(`http://127.0.0.1:${port}/api/interventions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({ taskId: sample.context.taskId, signal: sample.signal, context: sample.context,
          sessionId: 'smoke', trialId: 'trial', selectionId: 'selection', requestId: 'request', stateRevision: 0 }),
      });
      const advice = await response.json();
      expect(response.status, advice.error ?? 'provider response').toBe(200);
      expect(advice.promptVersion).toBe('intervention-prompt-v2');
      // Read these samples for action, factual reason and feasibility; mocks cannot establish quality.
      console.log(`${sample.name}: ${advice.message}`);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
