// api/chat.js  (Vercel Edge Function)
export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  // ✅ GET: 상태 확인용
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({
        ok: true,
        endpoint: '/api/chat',
        expects: 'POST (JSON)',
        stream: true,
        version: 'chat.js@edge',
      }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response('Missing OPENAI_API_KEY', { status: 500, headers: CORS });

  let body;
  try { body = await req.json(); }
  catch { return new Response('Bad Request: invalid JSON', { status: 400, headers: CORS }); }

  const { messages = [], system, model = 'gpt-4o-mini', temperature = 0.7, stream = true } = body;

  const payload = {
    model, temperature, stream,
    messages: [(system ? { role: 'system', content: system } : null), ...messages].filter(Boolean),
  };

  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!stream) {
    const json = await upstream.json();
    return new Response(JSON.stringify(json), {
      status: upstream.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...CORS,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
