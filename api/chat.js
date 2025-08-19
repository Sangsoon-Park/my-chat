// File: api/chat.js — text-input-v3 (GET 버전 확인 + 텍스트 input만 전송)
export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};
function withCors(init = {}) {
  const headers = new Headers(init.headers || {});
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  headers.set('X-Chat-Build', 'text-input-v3');
  return { ...init, headers };
}

function asText(v) {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(asText).join(' ');
  if (v && typeof v === 'object' && 'text' in v) return String(v.text ?? '');
  return String(v ?? '');
}
function transcript(msgs) {
  const norm = (r) => (r === 'assistant' ? 'Assistant' : r === 'system' ? 'System' : 'User');
  return msgs.slice(-12).map(m => `${norm(String(m?.role||'user').toLowerCase())}: ${asText(m?.content).trim()}`.trim()).join('\n');
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, withCors({ status: 204 }));
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ ok: true, version: 'text-input-v3' }),
      withCors({ status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  if (req.method !== 'POST') return new Response('Method Not Allowed', withCors({ status: 405 }));

  let body = {};
  try { body = await req.json(); } catch {}

  const model = body.model || 'gpt-4o-mini';
  let input = '';

  if (typeof body.input === 'string' && body.input.trim()) {
    input = body.input.trim();
  } else if (typeof body.prompt === 'string' && body.prompt.trim()) {
    input = body.prompt.trim();
  } else if (Array.isArray(body.messages) && body.messages.length) {
    input = transcript(body.messages);
  }
  if (!input) input = 'Hello!';

  const upstream = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
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
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  }));
}
