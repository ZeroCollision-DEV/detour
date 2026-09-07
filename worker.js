// Detour proxy worker — deploy with Cloudflare Workers (free tier).
// Usage: https://<your-worker>.workers.dev/?url=<target>
// In Detour -> Settings -> custom proxy: https://<your-worker>.workers.dev/?url={url}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors() });
    }

    const url = new URL(request.url);
    let target = url.searchParams.get('url');
    if (!target) {
      return new Response('missing ?url=', { status: 400, headers: cors() });
    }
    if (!/^https?:\/\//i.test(target)) target = 'https://' + target;

    const init = {
      method: request.method,
      redirect: 'follow',
      headers: {
        'User-Agent': request.headers.get('User-Agent') || UA,
        'Accept': request.headers.get('Accept') || '*/*',
        'Accept-Language': request.headers.get('Accept-Language') || 'en-US,en;q=0.9',
      },
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = await request.text();
      init.headers['Content-Type'] = request.headers.get('Content-Type') || 'application/json';
    }

    try {
      const upstream = await fetch(target, init);
      const body = await upstream.text();
      const headers = cors();
      const ct = upstream.headers.get('Content-Type');
      if (ct) headers['Content-Type'] = ct;
      return new Response(body, { status: upstream.status, headers });
    } catch (e) {
      return new Response('proxy error: ' + e.message, { status: 502, headers: cors() });
    }
  },
};
