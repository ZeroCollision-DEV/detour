# detour

The short way around. Paste a locked link, get the real destination — no surveys, no countdown, no ads.

## What it handles

- Linkvertise (via the publisher API, then page scan)
- Work.ink
- LootLabs (`lootlabs.gg` / `loot-link.com` / `lootdest.*`)
- Rekonise
- Sub2Unlock
- Anything else that hides a link in page source (generic base64 + JSON scan)

## How it works

Detour runs entirely in your browser. It fetches the locked page through a public CORS proxy, then scans the response for the real destination using a few strategies: direct URLs, `atob(...)` blobs, raw base64 string literals, LZString-compressed payloads, and common JSON keys (`target`, `url`, `destination`, ...). Known providers get a dedicated resolver (Linkvertise's publisher API leaks the target; Rekonise's unlock API too) with the generic scan as fallback.

## Run locally

No build step. Serve the folder and open it:

```
python -m http.server 8080
```

Then go to `http://localhost:8080`. Or just open `index.html` directly.

## Deploy

Any static host works — GitHub Pages, Cloudflare Pages, Netlify, Vercel. For GitHub Pages, push the `main` branch and enable Pages (source: branch, `/` root).

## Notes

- These services change their formats and endpoints regularly. Every extractor is isolated in `app.js` under `PROVIDERS` so it's a one-spot fix when one breaks.
- Public CORS proxies are the weak link — they're free, so they can be slow or rate-limited. For something reliable, point a Cloudflare Worker at the same logic and add it to `PROXIES` in `app.js`.
