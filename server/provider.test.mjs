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
    assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingLevel: 'minimal' });
    assert.equal(body.generationConfig.responseFormat.text.mimeType, 'APPLICATION_JSON');
    assert.equal(body.generationConfig.responseFormat.text.schema.additionalProperties, false);
    assert.equal(body.generationConfig.responseFormat.text.schema.properties.target.type, 'null');
    assert.deepEqual(body.generationConfig.responseFormat.text.schema.properties.signalId.enum, ['food']);
    assert.equal(JSON.parse(body.contents[0].parts[0].text).sessionId, undefined);
    return Response.json({ responseId: 'gemini-response', modelVersion: 'gemini-3.5-flash-lite-001', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ signalId: 'food', type: 'suggestion', message: 'Choose enough food for twelve guests.', target: null }) }] } }] });
  } }, async ({ url, post }) => {
    const config = await (await fetch(`${url}/api/interventions/config`)).json();
    assert.equal(config.provider, 'gemini');
    assert.equal(config.settings.thinkingLevel, 'minimal');
    assert.equal(config.settings.thinkingBudget, undefined);
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

function successfulAdvice() {
  return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ signalId: 'food', type: 'suggestion', message: 'Add food for twelve guests.', target: null }) }] } }] });
}

test('Gemini key rotation alternates accepted requests, including upstream failures', async () => {
  const usedKeys = [];
  await fixture({ env: { GEMINI_API_KEY: 'first-key', GEMINI_API_KEY_2: 'second-key' }, fetchImpl: async (_url, options) => {
    usedKeys.push(options.headers['x-goog-api-key']);
    return usedKeys.length === 2 ? Response.json({ error: { message: 'Unavailable' } }, { status: 503 }) : successfulAdvice();
  } }, async ({ url, post }) => {
    assert.equal((await post()).status, 200);
    const config = await (await fetch(`${url}/api/interventions/config`)).json();
    assert.deepEqual(config, configuration);
    assert.equal((await post({ ...request, condition: 'high' })).status, 400);
    assert.equal((await post(request, 'https://other.example')).status, 403);
    assert.equal((await post()).status, 502);
    assert.equal((await post()).status, 200);
    assert.equal((await post()).status, 200);
    assert.deepEqual(usedKeys, ['first-key', 'second-key', 'first-key', 'second-key']);
  });
});

for (const [name, env, expectedKeys] of [
  ['one primary key', { GEMINI_API_KEY: 'first-key', GEMINI_API_KEY_2: '  ' }, ['first-key', 'first-key']],
  ['one secondary key', { GEMINI_API_KEY: ' ', GEMINI_API_KEY_2: ' second-key ' }, ['second-key', 'second-key']],
  ['duplicate keys', { GEMINI_API_KEY: 'first-key', GEMINI_API_KEY_2: ' first-key ' }, ['first-key', 'first-key']],
  ['Google alias', { GOOGLE_API_KEY: 'google-key', GEMINI_API_KEY_2: 'second-key' }, ['google-key', 'second-key']],
  ['legacy alias', { LLM_API_KEY: 'legacy-key', GEMINI_API_KEY_2: 'second-key' }, ['legacy-key', 'second-key']],
]) {
  test(`Gemini key rotation supports ${name}`, async () => {
    const usedKeys = [];
    await fixture({ env, fetchImpl: async (_url, options) => {
      usedKeys.push(options.headers['x-goog-api-key']);
      return successfulAdvice();
    } }, async ({ post }) => {
      assert.equal((await post()).status, 200);
      assert.equal((await post()).status, 200);
      assert.deepEqual(usedKeys, expectedKeys);
    });
  });
}

test('Gemini key rotation returns unconfigured when both keys are blank', async () => fixture({ env: { GEMINI_API_KEY: ' ', GEMINI_API_KEY_2: ' ' }, fetchImpl: () => { throw Error('must not call'); } }, async ({ post }) => {
  assert.equal((await post()).status, 503);
}));

test('Gemini key rotation preserves explicit single-key overrides', async () => fixture({ env: { GEMINI_API_KEY: 'first-key', GEMINI_API_KEY_2: 'second-key' }, apiKey: 'override-key', fetchImpl: async (_url, options) => {
  assert.equal(options.headers['x-goog-api-key'], 'override-key');
  return successfulAdvice();
} }, async ({ post }) => {
  assert.equal((await post()).status, 200);
  assert.equal((await post()).status, 200);
}));

