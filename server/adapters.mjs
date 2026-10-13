/** Provider protocols normalize to text plus optional response/version identifiers. */
export class ProviderOutputError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export const geminiAdapter = Object.freeze({
  defaultModel: 'gemini-3.5-flash-lite',
  defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  credential: env => env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY ?? env.LLM_API_KEY,
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
});
