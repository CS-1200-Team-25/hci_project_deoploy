import { expect, test } from '@playwright/test';
import { birthdayTask } from '../src/tasks/birthday';
import { weekendTask } from '../src/tasks/weekend';
import { scheduleTask } from '../src/tasks/schedule';
import { createProviderServer } from '../server/provider.mjs';

test('advice context describes available catalog options and executable edits in every workspace', () => {
  const birthday = birthdayTask.getAgentContext(birthdayTask.initialState).summary;
  expect(birthday.catalog).toEqual(expect.arrayContaining([
    expect.objectContaining({ label: 'Water pack', cost: 18, servings: 12 }),
    expect.objectContaining({ label: 'Trivia', durationMinutes: 30 }),
  ]));
  expect(birthday.editing).toMatchObject({
    supportedEdits: expect.arrayContaining([
      expect.stringMatching(/add.*remove/i), expect.stringMatching(/quantity/i), expect.stringMatching(/start time/i),
    ]),
  });
  expect(birthday.constraints).toMatchObject({ guests: 12, budget: 300, startMinute: 840, endMinute: 1020 });

  const weekend = weekendTask.getAgentContext(weekendTask.initialState).summary;
  expect(weekend.activities).toEqual(expect.arrayContaining([expect.objectContaining({ label: 'Park walk', cost: 0, openingWindows: expect.any(Array) })]));
  expect(weekend.lodging).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'guesthouse' })]));
  expect(weekend.transport).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'transit-pass' })]));
  expect(weekend.editing).toMatchObject({ supportedEdits: expect.arrayContaining([
    expect.stringMatching(/lodging.*transport/i), expect.stringMatching(/add.*remove/i),
    expect.stringMatching(/activity option/i), expect.stringMatching(/day.*start time/i),
  ]) });
  expect(weekend.travel).toMatchObject({ 'transit-pass': { station: { museum: 20 } } });

  const schedule = scheduleTask.getAgentContext(scheduleTask.initialState).summary;
  expect(schedule.editing).toMatchObject({
    editableBlockKinds: ['preparation', 'meal', 'rest', 'exercise', 'buffer'],
    fixedCommitmentsEditable: false,
    supportedEdits: expect.arrayContaining([
      expect.stringMatching(/add.*remove/i), expect.stringMatching(/type.*day.*start time.*duration/i),
    ]),
  });
  expect(schedule.fixedCommitments).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'class-mon', label: 'Monday class', startMinute: 540, durationMinutes: 120 })]));
  expect(schedule.constraints).toMatchObject({ preparationMinutes: 240, deadline: { day: 4, minute: 1020 } });
});

test('Gemini receives the action-and-reason prompt and unmodified real task options', async () => {
  const scheduleState = { blocks: [...scheduleTask.initialState.blocks,
    { id: 'prep-a', kind: 'preparation' as const, day: 0, startMinute: 660, durationMinutes: 60 },
    { id: 'prep-b', kind: 'preparation' as const, day: 0, startMinute: 690, durationMinutes: 60 },
  ] };
  const inputs = [
    { signal: birthdayTask.evaluateSignals(birthdayTask.initialState)[0], context: birthdayTask.getAgentContext(birthdayTask.initialState) },
    { signal: weekendTask.evaluateSignals(weekendTask.initialState)[0], context: weekendTask.getAgentContext(weekendTask.initialState) },
    { signal: scheduleTask.evaluateSignals(scheduleState).find(signal => signal.id === 'schedule:overlap:prep-a:prep-b')!, context: scheduleTask.getAgentContext(scheduleState) },
  ];
  expect(scheduleState.blocks[5]).toEqual({ id: 'prep-a', kind: 'preparation', day: 0, startMinute: 660, durationMinutes: 60 });
  for (const input of inputs) {
    let calls = 0;
    const observed: { prompt: string; input: unknown; schema: { additionalProperties: boolean; properties: { signalId: { enum: string[] } } }; tokens: number }[] = [];
    const fetchImpl: typeof fetch = async (_url, options) => {
      calls++;
      const body = JSON.parse(options!.body as string);
      const prompt = body.systemInstruction.parts[0].text;
      const received = JSON.parse(body.contents[0].parts[0].text);
      const schema = body.generationConfig.responseFormat.text.schema;
      observed.push({ prompt, input: received, schema, tokens: body.generationConfig.maxOutputTokens });
      const text = JSON.stringify({ signalId: input.signal.id, type: 'suggestion', message: 'A provider response.', target: input.signal.target ?? null });
      return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] });
    };
    const server = createProviderServer({ env: {}, model: 'test-model', apiKey: 'test', baseUrl: 'https://provider.example/v1', fetchImpl });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address() as { port: number };
      const response = await fetch(`http://127.0.0.1:${address.port}/api/interventions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
        body: JSON.stringify({ ...input, taskId: input.context.taskId, sessionId: 's', trialId: 't', selectionId: 'sel', requestId: 'req', stateRevision: 0 }),
      });
      expect(response.status).toBe(200);
      expect((await response.json()).promptVersion).toBe('intervention-prompt-v2');
      expect(calls).toBe(1);
      expect(observed[0].input).toEqual(input);
      if (input.context.taskId === 'schedule') {
        const received = observed[0].input as { context: { summary: Record<string, unknown> } };
        expect(received.context.summary.plan).toMatchObject({ blocks: expect.arrayContaining([
          expect.objectContaining({ id: 'prep-a', day: 0, startMinute: 660, weekday: 'Monday', startTime: '11:00', endTime: '12:00', description: 'Monday preparation, 11:00–12:00', editable: true }),
          expect.objectContaining({ id: 'prep-b', description: 'Monday preparation, 11:30–12:30', editable: true }),
          expect.objectContaining({ id: 'class-mon', description: 'Monday class, 09:00–11:00', editable: false }),
        ]) });
        expect(received.context.summary.constraints).toMatchObject({ dailyWindow: 'Monday–Friday 08:00–20:00', deadline: { label: 'Friday 17:00' } });
        expect(JSON.stringify(received.context.summary).length).toBeLessThanOrEqual(12000);
      }
      expect(observed[0].prompt).toMatch(/one specific.*action/i);
      expect(observed[0].prompt).toMatch(/brief reason/i);
      expect(observed[0].prompt).toMatch(/UI label/i);
      expect(observed[0].prompt).toMatch(/do not.*restate/i);
      expect(observed[0].prompt).toMatch(/fixed commitments/i);
      expect(observed[0].prompt).toMatch(/examples.*illustrative/i);
      expect(observed[0].schema.additionalProperties).toBe(false);
      expect(observed[0].schema.properties.signalId.enum).toEqual([input.signal.id]);
      expect(observed[0].tokens).toBe(300);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }
});
