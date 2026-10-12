/** Provider protocols normalize to text plus optional response/version identifiers. */
export class ProviderOutputError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const gemini = {
  defaultModel: 'gemini-2.5-flash-lite',
  defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  credential: env => env.LLM_API_KEY ?? env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY,
  build({ config, baseUrl, apiKey, prompt, schema, input }) {
    return {
      url: `${baseUrl}/models/${encodeURIComponent(config.model)}:generateContent`,
      headers: { 'x-goog-api-key': apiKey },
      body: {
        systemInstruction: { parts: [{ text: prompt }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }],
        generationConfig: { maxOutputTokens: config.settings.maxOutputTokens, responseFormat: { text: { mimeType: 'APPLICATION_JSON', schema } } },
      },
    };
  },
  parse(body) {
    if (body.promptFeedback?.blockReason) throw new ProviderOutputError('provider-refusal');
    const candidate = body.candidates?.[0];
    if (!candidate || ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT'].includes(candidate.finishReason)) throw new ProviderOutputError('provider-refusal');
    if (candidate.finishReason !== 'STOP') throw new ProviderOutputError('provider-incomplete');
    return { text: (candidate.content?.parts ?? []).filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join(''), id: body.responseId, model: body.modelVersion };
  },
};

const openai = {
  defaultModel: 'gpt-4.1-mini-2025-04-14',
  defaultBaseUrl: 'https://api.openai.com/v1',
  credential: env => env.LLM_API_KEY ?? env.OPENAI_API_KEY,
  build({ config, baseUrl, apiKey, prompt, schema, input }) {
    return {
      url: `${baseUrl}/responses`, headers: { Authorization: `Bearer ${apiKey}` },
      body: { model: config.model, instructions: prompt, input: JSON.stringify(input), store: false, max_output_tokens: config.settings.maxOutputTokens, text: { format: { type: 'json_schema', name: 'planning_intervention', strict: true, schema } } },
    };
  },
  parse(body) {
    if (body.status !== 'completed') throw new ProviderOutputError('provider-incomplete');
    const contents = (body.output ?? []).flatMap(item => item.content ?? []);
    if (contents.some(item => item.type === 'refusal')) throw new ProviderOutputError('provider-refusal');
    return { text: contents.filter(item => item.type === 'output_text').map(item => item.text).join(''), id: body.id, model: body.model };
  },
};

const compatible = {
  credential: env => env.LLM_API_KEY,
  build({ config, baseUrl, apiKey, prompt, schema, input }) {
    return {
      url: `${baseUrl}/chat/completions`, headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      body: { model: config.model, messages: [{ role: 'system', content: prompt }, { role: 'user', content: JSON.stringify(input) }], max_tokens: config.settings.maxOutputTokens, response_format: { type: 'json_schema', json_schema: { name: 'planning_intervention', strict: true, schema } } },
    };
  },
  parse(body) {
    const choice = body.choices?.[0];
    if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') throw new ProviderOutputError('provider-refusal');
    if (choice?.finish_reason !== 'stop') throw new ProviderOutputError('provider-incomplete');
    return { text: choice.message?.content, id: body.id, model: body.model };
  },
};

export const providerAdapters = Object.freeze({ gemini, openai, 'openai-compatible': compatible });
