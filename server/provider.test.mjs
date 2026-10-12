import { test } from 'node:test';
import assert from 'node:assert/strict';
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
test('strict Responses request omits session identity; output identity is validated', async () => {
  let mismatch = false;
  await fixture({ apiKey: 'test', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body);
    assert.equal(body.text.format.strict, true);
    assert.equal(body.store, false);
    assert.equal(JSON.parse(body.input).sessionId, undefined);
    return Response.json({ status: 'completed', id: 'resp_test', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ signalId: mismatch ? 'other' : 'food', type: 'suggestion', message: 'Choose food for twelve guests.', target: null }) }] }] });
  } }, async ({ post }) => {
    const response = await post();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).providerRequestId, 'resp_test');
    mismatch = true;
    assert.equal((await post()).status, 502);
  });
});
test('timeout aborts upstream and returns explicit failure', async () => fixture({ apiKey: 'test', timeoutMs: 100, fetchImpl: (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Error('aborted')), { once: true })) }, async ({ post }) => {
  assert.equal((await post()).status, 504);
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
  assert.throws(() => providerConfiguration({ OPENAI_MODEL: 'bad model' }));
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
