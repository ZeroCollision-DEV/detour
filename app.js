'use strict';

const PROXIES = [
  { name: 'allorigins', build: (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u) },
  { name: 'codetabs', build: (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u) },
  { name: 'corsproxy.io', build: (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u) },
];

const SHORTENER_HOSTS = [
  'linkvertise.com', 'link-to.net', 'linkvertise.download', 'link-hub.net', 'link-center.net',
  'linkvertise.io', 'linktarget.net', 'link-protector.com', 'up-to-down.net',
  'work.ink', 'workink.me', 'wev.ru', 'workin.click',
  'lootlabs.gg', 'loot-link.com', 'lootdest.org', 'lootdest.com', 'loot-labs.com',
  'lootlabs.com', 'lootdest.info',
  'rekonise.com', 'rekonise.io',
  'sub2unlock.net', 'sub2unlock.com',
];

const BLOCK_HOSTS = new Set([
  ...SHORTENER_HOSTS,
  'w3.org', 'schema.org', 'googleapis.com', 'gstatic.com', 'google.com', 'google-analytics.com',
  'googletagmanager.com', 'googlesyndication.com', 'doubleclick.net', 'facebook.net', 'facebook.com',
  'jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com', 'cloudflare.com', 'bootstrapcdn.com',
  'jquery.com', 'cloudfront.net', 'akamaihd.net',
]);

