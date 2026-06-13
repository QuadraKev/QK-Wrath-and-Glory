# Wrath & Glory Monorepo — Design Spec

**Date:** 2026-06-13
**Status:** Approved (pending spec review)

## Goal

Merge the two separate web apps — `wrath-and-glory-creator-web` (character creator) and
`wrath-and-glory-bestiary-web` (threat/encounter reference) — into a single new monorepo
with **one shared data source**, eliminating the two-source data-sync problem, and serving
**both apps as two sites from the one repo**. Also collapses the two `CLAUDE.md` files into one.

## Decisions (locked)

1. **New repo `QK-Wrath-and-Glory`** — https://github.com/QuadraKev/QK-Wrath-and-Glory,
   created **manually by the user under their main GitHub account** (DONE: empty repo,
   default branch `main`, public; the QuadraKev-bot collaborator invite has been accepted,
   write access confirmed). Claude populates and pushes into it using the QuadraKev-bot PAT
   (`$env:GH_TOKEN`), commits authored as
   `QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>`.
2. **Fresh start** — single initial commit of the assembled current state (no history merge).
3. **Old repos stay live and untouched** — no archiving, no redirect stubs. They remain a
   stable, fully-synced snapshot so users can migrate at their own pace. All future iteration
   happens in the monorepo. (Old-repo retirement is a deliberate later step, out of scope here.)
4. **Hosting:** GitHub Pages "deploy from Actions" (uploads repo root). Subpath URLs
   (repo-name case preserved in the path):
   - `quadrakev.github.io/QK-Wrath-and-Glory/` → landing page
   - `quadrakev.github.io/QK-Wrath-and-Glory/creator/` → creator app
   - `quadrakev.github.io/QK-Wrath-and-Glory/bestiary/` → bestiary app
5. **Data sharing:** one real `/data/` dir at repo root; each app's `js/web-api.js` fetches
   `../data/…` instead of `data/…`. No build step, no copies, no symlinks.
6. **Scope is narrow (YAGNI):** unify data + CLAUDE.md + structure + deploy only. App code
   (`css/`, `js/`, `tabs/`) stays per-app — no code merge. Electron wrappers, the old repos,
   and the data *content* (already reconciled and byte-identical) are untouched.

## Architecture

### Directory layout

```
QK-Wrath-and-Glory/
├── CLAUDE.md                     # single unified doc (both apps + shared workflow rules)
├── STYLE_GUIDE.md                # shared style guide (moved in from the projects root)
├── index.html                    # landing page → links to creator/ and bestiary/
├── robots.txt                    # site-wide
├── data/                         # SINGLE source of truth — union of all data files
│   ├── archetypes.json           #  ┐
│   ├── armor.json                #  │
│   ├── ascension-packages.json   #  │
│   ├── equipment.json            #  │ 11 shared files (already byte-identical
│   ├── glossary.json             #  │ between the two old apps)
│   ├── injuries-corruption.json  #  │
│   ├── psychic-powers.json       #  │
│   ├── species.json              #  │
│   ├── talents.json              #  │
│   ├── weapon-upgrades.json      #  │
│   ├── weapons.json              #  ┘
│   ├── backgrounds.json          # creator-only
│   ├── keyword-categories.json   # creator-only
│   ├── threats.json              # bestiary-only
│   └── threat-weapons.json       # bestiary-only
├── creator/
│   ├── index.html
│   ├── css/  js/  tabs/
│   └── robots.txt
├── bestiary/
│   ├── index.html
│   ├── css/  js/  tabs/
│   └── robots.txt
└── .github/
    └── workflows/
        └── deploy.yml            # Pages deploy: upload-pages-artifact path: .
```

### Components & responsibilities

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| `data/` | Single canonical store of all game data (shared + per-app files) | nothing |
| `creator/` | Character-creator SPA (vanilla JS global-object modules) | `../data/` |
| `bestiary/` | Threat/encounter SPA | `../data/` |
| `index.html` | Landing page; two links | nothing |
| `deploy.yml` | Build-free Pages deploy of the whole repo | GitHub Pages |
| `CLAUDE.md` | One project doc covering both apps + shared conventions | — |

