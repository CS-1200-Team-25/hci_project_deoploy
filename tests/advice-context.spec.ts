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

test('every provider receives the action-and-reason prompt and unmodified real task options', async () => {
  const inputs = [
    { signal: birthdayTask.evaluateSignals(birthdayTask.initialState)[0], context: birthdayTask.getAgentContext(birthdayTask.initialState) },
    { signal: weekendTask.evaluateSignals(weekendTask.initialState)[0], context: weekendTask.getAgentContext(weekendTask.initialState) },
    { signal: scheduleTask.evaluateSignals(scheduleTask.initialState)[0], context: scheduleTask.getAgentContext(scheduleTask.initialState) },
  ];
  for (const provider of ['gemini', 'openai', 'openai-compatible']) {
    for (const input of inputs) {
      let calls = 0;
      const observed: { prompt: string; input: unknown; schema: { additionalProperties: boolean; properties: { signalId: { enum: string[] } } }; tokens: number }[] = [];
      const fetchImpl: typeof fetch = async (_url, options) => {
        calls++;
        const body = JSON.parse(options!.body as string);
        const prompt = provider === 'gemini' ? body.systemInstruction.parts[0].text
          : provider === 'openai' ? body.instructions : body.messages[0].content;
        const received = JSON.parse(provider === 'gemini' ? body.contents[0].parts[0].text
          : provider === 'openai' ? body.input : body.messages[1].content);
        const schema = provider === 'gemini' ? body.generationConfig.responseFormat.text.schema
          : provider === 'openai' ? body.text.format.schema : body.response_format.json_schema.schema;
        observed.push({ prompt, input: received, schema, tokens: provider === 'gemini' ? body.generationConfig.maxOutputTokens
          : provider === 'openai' ? body.max_output_tokens : body.max_tokens });
        const text = JSON.stringify({ signalId: input.signal.id, type: 'suggestion', message: 'A provider response.', target: input.signal.target ?? null });
        return Response.json(provider === 'gemini'
          ? { candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] }
          : provider === 'openai' ? { status: 'completed', output: [{ content: [{ type: 'output_text', text }] }] }
            : { choices: [{ finish_reason: 'stop', message: { content: text } }] });
      };
      const server = createProviderServer({ env: {}, provider, model: 'test-model', apiKey: 'test', baseUrl: 'https://provider.example/v1', fetchImpl });
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
  }
});
