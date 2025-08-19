// /api/chat.js — Vercel Edge Function
// GET: 상태 확인 JSON
// POST: OpenAI Chat Completions 프록시 (SSE/비스트리밍 모두)
// OPTIONS: CORS preflight

export const config = {
  runtime: 'edge',       // ← Edge 런타임 명시
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export default async function handler(req) {
  const method = req.method;

  // 1) CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  // 2) 상태 확인용 GET
  if (method === 'GET') {
    return new Response(
      JSON.stringify({
        ok: true,
        endpoint: '/api/chat',
        expects: 'POST (JSON)',
        stream: true,
        version: 'edge@api/chat.js',
        tip: '여기는 상태 확인용입니다. 대화는 클라이언트에서 POST로 호출하세요.',
      }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
    );
  }

  // 3) POST 외에는 405
  if (method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS });
  }

  // 4) 환경변수 체크
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response('Missing OPENAI_API_KEY', { status: 500, headers: CORS });
  }

  // 5) 요청 본문 파싱
  let payloadIn = {};
  try {
    payloadIn = await req.json();
  } catch {
    return new Response('Bad Request: invalid JSON', { status: 400, headers: CORS });
  }

  const {
    messages = [],
    system,
    model = 'gpt-4o-mini',
    temperature = 0.7,
    stream = true,
  } = payloadIn || {};

  const payload = {
    model,
    temperature,
    stream,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...messages,
    ],
  };

  // 6) OpenAI로 프록시
  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  // 7) 비-스트리밍: JSON 그대로 전달
  if (!stream) {
    const json = await upstream.json().catch(() => ({}));
    return new Response(JSON.stringify(json), {
      status: upstream.status,
      headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  // 8) 스트리밍(SSE): 바디를 그대로 파이프
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...CORS,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
