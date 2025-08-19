// File: api/chat.js (Vercel Edge Function, fixed)
// Accepts { model, prompt?, input?, messages? } and normalizes for OpenAI Responses API.
export const config = { runtime: 'edge' };

function normalizeInput(body) {
  // Priority: explicit input -> prompt -> messages
  if (body && body.input !== undefined) {
    return body.input;
  }
  if (body && typeof body.prompt === 'string') {
    return body.prompt;
  }
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (messages.length) {
    // Convert Chat-style messages to Responses "input" format
    return messages.map((m) => ({
      role: m.role || 'user',
      content: Array.isArray(m.content)
        ? m.content // already formatted items
        : [{ type: 'input_text', text: String(m.content ?? '') }],
    }));
  }
  // Fallback minimal input (avoids missing parameter)
  return 'Hello!';
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const model = body.model || 'gpt-4o-mini';
  const input = normalizeInput(body);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return new Response('Missing OPENAI_API_KEY', { status: 500 });

  const upstream = await fetch('https://api.openai.com/v1/responses', {
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

  if (!upstream.ok) {
    const text = await upstream.text();
    return new Response(text || 'OpenAI API error', { status: upstream.status });
  }

  // Pass-through stream as SSE
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
