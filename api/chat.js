// /api/chat.js — Vercel Serverless Function (Node.js)
// GET: 상태 확인 JSON
// POST: OpenAI Chat Completions SSE 프록시
// OPTIONS: CORS preflight

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

module.exports = async (req, res) => {
  // 1) CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }

  // 2) 상태 확인용 GET
  if (req.method === 'GET') {
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      ok: true,
      endpoint: '/api/chat',
      expects: 'POST (JSON)',
      stream: true,
      version: 'api/chat.js@node-serverless',
      tip: '여기는 상태 확인용입니다. 대화는 클라이언트에서 POST로 호출하세요.',
    }));
    return;
  }

  // 3) POST 외에는 405
  if (req.method !== 'POST') {
    res.writeHead(405, CORS);
    return res.end('Method Not Allowed');
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.writeHead(500, CORS);
    return res.end('Missing OPENAI_API_KEY');
  }

  // 4) 요청 본문 파싱
  let body = '';
  await new Promise((resolve, reject) => {
    req.on('data', (chunk) => (body += chunk));
    req.on('end', resolve);
    req.on('error', reject);
  });

  let payloadIn;
  try {
    payloadIn = JSON.parse(body || '{}');
  } catch {
    res.writeHead(400, CORS);
    return res.end('Bad Request: invalid JSON');
  }

  const {
    messages = [],
    system,
    model = 'gpt-4o-mini',
    temperature = 0.7,
    stream = true,
  } = payloadIn;

  const payload = {
    model,
    temperature,
    stream,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...messages,
    ],
  };

  // 5) OpenAI로 프록시 (Node 18+는 fetch 내장)
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
    res.writeHead(upstream.status, { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(json));
  }

  // 6) 스트리밍(SSE) 파이프
  res.writeHead(upstream.status, {
    ...CORS,
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  try {
    // Web ReadableStream -> Async iterator (Node 18+ 지원)
    const reader = upstream.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) res.write(Buffer.from(value)); // 그대로 전달
    }
  } catch (err) {
    // 스트림 중 에러 시 종료
  } finally {
    res.end();
  }
};
