// File: api/chat.js (Vercel Edge Function, CORS + role-aware types)
// Fix: assistant 메시지는 content.type을 'output_text'로, user/system은 'input_text'로 변환합니다.
// 또한 CORS 프리플라이트(OPTIONS)를 처리합니다.
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

function normRole(r) {
  const x = String(r || 'user').toLowerCase();
  if (x === 'sys') return 'system';
  if (x === 'assistant' || x === 'user' || x === 'system') return x;
  return 'user';
}

function toText(c) {
  if (Array.isArray(c)) return c.map(v => (typeof v === 'string' ? v : JSON.stringify(v))).join(' ');
  if (typeof c === 'string') return c;
  if (c && typeof c === 'object' && 'text' in c) return String(c.text ?? '');
  return String(c ?? '');
}

function normalizeInput(body) {
  // If explicit input/prompt provided, prefer them
  if (body && body.input !== undefined) return body.input;
  if (body && typeof body.prompt === 'string') return body.prompt;

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (messages.length) {
    // Map roles to proper content types:
    // - user/system -> input_text
    // - assistant  -> output_text
    const mapped = messages
      .map((m) => {
        const role = normRole(m.role);
        const text = toText(m.content).trim();
        if (!text) return null;
        const type = role === 'assistant' ? 'output_text' : 'input_text';
        return { role, content: [{ type, text }] };
      })
      .filter(Boolean);
    // Keep recent context reasonable
    const MAX = 16;
    return mapped.slice(-MAX);
  }
  // Fallback minimal input (avoid invalid request)
  return 'Hello!';
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
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
