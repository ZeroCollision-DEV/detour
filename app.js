'use strict';

const DEFAULT_PROXIES = [
  { name: 'cors.eu.org', build: (u) => 'https://cors.eu.org/' + u },
  { name: 'allorigins', build: (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u) },
  { name: 'codetabs', build: (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u) },
];

let PROXIES = [...DEFAULT_PROXIES];

const LV_GRAPHQL = 'https://publisher.linkvertise.com/graphql';

const LV_CONTENT_QUERY = 'query getContent($identifier: PublicLinkIdentificationInput!, $task_args: TaskArgument) { getContent(input: $identifier, task_args: $task_args) { __typename ... on DetailPageTargetData { type url paste } ... on ContentAccessTaskSet { __typename tasks { __typename id } } } }';

const LV_LINK_QUERY = 'query getLinkByIdentifier($identifier: PublicLinkIdentificationInput!) { linkByIdentifier(linkIdentificationInput: $identifier) { url target_type target_host title } }';

const EXAMPLE_URL = 'https://linkvertise.com/329510/test-it-out/1';

const PROVIDERS = [
  {
    name: 'Linkvertise',
    hosts: ['linkvertise.com', 'link-to.net', 'linkvertise.download', 'link-hub.net',
      'link-center.net', 'linkvertise.io', 'linktarget.net', 'link-protector.com',
      'up-to-down.net', 'linkvertise.net', 'linkvertise.biz', 'linkvertise.gg'],
    resolve: linkvertiseResolve,
  },
  {
    name: 'AdFly',
    hosts: ['adf.ly', 'j.gs', 'q.gs', 'u.bb', 'qr.net', 'ay.gy', 'atominik.com',
      'shrink-service.it', 'microify.com', 'boost.ink'],
    resolve: adflyResolve,
  },
  { name: 'AdFoc.us', hosts: ['adfoc.us', 'adfocus.io'], resolve: scanResolve },
  { name: 'AdShrink', hosts: ['adshrink.it', 'adshort.co', 'adshrink.org'], resolve: scanResolve },
  {
    name: 'shorte.st',
    hosts: ['shorte.st', 'sh.st', 'linkshrink.net', 'shink.me', 'ceesty.com', 'clk.sh',
      'corneey.com', 'destyy.com', 'festyy.com', 'gestyy.com'],
    resolve: scanResolve,
  },
  { name: 'Sub2Unlock', hosts: ['sub2unlock.net', 'sub2unlock.com', 'sub2unlock.live', 'sub2unlock.xyz'], resolve: scanResolve },
  { name: 'Sub2Get', hosts: ['sub2get.com', 'sub2get.net'], resolve: scanResolve },
  { name: 'SocialUnlock', hosts: ['socialunlock.com', 'social-unlock.com', 'socialunlocks.com'], resolve: scanResolve },
  { name: 'AdMaven', hosts: ['admaven.com', 'ad-maven.com'], resolve: scanResolve },
  { name: 'Rekonise', hosts: ['rekonise.com', 'rekonise.io'], resolve: rekoniseResolve },
  {
    name: 'LootLabs',
    hosts: ['lootlabs.gg', 'loot-link.com', 'lootdest.org', 'lootdest.com', 'loot-labs.com',
      'lootlabs.com', 'lootdest.info'],
    resolve: scanResolve,
  },
  { name: 'Work.ink', hosts: ['work.ink', 'workink.me', 'wev.ru', 'workin.click'], resolve: scanResolve },
];

const SHORTENER_HOSTS = [];
for (const p of PROVIDERS) for (const h of p.hosts) SHORTENER_HOSTS.push(h);

