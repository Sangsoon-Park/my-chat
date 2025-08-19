// File: api/chat.js (Vercel Edge Function, CORS-enabled fixed)
// Accepts { model, prompt?, input?, messages? } and normalizes for OpenAI Responses API.
// Handles CORS preflight (OPTIONS) so browsers won't show "Failed to fetch".
export const config = { runtime: 'edge' };

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function withCors(init = {}) {
  const headers = new Headers(init.headers || {});
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return { ...init, headers };
}

function normalizeInput(body) {
  if (body && body.input !== undefined) return body.input;
  if (body && typeof body.prompt === 'string') return body.prompt;
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (messages.length) {
    return messages.map((m) => ({
      role: m.role || 'user',
      content: Array.isArray(m.content)
        ? m.content
        : [{ type: 'input_text', text: String(m.content ?? '') }],
    }));
  }
  return 'Hello!';
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    // Preflight response
    return new Response(null, withCors({ status: 204 }));
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', withCors({ status: 405 }));
  }

  let body = {};
  try { body = await req.json(); } catch { body = {}; }

  const model = body.model || 'gpt-4o-mini';
  const input = normalizeInput(body);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response('Missing OPENAI_API_KEY', withCors({ status: 500 }));

  const upstream = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input, stream: true }),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return new Response(text || 'OpenAI API error', withCors({ status: upstream.status }));
  }

  return new Response(upstream.body, withCors({
    status: 200,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive' },
  }));
}
