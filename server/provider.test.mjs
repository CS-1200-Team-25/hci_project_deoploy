import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geminiAdapter } from './adapters.mjs';
import { createProviderServer, configuration, providerConfiguration, validRequest } from './provider.mjs';
const request = { sessionId: 's', trialId: 't', taskId: 'birthday', stateRevision: 1, selectionId: 'x', requestId: 'request-1', signal: { id: 'food', type: 'coverage', severity: .85, message: 'Add food' }, context: { taskId: 'birthday', summary: { foodServings: 0 } } };
async function fixture(options, run) {
  const server = createProviderServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (body = request, origin = 'http://localhost:5173') => fetch(`${url}/api/interventions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
  try { await run({ url, post }); } finally { await new Promise(resolve => server.close(resolve)); }
}
test('config exposes frozen settings; missing credential fails without fallback', async () => fixture({ apiKey: '' }, async ({ url, post }) => {
  assert.deepEqual(await (await fetch(`${url}/api/interventions/config`)).json(), configuration);
  assert.equal((await post()).status, 503);
}));
test('rejects cross-origin and unknown fields before provider invocation', async () => fixture({ apiKey: 'test', fetchImpl: () => { throw Error('must not call'); } }, async ({ post }) => {
  assert.equal((await post(request, 'https://other.example')).status, 403);
  assert.equal((await post({ ...request, condition: 'high' })).status, 400);
  assert.equal((await post({ ...request, context: { taskId: 'weekend', summary: 'x' } })).status, 400);
}));
test('Gemini is the default and native structured advice uses server-only credentials', async () => {
  await fixture({ apiKey: 'gemini-secret', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    assert.equal(options.headers['x-goog-api-key'], 'gemini-secret');
    const body = JSON.parse(options.body);
    assert.equal(body.generationConfig.responseFormat.text.mimeType, 'APPLICATION_JSON');
    assert.equal(body.generationConfig.responseFormat.text.schema.additionalProperties, false);
    assert.equal(body.generationConfig.responseFormat.text.schema.properties.target.type, 'null');
    assert.deepEqual(body.generationConfig.responseFormat.text.schema.properties.signalId.enum, ['food']);
    assert.equal(JSON.parse(body.contents[0].parts[0].text).sessionId, undefined);
    return Response.json({ responseId: 'gemini-response', modelVersion: 'gemini-3.5-flash-lite-001', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ signalId: 'food', type: 'suggestion', message: 'Choose enough food for twelve guests.', target: null }) }] } }] });
  } }, async ({ url, post }) => {
    const config = await (await fetch(`${url}/api/interventions/config`)).json();
    assert.equal(config.provider, 'gemini');
    assert.equal(JSON.stringify(config).includes('gemini-secret'), false);
    const response = await post();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).providerRequestId, 'gemini-response');
  });
});

for (const [provider, truncated, refused, invalid] of [
  ['gemini', { candidates: [{ finishReason: 'MAX_TOKENS' }] }, { promptFeedback: { blockReason: 'SAFETY' } }, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"signalId":"wrong","type":"suggestion","message":"Bad identity","target":null}' }] } }] }],
]) {
  test(`${provider} refuses incomplete, blocked and mismatched advice without exposure`, async () => {
    let output = truncated;
    await fixture({ provider, model: 'test-model', baseUrl: 'https://provider.example/v1', apiKey: 'test', fetchImpl: async () => Response.json(output) }, async ({ post }) => {
      let response = await post();
      assert.equal(response.status, 502);
      assert.equal((await response.json()).error, 'provider-incomplete');
      output = refused;
      response = await post();
      assert.equal(response.status, 502);
      assert.equal((await response.json()).error, 'provider-refusal');
      output = invalid;
      response = await post();
      assert.equal(response.status, 502);
      assert.equal((await response.json()).error, 'invalid-provider-response');
    });
  });
}
test('timeout aborts upstream and returns explicit failure', async () => fixture({ apiKey: 'test', timeoutMs: 100, fetchImpl: (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Error('aborted')), { once: true })) }, async ({ post }) => {
  assert.equal((await post()).status, 504);
}));

test('default timeout allows delayed Gemini responses within its configured budget', async () => fixture({ apiKey: 'test', fetchImpl: async (_url, { signal }) => {
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(signal.aborted, false);
  return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ signalId: 'food', type: 'suggestion', message: 'Add food for twelve guests.', target: null }) }] } }] });
} }, async ({ post }) => {
  assert.equal((await post()).status, 200);
}));
test('concurrency guard rejects a third live call and releases slots on timeout', async () => {
  let started = 0;
  let resolveStarted;
  const bothStarted = new Promise(resolve => { resolveStarted = resolve; });
  await fixture({ apiKey: 'test', timeoutMs: 150, fetchImpl: (_url, { signal }) => {
    started++;
    if (started === 2) resolveStarted();
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }));
  } }, async ({ post }) => {
    const first = post();
    const second = post();
    await bothStarted;
    assert.equal((await post()).status, 429);
    assert.deepEqual((await Promise.all([first, second])).map(response => response.status), [504, 504]);
    assert.equal((await post()).status, 504);
    assert.equal(started, 3);
  });
});
test('configured model and timeout are validated and exposed accurately', async () => {
  for (const timeout of ['99', '120001', 'NaN', '1.5']) assert.throws(() => providerConfiguration({ GENERATION_TIMEOUT_MS: timeout }));
  assert.throws(() => providerConfiguration({ LLM_MODEL: 'bad model' }));
  assert.throws(() => providerConfiguration({ LLM_PROVIDER: 'openai-compatible' }), /Only Gemini/);
  assert.throws(() => providerConfiguration({ LLM_PROVIDER: 'openai-compatible', GEMINI_MODEL: 'gemini-2.5-flash' }), /Only Gemini/);
  assert.throws(() => providerConfiguration({ LLM_PROVIDER: 'unknown' }), /LLM_PROVIDER/);
  assert.throws(() => createProviderServer({ provider: 'openai', env: {} }), /Only Gemini/);
  assert.equal(providerConfiguration({ GEMINI_MODEL: 'gemini-primary', LLM_MODEL: 'legacy-model' }).model, 'gemini-primary');
  assert.equal(providerConfiguration({ LLM_MODEL: 'legacy-model' }).model, 'legacy-model');
  for (const baseUrl of ['http://remote.example/v1', 'https://user:password@example.com/v1', 'https://example.com/v1?key=secret']) {
    assert.throws(() => createProviderServer({ baseUrl }), /GEMINI_BASE_URL/);
  }
  await fixture({ model: 'custom-snapshot', timeoutMs: 1234 }, async ({ url }) => {
    const config = await (await fetch(`${url}/api/interventions/config`)).json();
    assert.equal(config.model, 'custom-snapshot');
    assert.equal(config.timeoutMs, 1234);
  });
});
test('request schema requires request identity, known domain enums and safe bounded summaries', () => {
  assert.equal(validRequest(request), true);
  assert.equal(validRequest({ ...request, requestId: undefined }), false);
  assert.equal(validRequest({ ...request, taskId: 'unknown' }), false);
  assert.equal(validRequest({ ...request, signal: { ...request.signal, type: 'unknown' } }), false);
  for (const summary of ['text', { number: Infinity }, { nested: { invalid: undefined } }, { text: 'x'.repeat(12001) }, JSON.parse('{"__proto__":{}}')]) {
    assert.equal(validRequest({ ...request, context: { ...request.context, summary } }), false);
  }
});
test('browser disconnect cancels the upstream request', async () => {
  let notifyStarted;
  let notifyAborted;
  const started = new Promise(resolve => { notifyStarted = resolve; });
  const aborted = new Promise(resolve => { notifyAborted = resolve; });
  await fixture({ apiKey: 'test', fetchImpl: (_url, { signal }) => {
    notifyStarted();
    return new Promise((_, reject) => signal.addEventListener('abort', () => { notifyAborted(); reject(Error('aborted')); }, { once: true }));
  } }, async ({ url }) => {
    const controller = new AbortController();
    const pending = fetch(`${url}/api/interventions`, { method: 'POST', headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: controller.signal }).catch(() => undefined);
    await started;
    controller.abort();
    await pending;
    await aborted;
  });
});

test('Gemini credential precedence preserves legacy aliases without leaking keys', () => {
  assert.equal(geminiAdapter.credential({ GEMINI_API_KEY: 'primary', GOOGLE_API_KEY: 'google', LLM_API_KEY: 'legacy' }), 'primary');
  assert.equal(geminiAdapter.credential({ GOOGLE_API_KEY: 'google', LLM_API_KEY: 'legacy' }), 'google');
  assert.equal(geminiAdapter.credential({ LLM_API_KEY: 'legacy' }), 'legacy');
  assert.equal(geminiAdapter.credential({ OPENAI_API_KEY: 'unsupported' }), undefined);
});

test('loopback Gemini endpoints still require a key', async () => fixture({ env: {}, baseUrl: 'http://127.0.0.1:9999/v1beta', fetchImpl: () => { throw Error('must not call'); } }, async ({ post }) => {
  assert.equal((await post()).status, 503);
}));
