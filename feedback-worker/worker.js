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
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // server cap; the client targets ~3 MB
const IMAGE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

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

function decodeBase64(b64) {
  // Strip a data: URL prefix if one slipped through.
  const comma = b64.indexOf(',');
  const raw = (comma >= 0 && b64.slice(0, comma).includes('base64')) ? b64.slice(comma + 1) : b64;
  const bin = atob(raw);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Identify an image by its magic bytes so a forged content-type can't smuggle
// non-image content into the bucket.
function sniffImageType(b) {
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

// Upload a screenshot to R2 and return its public URL. Throws on any problem so
// the caller can degrade to a text-only issue.
async function uploadImage(env, imageBase64, declaredType) {
  if (!env.FEEDBACK_BUCKET || !env.R2_PUBLIC_BASE) throw new Error('R2 not configured');
  if (!ALLOWED_IMAGE_TYPES.includes(declaredType)) throw new Error('Unsupported image type');
  const bytes = decodeBase64(imageBase64);
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new Error('Bad image size');
  const sniffed = sniffImageType(bytes);
  if (!sniffed || sniffed !== declaredType) throw new Error('Image content does not match type');

  const now = new Date();
  const key = `feedback/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${IMAGE_EXT[sniffed]}`;
  await env.FEEDBACK_BUCKET.put(key, bytes, { httpMetadata: { contentType: sniffed } });
  return `${env.R2_PUBLIC_BASE.replace(/\/+$/, '')}/${key}`;
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

    // Optional screenshot -> R2, embedded in the issue body. Non-fatal: if the
    // upload fails we still file the feedback so nothing is lost.
    let imageMarkdown = '';
    if (data.imageBase64) {
      try {
        const imageUrl = await uploadImage(env, String(data.imageBase64), String(data.imageContentType || ''));
        imageMarkdown = `\n\n![screenshot](${imageUrl})`;
      } catch {
        imageMarkdown = '\n\n*(screenshot upload failed)*';
      }
    }

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
      body: `${details || '(no details provided)'}${imageMarkdown}\n${context}`,
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
