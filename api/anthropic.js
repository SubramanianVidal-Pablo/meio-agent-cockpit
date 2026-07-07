/**
 * Vercel serverless function — /api/anthropic/[...path]
 *
 * Acts as a server-side proxy to api.anthropic.com.
 * The API key is read from the Vercel environment variable ANTHROPIC_API_KEY
 * and injected here — it is never exposed to the browser.
 *
 * The client calls  POST /api/anthropic/v1/messages  (same path as in dev).
 * This function strips the /api/anthropic prefix and forwards the request.
 */
export const config = {
  runtime: 'edge', // Edge runtime: lowest latency, supports streaming
};

const ANTHROPIC_BASE = 'https://api.anthropic.com';

export default async function handler(req) {
  // Only allow POST (all Anthropic Messages API calls are POST)
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Strip /api/anthropic prefix to get the real Anthropic path (/v1/messages)
  const url  = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/anthropic/, '');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY environment variable is not set' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Forward the request to Anthropic, injecting the key server-side
  const upstream = await fetch(`${ANTHROPIC_BASE}${path}`, {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': req.headers.get('anthropic-version') || '2023-06-01',
    },
    body: req.body, // stream the request body through unchanged
  });

  // Stream the response back to the browser (required for SSE / streaming)
  return new Response(upstream.body, {
    status:  upstream.status,
    headers: {
      'Content-Type':  upstream.headers.get('Content-Type') || 'application/json',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no', // disable nginx buffering for SSE
    },
  });
}
