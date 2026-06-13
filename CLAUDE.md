# QK-Wrath-and-Glory

Monorepo for two static, no-build web apps for the Wrath & Glory tabletop RPG, sharing a
single dataset and deployed as two sites from one GitHub Pages repo.

- `creator/` — character creation tool (served at `/QK-Wrath-and-Glory/creator/`)
- `bestiary/` — threat/NPC reference + encounter builder (`/QK-Wrath-and-Glory/bestiary/`)
- `index.html` — landing page linking to both
- `data/` — THE single source of game data, shared by both apps
- `STYLE_GUIDE.md` — shared conventions (naming, CSS vars, JS patterns)

## Architecture

Vanilla JS, global-object module pattern (`const ThreatsTab = {…}`), no bundler/build step.
Each app loads data through `window.api.loadGameData(filename)` in `js/web-api.js`, which
fetches from the shared dataset: `fetch('../data/' + filename …)`. Serve the repo ROOT with
any static server and open `/creator/` or `/bestiary/`.

## Single data source (the reason this repo exists)

All game data lives ONCE in `/data/`. Both apps read it via the relative path `../data/`.
Never reintroduce per-app `data/` folders. When you change a data file, it is live for both
apps with no sync step. Files:

- Shared (used by both): archetypes, armor, ascension-packages, equipment, glossary,
  injuries-corruption, psychic-powers, species, talents, weapon-upgrades, weapons.
- Creator-only: backgrounds, keyword-categories.
- Bestiary-only: threats, threat-weapons.

Data conventions: IDs snake_case (Apocrypha uses `_aaa` suffix); traits/keywords are arrays
of UPPERCASE strings; missing display values use `"-"`; `source`/`page` fields for citations
(no inline page refs in prose); `[AI-Generated]` prefixes ONLY on fields with no source-book
text. Data text should be verbatim sourcebook text where the book has it.

## Cache busting

`creator/js/web-api.js` appends `?v=N` to data fetches; `bestiary/js/web-api.js` does not.
For CSS/JS, bump the `?v=N` on ALL `<script>`/`<link>` tags in that app's `index.html`
together. After a data edit, bump creator's data `?v=` so clients refetch.

## Deploy

GitHub Actions (`.github/workflows/deploy.yml`) deploys the whole repo to Pages on push to
`main`. URLs: `quadrakev.github.io/QK-Wrath-and-Glory/{,creator/,bestiary/}`.

## Commits / auth

- Author ALL commits `--author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>"`.
- Token in Windows `$env:GH_TOKEN` (QuadraKev-bot PAT). NEVER print it or put it in a URL/
  file/commit. Push uses a git credential helper reading `$GH_TOKEN`; in WSL set
  `WSLENV=GH_TOKEN/u` first. Pipe git/gh output through
  `sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'`. API: token only in the
  `Authorization` header.
- GitHub Issues: don't close until the user confirms; comment a summary after.

## Books (PDF, local reference only — NEVER in this repo)

Sourcebook PDFs live OUTSIDE the repo at `../.QK-Wrath-and-Glory-reference/books/` (a sibling
of this repo; the leading dot marks it as a non-project folder). They are COPYRIGHTED — the
license covers using the text in the apps, NOT redistributing the PDFs, so they must never be
committed or deployed. Read PDFs visually (render via `pdftoppm`); never `pdftotext` for content.

## Related (not in this repo)

The old single-app repos `wrath-and-glory-creator-web` / `wrath-and-glory-bestiary-web`
remain live as a migration snapshot. Electron desktop wrappers are separate projects.
