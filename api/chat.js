// /api/chat.js  — Vercel Edge Function (프레임워크 없음)
export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export default async function handler(req) {
  // 1) CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  // 2) 상태 확인용 GET (브라우저 주소창에서 열 때)
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({
        ok: true,
        endpoint: '/api/chat',
        expects: 'POST (JSON)',
        stream: true,
        version: 'api/chat.js@edge',
        tip: '여기는 상태 확인용입니다. 대화는 클라이언트에서 POST로 호출하세요.',
      }),
      {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  // 3) POST만 대화 처리
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response('Missing OPENAI_API_KEY', { status: 500, headers: CORS });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Bad Request: invalid JSON', { status: 400, headers: CORS });
  }

  const {
    messages = [],              // [{ role:'user'|'system'|'assistant', content:'...' }]
    system,                     // (옵션) 시스템 프롬프트 문자열
    model = 'gpt-4o-mini',
    temperature = 0.7,
    stream = true,              // 기본 스트리밍
  } = body;

  // OpenAI Chat Completions 페이로드
  const payload = {
    model,
    temperature,
    stream,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...messages,
    ],
  };

  // OpenAI로 프록시
  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  // 비-스트리밍 모드: JSON 그대로 반환
  if (!stream) {
    const json = await upstream.json().catch(() => ({}));
    return new Response(JSON.stringify(json), {
      status: upstream.status,
      headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  // 스트리밍(SSE) 모드: 바디 파이프-스루
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
