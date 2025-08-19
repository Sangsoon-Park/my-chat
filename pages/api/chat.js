// pages/api/chat.js — Next.js API Route (Node.js Serverless)
// GET: 상태 확인 JSON
// POST: OpenAI Chat Completions 프록시 (SSE 지원)
// OPTIONS: CORS preflight

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export default async function handler(req, res) {
  try {
    // 1) CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      return res.end();
    }

    // 2) 상태 확인용 GET
    if (req.method === 'GET') {
      res.writeHead(200, { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({
        ok: true,
        endpoint: '/api/chat',
        expects: 'POST (JSON)',
        stream: true,
        version: 'pages/api/chat.js@node-serverless',
        tip: '여기는 상태 확인용입니다. 대화는 클라이언트에서 POST로 호출하세요.',
      }));
    }

    // 3) POST 외에는 405
    if (req.method !== 'POST') {
      res.writeHead(405, CORS);
      return res.end('Method Not Allowed');
    }

    // 4) 환경변수 확인
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.writeHead(500, CORS);
      return res.end('Missing OPENAI_API_KEY');
    }

    // 5) 요청 본문 파싱 (Next.js가 JSON이면 req.body에 넣어줌)
    const payloadIn = req.body && Object.keys(req.body).length ? req.body : await readJsonBody(req);

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

    // 비-스트리밍 모드: JSON 그대로 반환
    if (!stream) {
      const json = await upstream.json().catch(() => ({}));
      res.writeHead(upstream.status, { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(json));
    }

    // 7) 스트리밍(SSE) 파이프
    res.writeHead(upstream.status, {
      ...CORS,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    try {
      const reader = upstream.body.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) res.write(Buffer.from(value));
      }
    } catch (e) {
      // 스트림 에러는 조용히 종료
    } finally {
      res.end();
    }
  } catch (err) {
    // 최종 오류 처리
    try {
      res.writeHead(500, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err?.message || err) }));
    } catch {}
  }
}

// JSON body를 수동 파싱 (bodyParser가 비활성인 경우 대비)
function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}