test('Gemini key rotation handles overlapping calls without advancing on a locally busy request', async () => {
  const usedKeys = [];
  const releases = [];
  let notifyStarted;
  const bothStarted = new Promise(resolve => { notifyStarted = resolve; });
  await fixture({ env: { GEMINI_API_KEY: 'first-key', GEMINI_API_KEY_2: 'second-key' }, fetchImpl: async (_url, options) => {
    usedKeys.push(options.headers['x-goog-api-key']);
    if (usedKeys.length <= 2) await new Promise(resolve => {
      releases.push(resolve);
      if (releases.length === 2) notifyStarted();
    });
    return successfulAdvice();
  } }, async ({ post }) => {
    const pending = [post(), post()];
    try {
      await bothStarted;
      assert.equal((await post()).status, 429);
      releases[1]();
      assert.equal((await Promise.race(pending)).status, 200);
      assert.equal((await post()).status, 200);
      assert.deepEqual(usedKeys, ['first-key', 'second-key', 'first-key']);
    } finally {
      releases.forEach(resolve => resolve());
      await Promise.all(pending);
    }
  });
});

test('Gemini key rotation redacts every configured key and its encoded form from upstream errors', async () => {
  const secrets = ['secret/key+one', 'secret/key+two'];
  await fixture({ env: { GEMINI_API_KEY: secrets[0], GEMINI_API_KEY_2: secrets[1] }, fetchImpl: async () => Response.json({ error: { message: `Invalid credentials: ${secrets.join(' ')} ${secrets.map(encodeURIComponent).join(' ')}` } }, { status: 401 }) }, async ({ post }) => {
    for (let i = 0; i < 2; i++) {
      const response = await post();
      assert.equal(response.status, 502);
      const body = await response.json();
      assert.match(body.diagnostics.message, /Invalid credentials/);
      for (const secret of secrets.flatMap(key => [key, encodeURIComponent(key)])) assert.equal(JSON.stringify(body).includes(secret), false);
    }
  });
});

test('loopback Gemini endpoints still require a key', async () => fixture({ env: {}, baseUrl: 'http://127.0.0.1:9999/v1beta', fetchImpl: () => { throw Error('must not call'); } }, async ({ post }) => {
  assert.equal((await post()).status, 503);
}));

test('upstream rejection exposes actionable Gemini details and redacts credentials and URLs', async () => fixture({ apiKey: 'secret-key', fetchImpl: async () => Response.json({ error: { status: 'INVALID_ARGUMENT', message: 'thinkingBudget is unsupported; secret-key at https://example.com/?key=secret-key' }, headers: { authorization: 'secret-key' } }, { status: 400 }) }, async ({ post }) => {
  const response = await post();
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error, 'provider-error');
  assert.equal(body.diagnostics.upstreamStatus, 400);
  assert.equal(body.diagnostics.providerStatus, 'INVALID_ARGUMENT');
  assert.match(body.diagnostics.message, /thinkingBudget is unsupported/);
  assert.equal(JSON.stringify(body).includes('secret-key'), false);
  assert.equal(JSON.stringify(body).includes('https://example.com'), false);
}));

test('non-JSON upstream errors retain status without echoing raw body', async () => fixture({ apiKey: 'test', fetchImpl: async () => new Response('private proxy body', { status: 503 }) }, async ({ post }) => {
  const body = await (await post()).json();
  assert.equal(body.diagnostics.upstreamStatus, 503);
  assert.equal(body.diagnostics.message, undefined);
}));

test('transport failures expose safe cause codes without raw exception messages', async () => fixture({ apiKey: 'test', fetchImpl: async () => { throw new Error('private endpoint or credential', { cause: { code: 'ENOTFOUND' } }); } }, async ({ post }) => {
  const body = await (await post()).json();
  assert.equal(body.diagnostics.stage, 'transport');
  assert.equal(body.diagnostics.transportCode, 'ENOTFOUND');
  assert.equal(JSON.stringify(body).includes('private endpoint'), false);
}));

test('Gemini 3 Flash-Lite uses a supported level while Gemini 2.5 retains zero budget', () => {
  assert.deepEqual(providerConfiguration({ GEMINI_MODEL: 'gemini-3.5-flash-lite' }).settings, { maxOutputTokens: 300, thinkingLevel: 'minimal' });
  const config = providerConfiguration({ GEMINI_MODEL: 'gemini-2.5-flash' });
  const call = geminiAdapter.build({ config, baseUrl: 'https://example.com', apiKey: 'test', prompt: 'test', schema: {}, input: {} });
  assert.deepEqual(call.body.generationConfig.thinkingConfig, { thinkingBudget: 0 });
});
