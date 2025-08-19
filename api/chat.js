// File: api/chat.js (Edge, STRICT role/type coercion + CORS + OPTIONS)
// Robustly coerces any incoming messages to Responses API format:
// - user/system -> content[].type = 'input_text'
// - assistant   -> content[].type = 'output_text'
// Accepts body with input / prompt / messages (string or array), arrays of content items, or legacy shapes.
export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function addCors(init = {}) {
  const headers = new Headers(init.headers || {});
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return { ...init, headers };
}

function normRole(r) {
  const s = String(r ?? 'user').trim().toLowerCase();
  if (s === 'sys' || s === 'system') return 'system';
  if (s.startsWith('assist')) return 'assistant';
  if (s === 'user' || s === 'assistant') return s;
  return 'user';
}

function toText(any) {
  if (typeof any === 'string') return any;
  if (Array.isArray(any)) return any.map((v)=> (typeof v === 'string' ? v : JSON.stringify(v))).join(' ');
  if (any && typeof any === 'object') {
    if ('text' in any) return String(any.text ?? '');
    return JSON.stringify(any);
  }
  return String(any ?? '');
}

function coerceContentForRole(role, content) {
  const text = toText(content).trim();
  if (!text) return null;
  const type = role === 'assistant' ? 'output_text' : 'input_text';
  return { type, text };
}

function normalizeFromMessages(messages) {
  const out = [];
  for (const m of messages) {
    const role = normRole(m?.role);
    const c = m?.content;
    if (Array.isArray(c)) {
      for (const part of c) {
        const coerced = coerceContentForRole(role, part);
        if (coerced) out.push({ role, content: [coerced] });
      }
    } else {
      const coerced = coerceContentForRole(role, c);
      if (coerced) out.push({ role, content: [coerced] });
    }
  }
  // keep last 16
  return out.slice(-16);
}

function normalizeInput(body) {
  if (body && body.input !== undefined) return body.input;
  if (body && typeof body.prompt === 'string') return body.prompt;
  if (Array.isArray(body?.messages) && body.messages.length) {
    return normalizeFromMessages(body.messages);
  }
  return 'Hello!';
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, addCors({ status: 204 }));
  if (req.method !== 'POST') return new Response('Method Not Allowed', addCors({ status: 405 }));

  let body = {};
  try { body = await req.json(); } catch { body = {}; }

  const model = body.model || 'gpt-4o-mini';
  const input = normalizeInput(body);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response('Missing OPENAI_API_KEY', addCors({ status: 500 }));

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
    return new Response(text || 'OpenAI API error', addCors({ status: upstream.status }));
  }

  return new Response(upstream.body, addCors({
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    },
  }));
}
