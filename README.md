# Wrath & Glory Tools

Unofficial fan reference tools for the *Wrath & Glory* tabletop RPG — two static
web apps sharing one dataset, hosted from this repo on GitHub Pages.

**Live:** https://quadrakev.github.io/QK-Wrath-and-Glory/

## Components

- **`creator/`** — Character Creator: species, archetype, talents, wargear, ascension, character sheet. → `/creator/`
- **`bestiary/`** — Bestiary & Encounters: browse threats/NPCs and build encounters (initiative, mobs, wound tracking). → `/bestiary/`
- **`index.html`** — landing hub linking to both apps.
- **`data/`** — the single shared game dataset (JSON); both apps read it via `../data/`. The reason this is a monorepo.
- **`shared/`** — front-end widgets used by both apps (the in-app Report Feedback modal).
- **`feedback-worker/`** — a Cloudflare Worker backing the feedback button: it verifies a Cloudflare Turnstile check and opens a GitHub issue. No token lives in the static site. See [`feedback-worker/README.md`](feedback-worker/README.md).

## Tech & local dev

Vanilla JS, no build step, no framework. Serve the repo root with any static server and open
`/creator/` or `/bestiary/` (the apps fetch the shared data via a relative `../data/` path, so
they must be served from the repo root, not opened as files). Pushing to `main` auto-deploys to
GitHub Pages.

---

*Warhammer 40,000, Wrath & Glory, and related marks are property of their respective owners.
This is an unofficial, non-commercial fan project.*
