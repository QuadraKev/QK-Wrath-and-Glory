// wng-feedback — Cloudflare Worker. Receives anonymous feedback, opens a GitHub issue.
// Secrets (set in the Cloudflare dashboard, encrypted): GITHUB_TOKEN, TURNSTILE_SECRET
// No secret is ever sent to the browser. See README.md for setup.

const REPO = 'QuadraKev/QK-Wrath-and-Glory';
const ALLOWED_ORIGINS = [
  'https://quadrakev.github.io',
  'http://localhost:8137', // local dev
];
const MAX_TITLE = 150;
const MAX_BODY = 5000;

function corsHeaders(origin) {
  // Explicit deny: only echo Allow-Origin for allow-listed origins; others get none.
  if (!ALLOWED_ORIGINS.includes(origin)) return { 'Vary': 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

function sanitize(s) {
  return s.toString().replace(/[\r\n]+/g, ' ').replace(/[`*_<>]/g, '').slice(0, 300);
}

async function createIssue(env, payload) {
  return fetch(`https://api.github.com/repos/${REPO}/issues`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'wng-feedback-worker',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405, origin);
    if (!ALLOWED_ORIGINS.includes(origin)) return json({ ok: false, error: 'Forbidden origin' }, 403, origin);

    let data;
    try { data = await request.json(); }
    catch { return json({ ok: false, error: 'Invalid JSON' }, 400, origin); }

    const type = data.type === 'bug' ? 'bug' : data.type === 'feature' ? 'feature' : null;
    const title = (data.title || '').toString().trim();
    const details = (data.details || '').toString().trim();
    const turnstileToken = (data.turnstileToken || '').toString();

    if (!type) return json({ ok: false, error: 'Invalid type' }, 400, origin);
    if (!title) return json({ ok: false, error: 'Title is required' }, 400, origin);
    if (title.length > MAX_TITLE) return json({ ok: false, error: 'Title too long' }, 400, origin);
    if (details.length > MAX_BODY) return json({ ok: false, error: 'Details too long' }, 400, origin);

    // Anti-spam: verify Turnstile server-side
    const ts = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET,
        response: turnstileToken,
        remoteip: request.headers.get('CF-Connecting-IP') || '',
      }),
    });
    const tsResult = await ts.json();
    if (!tsResult.success) return json({ ok: false, error: 'Spam check failed' }, 403, origin);

    // Build issue
    const app = ['creator', 'bestiary'].includes(data.app) ? data.app : 'unknown';
    const context = [
      '', '---', '*Submitted via the in-app feedback form.*',
      `- App: ${app}`,
      data.page ? `- Section: ${sanitize(data.page)}` : null,
      data.version ? `- Version: ${sanitize(data.version)}` : null,
      data.userAgent ? `- Browser: ${sanitize(data.userAgent)}` : null,
    ].filter(Boolean).join('\n');

    const issue = {
      title: `[${type === 'bug' ? 'Bug' : 'Feature'}] ${title}`,
      body: `${details || '(no details provided)'}\n${context}`,
      labels: [type === 'bug' ? 'bug' : 'enhancement'],
    };

    let gh = await createIssue(env, issue);
    if (gh.status === 422) { // a label may not exist — retry without labels
      const { labels, ...noLabels } = issue;
      gh = await createIssue(env, noLabels);
    }
    if (!gh.ok) return json({ ok: false, error: 'GitHub API error', status: gh.status }, 502, origin);

    const created = await gh.json();
    return json({ ok: true, url: created.html_url, number: created.number }, 201, origin);
  },
};