function isBlocked(u) {
  if (!/^https?:\/\//i.test(u)) return true;
  let url;
  try { url = new URL(u); } catch { return true; }
  const host = url.hostname.toLowerCase();
  if (!host) return true;
  for (const h of BLOCK_HOSTS) {
    if (host === h || host.endsWith('.' + h)) return true;
  }
  const last = (url.pathname.split('/').pop() || '').toLowerCase();
  return /\.(js|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|eot|json|xml|txt|map|wasm|mp4|webm|mp3)$/.test(last);
}

function b64d(s) {
  try {
    const bin = atob(s.replace(/\s+/g, ''));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch { return null; }
}

function cleanUrl(u) {
  u = u.replace(/\\\//g, '/');
  u = u.replace(/[.,;:'")\]}<>|]+$/, '');
  return u.trim();
}

function collect(urls, out) {
  for (const c of urls) {
    const u = cleanUrl(c);
    if (!u || u.length > 2048) continue;
    if (!isBlocked(u)) out.add(u);
  }
  return out;
}

function findUrlsIn(obj, out) {
  if (obj == null) return;
  if (typeof obj === 'string') {
    if (/^https?:\/\//i.test(obj)) collect([obj], out);
    return;
  }
  if (Array.isArray(obj)) { obj.forEach((v) => findUrlsIn(v, out)); return; }
  if (typeof obj === 'object') { for (const k in obj) findUrlsIn(obj[k], out); }
}

function walkJson(str, out) {
  try { findUrlsIn(JSON.parse(str), out); } catch {}
}

function extractUrls(text, baseRaw) {
  const out = new Set();
  if (!text) return [...out];

  collect([...text.matchAll(/(https?:\/\/[^\s"'<>\\]+)/gi)].map((m) => m[1]), out);

  for (const m of text.matchAll(/atob\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/gi)) {
    const d = b64d(m[1]);
    if (d) { collect([d], out); walkJson(d, out); }
  }

  for (const m of text.matchAll(/["'`]([A-Za-z0-9+/]{24,}={0,2})["'`]/g)) {
    const d = b64d(m[1]);
    if (!d) continue;
    collect([d], out);
    walkJson(d, out);
  }

  if (window.LZString && /LZString|compressTo/i.test(text)) {
    for (const m of text.matchAll(/["'`]([A-Za-z0-9+/]{24,}={0,2})["'`]/g)) {
      let d = null;
      try { d = window.LZString.decompressFromBase64(m[1]); } catch {}
      if (!d) { try { d = window.LZString.decompressFromUTF16(m[1]); } catch {} }
      if (d && /https?:\/\//.test(d)) collect([d], out);
    }
  }

  for (const m of text.matchAll(/"(?:url|link|target|destination|redirect|redirect_url|finalUrl|final_url|href|realUrl)"\s*:\s*"([^"]+)"/gi)) {
    collect([m[1]], out);
  }

  return [...out];
}

async function fetchText(raw, onStep) {
  let lastErr = new Error('no proxy available');
  for (const p of PROXIES) {
    if (onStep) onStep('trying ' + p.name);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(p.build(raw), { signal: ctrl.signal, redirect: 'follow' });
      clearTimeout(t);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (onStep) onStep('via ' + p.name);
      return { text, proxy: p.name };
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

function linkvertiseId(raw) {
  const segs = new URL(raw).pathname.split('/').filter(Boolean);
  const sub = new Set(['dynamic', 'static', 'download']);
  const num = segs.find((s) => /^\d+$/.test(s));
  if (num) return num;
  return segs.find((s) => !sub.has(s)) || '';
}

const PROVIDERS = [
  {
    name: 'Linkvertise',
    hosts: ['linkvertise.com', 'link-to.net', 'linkvertise.download', 'link-hub.net',
      'link-center.net', 'linkvertise.io', 'linktarget.net', 'link-protector.com'],
    async resolve(raw, ctx) {
      const id = linkvertiseId(raw);
      if (id) {
        for (const ep of [
          'https://publisher.linkvertise.com/api/v1/redirect/link/' + id,
          'https://publisher.linkvertise.com/api/v1/redirect/link/' + id + '?json=true',
        ]) {
          try {
            const { text } = await ctx.fetchText(ep);
            const out = new Set();
            try { findUrlsIn(JSON.parse(text), out); }
            catch { extractUrls(text, raw).forEach((u) => out.add(u)); }
            if (out.size) return [...out];
          } catch {}
        }
      }
      const { text } = await ctx.fetchText(raw);
      return extractUrls(text, raw);
    },
  },
  {
    name: 'Rekonise',
    hosts: ['rekonise.com', 'rekonise.io'],
    async resolve(raw, ctx) {
      const id = new URL(raw).pathname.split('/').filter(Boolean)[0];
      if (id) {
        try {
          const { text } = await ctx.fetchText('https://api.rekonise.com/unlocks/' + id);
          const out = new Set();
          findUrlsIn(JSON.parse(text), out);
          if (out.size) return [...out];
        } catch {}
      }
      const { text } = await ctx.fetchText(raw);
      return extractUrls(text, raw);
    },
  },
  {
    name: 'Work.ink',
    hosts: ['work.ink', 'workink.me', 'wev.ru', 'workin.click'],
    async resolve(raw, ctx) { const { text } = await ctx.fetchText(raw); return extractUrls(text, raw); },
  },
  {
    name: 'LootLabs',
    hosts: ['lootlabs.gg', 'loot-link.com', 'lootdest.org', 'lootdest.com', 'loot-labs.com', 'lootlabs.com', 'lootdest.info'],
    async resolve(raw, ctx) { const { text } = await ctx.fetchText(raw); return extractUrls(text, raw); },
  },
  {
    name: 'Sub2Unlock',
    hosts: ['sub2unlock.net', 'sub2unlock.com'],
    async resolve(raw, ctx) { const { text } = await ctx.fetchText(raw); return extractUrls(text, raw); },
  },
];

function detectProvider(raw) {
  const host = new URL(raw).hostname.toLowerCase();
  return PROVIDERS.find((p) => p.hosts.some((h) => host === h || host.endsWith('.' + h)));
}

function normalize(input) {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  return s;
}

async function detour(rawInput) {
  const steps = [];
  const step = (s) => { steps.push(s); stepLive(s); };
  const raw = normalize(rawInput);
  const ctx = { fetchText: (u) => fetchText(u, step) };

  const provider = detectProvider(raw);
  let candidates = [];

  if (provider) {
    step('detected ' + provider.name);
    try { candidates = await provider.resolve(raw, ctx); }
    catch (e) { step('provider error: ' + e.message); }
  } else {
    step('no known provider');
  }

  if (!candidates.length) {
    step('falling back to generic page scan');
    try {
      const { text } = await ctx.fetchText(raw);
      candidates = extractUrls(text, raw);
    } catch (e) { step('scan error: ' + e.message); }
  }

  const seen = new Set();
  candidates = candidates.filter((u) => {
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });

  return { candidates, steps, provider: provider ? provider.name : 'generic' };
}

/* ---------------- UI ---------------- */

const form = document.getElementById('form');
const field = document.getElementById('field');
const input = document.getElementById('url');
const goBtn = document.getElementById('go');
const goLabel = document.getElementById('goLabel');
const statusEl = document.getElementById('status');
const statusText = document.getElementById('statusText');
const timerEl = document.getElementById('timer');
const progressWrap = document.getElementById('progressWrap');
const progressBar = document.getElementById('progressBar');
const resultEl = document.getElementById('result');
const resultUrl = document.getElementById('resultUrl');
const copyBtn = document.getElementById('copy');
const openA = document.getElementById('open');
const altsEl = document.getElementById('alts');
const logWrap = document.getElementById('logWrap');
const logEl = document.getElementById('log');

const BASELINE = {
  'Linkvertise': 15,
  'Rekonise': 12,
  'Work.ink': 8,
  'LootLabs': 8,
  'Sub2Unlock': 8,
  'generic': 8,
};

let timerHandle = null;
let elapsed = 0;
let totalEstimate = 8;

function startTimer(provider) {
  stopTimer();
  elapsed = 0;
  totalEstimate = BASELINE[provider] || 8;
  timerEl.textContent = '~' + totalEstimate + 's';
  progressBar.style.width = '0%';
  timerHandle = setInterval(() => {
    elapsed++;
    const remaining = Math.max(0, totalEstimate - elapsed);
    if (remaining > 0) {
      timerEl.textContent = '~' + remaining + 's';
      progressBar.style.width = Math.min(96, (elapsed / totalEstimate) * 100) + '%';
    } else {
      timerEl.textContent = 'still working...';
      progressWrap.classList.add('indeterminate');
    }
  }, 1000);
}

function stopTimer() {
  if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
  timerEl.textContent = '';
  progressWrap.classList.remove('indeterminate');
  progressBar.style.width = '0%';
}

function stepLive(text) {
  statusText.textContent = text;
}

function setLoading(on) {
  goBtn.disabled = on;
  goBtn.classList.toggle('loading', on);
  goLabel.textContent = on ? 'Detouring...' : 'Detour';
  if (on) {
    statusEl.hidden = false;
    statusEl.classList.remove('error');
    statusEl.classList.add('loading');
    statusText.textContent = 'detecting provider';
  }
}

function hideResult() { resultEl.hidden = true; }

function showStatus(msg, isError) {
  statusEl.hidden = false;
  statusEl.classList.toggle('error', !!isError);
  statusEl.classList.remove('loading');
  statusText.textContent = msg;
}

function renderResult(r) {
  logWrap.hidden = false;
  logEl.innerHTML = '';
  r.steps.forEach((s) => {
    const li = document.createElement('li');
    li.textContent = s;
    logEl.appendChild(li);
  });

  if (!r.candidates.length) {
    showStatus('couldn\'t find a destination. the site may have changed its format — try again later.', true);
    hideResult();
    return;
  }

  const primary = r.candidates[0];
  statusEl.hidden = true;
  resultEl.hidden = false;
  resultUrl.textContent = primary;
  openA.href = primary;

  const rest = r.candidates.slice(1);
  if (rest.length) {
    altsEl.hidden = false;
    const label = altsEl.querySelector('.alts-label');
    altsEl.innerHTML = '';
    altsEl.appendChild(label);
    rest.slice(0, 6).forEach((u) => {
      const a = document.createElement('a');
      a.href = u;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = u;
      altsEl.appendChild(a);
    });
  } else {
    altsEl.hidden = true;
  }
}

function flashCopied() {
  copyBtn.classList.add('copied');
  const o = copyBtn.textContent;
  copyBtn.textContent = 'Copied';
  setTimeout(() => {
    copyBtn.textContent = o;
    copyBtn.classList.remove('copied');
  }, 1200);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const raw = input.value.trim();
  if (!raw) {
    field.classList.remove('shake');
    void field.offsetWidth;
    field.classList.add('shake');
    input.focus();
    return;
  }
  hideResult();
  setLoading(true);
  const provider = detectProvider(normalize(raw));
  startTimer(provider ? provider.name : 'generic');
  try {
    const r = await detour(raw);
    renderResult(r);
  } catch (err) {
    showStatus('something broke: ' + err.message, true);
    hideResult();
  } finally {
    setLoading(false);
    stopTimer();
  }
});

copyBtn.addEventListener('click', async () => {
  const u = resultUrl.textContent;
  if (!u) return;
  try {
    await navigator.clipboard.writeText(u);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = u;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  flashCopied();
});

input.focus();
