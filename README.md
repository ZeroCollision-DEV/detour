# detour

The short way around. Paste a locked link, get the real destination — no surveys, no countdown, no ads.

## What it handles

- Linkvertise (new `/access/` + `/{id}` formats, resolved via its GraphQL API)
- AdFly, AdFoc.us, AdShrink, shorte.st, Sub2Unlock, Sub2Get, SocialUnlock, AdMaven, Rekonise, LootLabs, Work.ink
- Anything else that hides a link in page source (generic base64 + JSON scan)

## How it works

Runs entirely in the browser. Known providers get a dedicated resolver; everything else falls back to a source scan (direct URLs, `atob(...)`, base64 literals, LZString, `ysmm`, common JSON keys).

## The proxy problem

Browsers can't fetch other domains without CORS, and these sites don't send it — so Detour routes through a CORS proxy. Free public proxies are flaky and keep dying. For dependable results, deploy the included worker and point Detour at it (Settings -> custom proxy).

### Deploy the worker (free, Cloudflare Workers)

```
npm i -g wrangler
wrangler login
wrangler deploy worker.js
```

Then in Detour -> Settings, set custom proxy to:

```
https://<your-worker>.workers.dev/?url={url}
```

## Run locally

No build step:

```
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Deploy

Any static host — GitHub Pages, Cloudflare Pages, Netlify, Vercel. For GitHub Pages, push `main` and enable Pages (source: branch, `/` root).
