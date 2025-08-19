// File: api/chat.js (Vercel Serverless Function)
// Deploy on Vercel. Set env: OPENAI_API_KEY
export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  const { model = 'gpt-4o-mini', messages = [] } = await req.json().catch(() => ({}));

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response('Missing OPENAI_API_KEY', { status: 500 });

  const input = messages.map(m => ({ role: m.role, content: m.content }));

  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input,
      stream: true,
    }),
  });

  if (!r.ok) {
    const text = await r.text();
    return new Response(text || 'OpenAI API error', { status: r.status });
  }

  const { readable, writable } = new TransformStream();
  (async () => {
    const reader = r.body.getReader();
    const writer = writable.getWriter();
    const enc = new TextEncoder();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = new TextDecoder().decode(value);
        for (const line of chunk.split('\\n')) {
          if (line.trim().length) {
            await writer.write(enc.encode(`data: ${line}\\n`));
          }
        }
        await writer.write(enc.encode('\\n'));
      }
      await writer.write(enc.encode('data: [DONE]\\n\\n'));
    } catch(e) {
      await writer.write(enc.encode(`data: [ERROR] ${String(e)}\\n\\n`));
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