### Data flow

1. App boots → `DataLoader.loadAll()` → `window.api.loadGameData(filename)` (the `web-api.js`
   shim) → `fetch('../data/' + filename + '?v=N')`.
2. Relative `../data/` from `/QK-Wrath-and-Glory/creator/index.html` resolves to
   `/QK-Wrath-and-Glory/data/<file>` — correct on Pages (subpath) and locally (serve repo
   root, open `/creator/`). The same holds for `/bestiary/`.
3. One physical `data/` dir; an edit is seen by both apps with no sync.

### The single code change per app

`js/web-api.js`, `loadGameData`:
```js
// before
const response = await fetch('data/' + filename + '?v=15');
// after
const response = await fetch('../data/' + filename + '?v=15');
```
(The `?v=N` cache-bust stays per-app; bump both when data/code changes.)

## Migration plan (high level — detailed steps go in the implementation plan)

**Prerequisite (user):** create empty `QK-Wrath-and-Glory` repo under the main GitHub
account. ✅ DONE — bot collaborator invite accepted, write access confirmed, repo empty.

1. **Assemble locally** in a clean dir (NOT inside the scratch-filled `/root/projects/
   wrath-and-glory/` working area, which holds `books/`, `rewrite/`, audit reports, scratch
   `*.py`, etc. that must not enter the repo):
   - `data/` ← copy creator's `data/` (has the 11 shared + 2 creator-only) then add
     bestiary's `threats.json` and `threat-weapons.json`.
   - `creator/` ← creator app files minus its `data/` (and minus `CLAUDE.md`).
   - `bestiary/` ← bestiary app files minus its `data/` (and minus `CLAUDE.md`,
     `analysis_output.md`, `threat-listing.txt` scratch).
   - Flip the `web-api.js` data path in both apps.
   - Author `index.html` (landing), unified `CLAUDE.md`, move `STYLE_GUIDE.md`,
     `.github/workflows/deploy.yml`, `.gitattributes`.
2. **Local verification (before anything remote):** serve repo root; Playwright smoke both
   apps — confirm data loads from `../data/`, entry counts match the old apps, zero console
   errors (favicon 404 excepted), and a rewritten entry renders in each.
3. **Push:** `git init`, single initial commit (author QuadraKev-bot), add remote (tokenless
   URL; credential helper supplies `$GH_TOKEN`, `WSLENV=GH_TOKEN/u`), push `main`.
4. **Enable Pages:** set Pages source to GitHub Actions (via API if possible; else flag the
   one Settings→Pages click for the user). Confirm the deploy run succeeds and both live
   URLs render.
5. **Leave old repos live and untouched.**

## Verification / success criteria

- Local: both apps load and render with no console errors; `DataLoader` reports the same
  entry counts as the standalone apps; data is fetched from the single `../data/`.
- Remote: the Actions deploy succeeds; `…/wrath-and-glory/creator/` and `…/bestiary/` both
  work; landing page links resolve.
- Repo cleanliness: no `books/`, `rewrite/`, audit, or scratch files committed.

## Risks & considerations

- **Pages enablement on a new repo** may require a manual Settings→Pages selection; will be
  flagged if the API path doesn't suffice.
- **Relative `../data/`** requires apps to sit exactly one directory deep (`/creator/`,
  `/bestiary/`). Honoured by the layout.
- **Electron wrappers** (separate desktop projects) are unaffected — they use their own
  preload `api`, not `web-api.js`. Out of scope.
- **`?v=` cache-bust** is now effectively shared data behind two per-app versions; bump both
  on data changes (noted in the unified CLAUDE.md).

## Non-goals (explicit)

- Merging app code (`css/js/tabs`) or extracting shared JS modules.
- Changing data content (already reconciled; byte-identical shared files).
- Archiving, redirecting, or deleting the old repos.
- Touching the Electron wrapper projects.
