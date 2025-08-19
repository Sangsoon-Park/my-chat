// File: api/chat.js (Edge). Ultra-simple + CORS + OPTIONS
// Fix: Avoids 'input_text' vs 'output_text' entirely by sending a plain text `input` to the Responses API.

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};
function cors(init = {}) {
  const headers = new Headers(init.headers || {});
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return { ...init, headers };
}

function normRole(r) {
  const s = String(r ?? 'user').trim().toLowerCase();
  if (s === 'sys') return 'system';
  if (s.startsWith('assist')) return 'assistant';
  if (s === 'user' || s === 'assistant' || s === 'system') return s;
  return 'user';
}
function asText(v) {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(asText).join(' ');
  if (v && typeof v === 'object' && 'text' in v) return String(v.text ?? '');
  return String(v ?? '');
}
function messagesToTranscript(msgs) {
  const last = msgs.slice(-12).map(m => {
    const role = normRole(m.role);
    const label = role === 'assistant' ? 'Assistant' : role === 'system' ? 'System' : 'User';
    return `${label}: ${asText(m.content).trim()}`.trim();
  });
  return last.join('\n');
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, cors({ status: 204 }));
  if (req.method !== 'POST') return new Response('Method Not Allowed', cors({ status: 405 }));

  let body = {};
  try { body = await req.json(); } catch {}

  const model = body.model || 'gpt-4o-mini';
  let input = '';

  if (typeof body.input === 'string' && body.input.trim()) {
    input = body.input.trim();
  } else if (typeof body.prompt === 'string' && body.prompt.trim()) {
    input = body.prompt.trim();
  } else if (Array.isArray(body.messages) && body.messages.length) {
    input = messagesToTranscript(body.messages);
  }
  if (!input) input = 'Hello!';

  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input, stream: true }),
  });

  if (!r.ok) {
    const t = await r.text();
    return new Response(t || 'OpenAI API error', cors({ status: r.status }));
    }

  return new Response(r.body, cors({
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  }));
}