const BLOCK_HOSTS = new Set([
  ...SHORTENER_HOSTS,
  'w3.org', 'schema.org', 'googleapis.com', 'gstatic.com', 'google.com', 'google-analytics.com',
  'googletagmanager.com', 'googlesyndication.com', 'doubleclick.net', 'facebook.net', 'facebook.com',
  'jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com', 'cloudflare.com', 'bootstrapcdn.com',
  'jquery.com', 'cloudfront.net', 'akamaihd.net', 'taboola.com', 'api.taboola.com', 'cdn.taboola.com',
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
    let d = b64d(m[1]);
    if (!d) continue;
    collect([d], out);
    walkJson(d, out);
    if (/^[A-Za-z0-9+/]{16,}={0,2}$/.test(d)) {
      const d2 = b64d(d);
      if (d2) { collect([d2], out); walkJson(d2, out); }
    }
  }

  for (const m of text.matchAll(/ysmm\s*=\s*["'`]([^"'`]+)["'`]/gi)) {
    let d = b64d(m[1]);
    if (d && !/^https?:\/\//i.test(d)) d = b64d(d);
    if (d) { collect([d], out); walkJson(d, out); }
  }

  for (const m of text.matchAll(/(?:data-url|data-href|data-link)\s*=\s*["']([^"']+)["']/gi)) {
    collect([m[1]], out);
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

/* -------- Linkvertise (GraphQL) -------- */

function lvGet(op, query, variables) {
  const p = new URLSearchParams();
  p.set('query', query);
  p.set('variables', JSON.stringify(variables));
  p.set('operationName', op);
  return LV_GRAPHQL + '?' + p.toString();
}

async function lvContent(ctx, identifier) {
  const { text } = await ctx.fetchText(lvGet('getContent', LV_CONTENT_QUERY, { identifier }));
  const j = JSON.parse(text);
  const node = j && j.data && j.data.getContent;
  if (!node || node.__typename === 'ContentAccessTaskSet') return { urls: [], gated: node && node.__typename === 'ContentAccessTaskSet' };
  const urls = [];
  if (node.url) urls.push(node.url);
  if (node.paste) urls.push(node.paste);
  return { urls, gated: false };
}

async function lvHost(ctx, identifier) {
  const { text } = await ctx.fetchText(lvGet('getLinkByIdentifier', LV_LINK_QUERY, { identifier }));
  const j = JSON.parse(text);
  return (j && j.data && j.data.linkByIdentifier && j.data.linkByIdentifier.target_host) || '';
}

function linkvertiseIdentifiers(raw) {
  const u = new URL(raw);
  let path = u.pathname.replace(/^\/access(?=\/|$)/, '');
  const segs = path.split('/').filter(Boolean);
  const r = u.searchParams.get('r');
  const v = u.searchParams.get('v');
  const origin = u.searchParams.get('link_origin');
  const ids = [];

  if (r && segs.length) {
    const h = { user_id: segs[0], hash: r, originates_from_adfly: origin === 'adfly' };
    if (v) h.version = v;
    ids.push({ userIdAndHash: h });
  } else if (segs.length === 1) {
    ids.push({ id: { id: segs[0] } });
    ids.push({ userIdAndUrl: { url: segs[0], user_id: segs[0] } });
  } else {
    ids.push({ userIdAndUrl: { url: segs[1], user_id: segs[0] } });
    const rest = segs.slice(1).join('/');
    if (rest !== segs[1]) ids.push({ userIdAndUrl: { url: rest, user_id: segs[0] } });
  }
  return ids;
}

async function linkvertiseResolve(raw, ctx) {
  const step = ctx.step;
  const identifiers = linkvertiseIdentifiers(raw);
  let gated = false;

  for (const identifier of identifiers) {
    try {
      const { urls, gated: g } = await lvContent(ctx, identifier);
      if (urls.length) return urls;
      if (g) gated = true;
    } catch {}
  }

  if (gated) step('link is task-gated (wait/ad/premium)');
  for (const identifier of identifiers) {
    try {
      const host = await lvHost(ctx, identifier);
      if (host) { step('recovered destination host: ' + host); return ['https://' + host]; }
    } catch {}
  }
  return [];
}

/* -------- other resolvers -------- */

async function scanResolve(raw, ctx) {
  const { text } = await ctx.fetchText(raw);
  return extractUrls(text, raw);
}

async function adflyResolve(raw, ctx) {
  const { text } = await ctx.fetchText(raw);
  const out = extractUrls(text, raw);
  const m = text.match(/ysmm\s*=\s*["']([^"']+)["']/);
  if (m) {
    let d = b64d(m[1]);
    if (d && !/^https?:\/\//i.test(d)) d = b64d(d);
    if (d && /^https?:\/\//i.test(d) && !isBlocked(d)) out.unshift(cleanUrl(d));
  }
  return out;
}

async function rekoniseResolve(raw, ctx) {
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
}

/* -------- detection + core -------- */

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
  const ctx = { fetchText: (u) => fetchText(u, step), step };

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
const pasteBtn = document.getElementById('pasteBtn');
const goBtn = document.getElementById('go');
const goLabel = document.getElementById('goLabel');
const exampleBtn = document.getElementById('exampleBtn');
const themeToggle = document.getElementById('themeToggle');
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
const proxyInput = document.getElementById('proxyInput');
const proxySave = document.getElementById('proxySave');

const BASELINE = {
  'Linkvertise': 15,
  'AdFly': 8,
  'Rekonise': 12,
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

function applyTheme(t) {
  if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
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

pasteBtn.addEventListener('click', async () => {
  try {
    const t = await navigator.clipboard.readText();
    if (t) { input.value = t.trim(); input.focus(); }
    else { input.focus(); showStatus('clipboard is empty — press Ctrl+V instead', false); }
  } catch {
    input.focus();
    showStatus('clipboard access blocked by the browser — press Ctrl+V instead', false);
  }
});

exampleBtn.addEventListener('click', () => {
  input.value = EXAMPLE_URL;
  input.focus();
});

const savedTheme = localStorage.getItem('detour-theme');
if (savedTheme) applyTheme(savedTheme);
themeToggle.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  applyTheme(next);
  localStorage.setItem('detour-theme', next);
});

function loadCustomProxy() {
  const tpl = localStorage.getItem('detour-proxy');
  if (tpl) {
    proxyInput.value = tpl;
    PROXIES = [{ name: 'custom', build: (u) => tpl.replace('{url}', encodeURIComponent(u)) }, ...DEFAULT_PROXIES];
  }
}
loadCustomProxy();

proxySave.addEventListener('click', () => {
  const tpl = proxyInput.value.trim();
  if (tpl) {
    localStorage.setItem('detour-proxy', tpl);
    PROXIES = [{ name: 'custom', build: (u) => tpl.replace('{url}', encodeURIComponent(u)) }, ...DEFAULT_PROXIES];
    showStatus('custom proxy saved', false);
  } else {
    localStorage.removeItem('detour-proxy');
    PROXIES = [...DEFAULT_PROXIES];
    showStatus('custom proxy cleared', false);
  }
});

input.focus();
