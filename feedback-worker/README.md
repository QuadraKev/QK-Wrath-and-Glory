# Feedback Worker (Cloudflare)

Receives anonymous in-app feedback from the creator/bestiary apps and opens a
GitHub issue in this repo. The GitHub token lives **only** as a Cloudflare secret —
it is never present in the static site.

## How it works

```
Browser modal (/shared/feedback.js)
   → (optional) downscale screenshot to WebP/JPEG in-browser
   → POST JSON to this Worker
       → Turnstile siteverify (anti-spam)
       → (optional) upload screenshot bytes to R2, get public URL
       → GitHub REST: POST /repos/QuadraKev/QK-Wrath-and-Glory/issues
           (image embedded as ![screenshot](r2-url) in the body)
   ← { ok, url, number }
```

The user needs no GitHub account; the Worker authenticates and creates the issue
on their behalf. No token reaches the browser. GitHub's API cannot accept file
attachments, so screenshots are stored in R2 and embedded by URL (GitHub's camo
proxy renders any public HTTPS image).

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
5. **R2 (screenshot uploads)** — optional but required for the image feature:
   - Create an R2 bucket, e.g. `wng-feedback-images`.
   - Enable public access: bucket → Settings → **Public Development URL** (the
     `https://pub-xxxx.r2.dev` URL), or attach a custom domain.
   - Worker → Settings → Bindings → add an **R2 bucket binding** named
     `FEEDBACK_BUCKET` pointing at that bucket.
   - Worker → Settings → Variables → add **plain variable** `R2_PUBLIC_BASE` set
     to the bucket's public base URL (e.g. `https://pub-xxxx.r2.dev`, no trailing
     slash). The Worker stores objects under `feedback/YYYY/MM/<uuid>.<ext>` and
     embeds `${R2_PUBLIC_BASE}/<key>` in the issue.
   - (Optional) add a bucket **lifecycle rule** to auto-delete objects after N days.
   - If `FEEDBACK_BUCKET`/`R2_PUBLIC_BASE` are absent, image uploads fail softly
     and feedback is still filed as text.
6. **Deploy.** The Worker URL and the Turnstile Site key are wired into
   `/shared/feedback.js`.

## Config (top of `worker.js`)

- `REPO` — target repo, `owner/name`.
- `ALLOWED_ORIGINS` — CORS allow-list (the Pages origin + localhost for dev).
- `ALLOWED_IMAGE_TYPES` / `MAX_IMAGE_BYTES` — screenshot type allow-list and size cap.

## Bindings & variables

- `GITHUB_TOKEN` (secret), `TURNSTILE_SECRET` (secret) — required.
- `FEEDBACK_BUCKET` (R2 binding), `R2_PUBLIC_BASE` (plain var) — required only for
  screenshot uploads.

## Rotating the token

Generate a new fine-grained PAT, update the `GITHUB_TOKEN` Worker secret, redeploy.
No front-end change needed.

## Notes

- Anti-spam is Cloudflare Turnstile, verified server-side; the endpoint also enforces
  an origin allow-list and input length limits.
- Issues get a `bug` / `enhancement` label when those labels exist; creation
  automatically retries without labels if they don't.
- Worst case if the Worker URL is abused is bounded to issue creation in this repo
  (and screenshot writes to the R2 bucket) — the token is issues-only and never
  leaves Cloudflare. All submissions are gated by Turnstile before any R2 write.
- Screenshots are downscaled and re-encoded in the browser (which also strips EXIF);
  the Worker re-validates type by magic bytes and enforces a size cap. Stored
  screenshots are publicly readable by URL, the same as the public issues.
