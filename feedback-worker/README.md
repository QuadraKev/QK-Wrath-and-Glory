# Feedback Worker (Cloudflare)

Receives anonymous in-app feedback from the creator/bestiary apps and opens a
GitHub issue in this repo. The GitHub token lives **only** as a Cloudflare secret —
it is never present in the static site.

## How it works

```
Browser modal (/shared/feedback.js)
   → POST JSON to this Worker
       → Turnstile siteverify (anti-spam)
       → GitHub REST: POST /repos/QuadraKev/QK-Wrath-and-Glory/issues
   ← { ok, url, number }
```

The user needs no GitHub account; the Worker authenticates and creates the issue
on their behalf. No token reaches the browser.

## One-time setup

1. **GitHub token** — a fine-grained PAT scoped to **this repo only**, permission
   **Issues: Read and write** (plus the required Metadata: read). Give it a short
   expiry and rotate when it lapses.
2. **Cloudflare Worker** — create a Worker (e.g. `wng-feedback`) and paste `worker.js`.
3. **Secrets** (Worker → Settings → Variables and Secrets, add as encrypted **Secret**):
   - `GITHUB_TOKEN` — the PAT from step 1
   - `TURNSTILE_SECRET` — from step 4
4. **Turnstile** — create a Managed widget for domain `quadrakev.github.io`
   (add `localhost` for local testing). Put its **Secret key** in `TURNSTILE_SECRET`;
   the **Site key** is public and is configured in `/shared/feedback.js`.
5. **Deploy.** The Worker URL and the Turnstile Site key are wired into
   `/shared/feedback.js`.

## Config (top of `worker.js`)

- `REPO` — target repo, `owner/name`.
- `ALLOWED_ORIGINS` — CORS allow-list (the Pages origin + localhost for dev).

## Rotating the token

Generate a new fine-grained PAT, update the `GITHUB_TOKEN` Worker secret, redeploy.
No front-end change needed.

## Notes

- Anti-spam is Cloudflare Turnstile, verified server-side; the endpoint also enforces
  an origin allow-list and input length limits.
- Issues get a `bug` / `enhancement` label when those labels exist; creation
  automatically retries without labels if they don't.
- Worst case if the Worker URL is abused is bounded to issue creation in this repo —
  the token is issues-only and never leaves Cloudflare.
