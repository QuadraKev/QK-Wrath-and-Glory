# QK-Wrath-and-Glory Monorepo Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assemble the two existing Wrath & Glory web apps into a single new monorepo (`QK-Wrath-and-Glory`) with one shared `/data/` source and a single `CLAUDE.md`, deploy both as subpath sites via GitHub Pages, and leave the two old repos untouched.

**Architecture:** Static, no-build monorepo. One top-level `data/` dir is the single source of truth; each app lives in its own subfolder (`creator/`, `bestiary/`) and fetches `../data/` (the only code change). A root landing page links to both. One GitHub Pages "deploy from Actions" workflow uploads the whole repo; relative paths make the `/QK-Wrath-and-Glory/` subpath work automatically.

**Tech Stack:** Vanilla JS (global-object modules, no bundler), GitHub Pages + Actions, git in WSL (PowerShell shell), Playwright MCP for smoke tests, poppler/PowerShell for ops.

**Spec:** `docs/superpowers/specs/2026-06-13-monorepo-design.md`

---

## Conventions for the executor

- Shell: PowerShell tool. Run git/ls/cp inside WSL: `wsl -d Ubuntu-24.04 -- bash <script>`.
  WSL bash quoting is fragile — write non-trivial shell to a `/tmp/*.sh` file (via the Write
  tool to `\\wsl.localhost\Ubuntu-24.04\tmp\…`) and run `bash /tmp/x.sh`. Use `/usr/bin/git`.
- Source repos (DO NOT modify): `/root/projects/wrath-and-glory/wrath-and-glory-creator-web`
  and `…/wrath-and-glory-bestiary-web`.
- Build target (new, clean): `/root/projects/QK-Wrath-and-Glory`.
- Windows UNC equivalents for Read/Write/Playwright: prefix
  `\\wsl.localhost\Ubuntu-24.04` to the POSIX path, backslashes.
- Commit author ALWAYS: `QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>`.
- Token: Windows `$env:GH_TOKEN` (QuadraKev-bot PAT). NEVER print it; only in an
  `Authorization: Bearer` header (API) or via the git credential helper (push). Pipe git/gh
  output through `sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'`.

---

## File Structure (what gets created)

```
/root/projects/QK-Wrath-and-Glory/
├── .gitattributes                # * text=auto eol=lf
├── .github/workflows/deploy.yml  # Pages from Actions, upload path .
├── CLAUDE.md                     # unified doc (Task 4)
├── STYLE_GUIDE.md                # copied from /root/projects/wrath-and-glory/STYLE_GUIDE.md
├── index.html                    # landing page (Task 4)
├── robots.txt                    # site-wide
├── data/                         # 15 files: creator's 13 + threats.json + threat-weapons.json
├── creator/                      # creator app minus data/, CLAUDE.md, .github, .gitattributes
│   ├── index.html, css/, js/, tabs/, robots.txt
└── bestiary/                     # bestiary app minus data/, CLAUDE.md, .github, .gitattributes,
    │                             #   analysis_output.md, threat-listing.txt
    ├── index.html, css/, js/, tabs/, robots.txt
```

---

### Task 1: Scaffold clean repo dir + single data/ source

**Files:**
- Create dir: `/root/projects/QK-Wrath-and-Glory/`
- Create dir: `/root/projects/QK-Wrath-and-Glory/data/`

- [ ] **Step 1: Write the scaffold script** to `\\wsl.localhost\Ubuntu-24.04\tmp\mono-scaffold.sh`:

```bash
#!/bin/bash
set -e
SRC=/root/projects/wrath-and-glory
DST=/root/projects/QK-Wrath-and-Glory
rm -rf "$DST"
mkdir -p "$DST/data"
# Single data source: creator's 13 files (shared 11 + backgrounds + keyword-categories)
cp "$SRC/wrath-and-glory-creator-web/data/"*.json "$DST/data/"
# Add the two bestiary-only files
cp "$SRC/wrath-and-glory-bestiary-web/data/threats.json" "$DST/data/"
cp "$SRC/wrath-and-glory-bestiary-web/data/threat-weapons.json" "$DST/data/"
echo "data files:"; ls "$DST/data" | wc -l; ls "$DST/data"
```

- [ ] **Step 2: Run it**

Run: `wsl -d Ubuntu-24.04 -- bash /tmp/mono-scaffold.sh`
Expected: `data files:` then `15` then the 15 filenames (archetypes.json … weapons.json,
threats.json, threat-weapons.json).

- [ ] **Step 3: Verify the shared files are the synced/byte-identical copies**

Run: `wsl -d Ubuntu-24.04 -- bash -c "diff /root/projects/QK-Wrath-and-Glory/data/weapons.json /root/projects/wrath-and-glory/wrath-and-glory-bestiary-web/data/weapons.json && echo IDENTICAL"`
Expected: `IDENTICAL` (confirms creator's copy == the already-synced bestiary copy).

---

### Task 2: Copy both apps into subfolders (minus data/docs/scratch)

**Files:**
- Create: `/root/projects/QK-Wrath-and-Glory/creator/` (from creator-web)
- Create: `/root/projects/QK-Wrath-and-Glory/bestiary/` (from bestiary-web)

- [ ] **Step 1: Write the app-copy script** to `\\wsl.localhost\Ubuntu-24.04\tmp\mono-apps.sh`:

```bash
#!/bin/bash
set -e
SRC=/root/projects/wrath-and-glory
DST=/root/projects/QK-Wrath-and-Glory
for pair in "wrath-and-glory-creator-web:creator" "wrath-and-glory-bestiary-web:bestiary"; do
  s="${pair%%:*}"; d="${pair##*:}"
  mkdir -p "$DST/$d"
  cp -r "$SRC/$s/css" "$SRC/$s/js" "$SRC/$s/tabs" "$DST/$d/"
  cp "$SRC/$s/index.html" "$SRC/$s/robots.txt" "$DST/$d/"
done
echo "creator entries:"; ls "$DST/creator"
echo "bestiary entries:"; ls "$DST/bestiary"
```
(Only copies css/js/tabs/index.html/robots.txt — deliberately omits each app's `data/`,
`CLAUDE.md`, `.github`, `.gitattributes`, and bestiary's `analysis_output.md` /
`threat-listing.txt`.)

- [ ] **Step 2: Run it**

Run: `wsl -d Ubuntu-24.04 -- bash /tmp/mono-apps.sh`
Expected: each app lists `css js tabs index.html robots.txt` and NO `data` or `CLAUDE.md`.

- [ ] **Step 3: Confirm no data/ leaked into the app folders**

Run: `wsl -d Ubuntu-24.04 -- bash -c "ls /root/projects/QK-Wrath-and-Glory/creator/data /root/projects/QK-Wrath-and-Glory/bestiary/data 2>&1 | head"`
Expected: `No such file or directory` for both (apps have no local data/).

---

### Task 3: Flip the data path to the shared dir (the only code change)

**Files:**
- Modify: `/root/projects/QK-Wrath-and-Glory/creator/js/web-api.js` (the `loadGameData` fetch)
- Modify: `/root/projects/QK-Wrath-and-Glory/bestiary/js/web-api.js`

- [ ] **Step 1: Edit creator's web-api.js**

In `\\wsl.localhost\Ubuntu-24.04\root\projects\QK-Wrath-and-Glory\creator\js\web-api.js`,
replace:
```js
        const response = await fetch('data/' + filename + '?v=15');
```
with:
```js
        const response = await fetch('../data/' + filename + '?v=15');
```

- [ ] **Step 2: Edit bestiary's web-api.js**

In `\\wsl.localhost\Ubuntu-24.04\root\projects\QK-Wrath-and-Glory\bestiary\js\web-api.js`,
replace:
```js
        const response = await fetch('data/' + filename);
```
with:
```js
        const response = await fetch('../data/' + filename);
```
(Note: bestiary has NO `?v=` cache-bust; preserve that.)

- [ ] **Step 3: Verify both edits and that no other `fetch('data/'` remains**

Run: `wsl -d Ubuntu-24.04 -- bash -c "grep -rn \"fetch('data/\" /root/projects/QK-Wrath-and-Glory/creator /root/projects/QK-Wrath-and-Glory/bestiary; grep -rn \"fetch('../data/\" /root/projects/QK-Wrath-and-Glory/*/js/web-api.js"`
Expected: ZERO `fetch('data/` matches; TWO `fetch('../data/` matches (one per app).

---

### Task 4: Author root files (landing, CLAUDE.md, style guide, deploy, attributes)

**Files:**
- Create: `/root/projects/QK-Wrath-and-Glory/index.html`
- Create: `/root/projects/QK-Wrath-and-Glory/CLAUDE.md`
- Create: `/root/projects/QK-Wrath-and-Glory/STYLE_GUIDE.md` (copy)
- Create: `/root/projects/QK-Wrath-and-Glory/.gitattributes`
- Create: `/root/projects/QK-Wrath-and-Glory/robots.txt`
- Create: `/root/projects/QK-Wrath-and-Glory/.github/workflows/deploy.yml`

- [ ] **Step 1: Copy the shared style guide + create .gitattributes/robots.txt**

```bash
#!/bin/bash
set -e
SRC=/root/projects/wrath-and-glory
DST=/root/projects/QK-Wrath-and-Glory
cp "$SRC/STYLE_GUIDE.md" "$DST/STYLE_GUIDE.md"
printf '* text=auto eol=lf\n' > "$DST/.gitattributes"
printf 'User-agent: *\nAllow: /\n' > "$DST/robots.txt"
mkdir -p "$DST/.github/workflows"
echo done
```
Write to `\\wsl.localhost\Ubuntu-24.04\tmp\mono-root.sh`, run
`wsl -d Ubuntu-24.04 -- bash /tmp/mono-root.sh`. Expected: `done`.

- [ ] **Step 2: Create `.github/workflows/deploy.yml`** (identical to the proven per-app one)

Write `\\wsl.localhost\Ubuntu-24.04\root\projects\QK-Wrath-and-Glory\.github\workflows\deploy.yml`:
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: .
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Create the landing page** `\\wsl.localhost\Ubuntu-24.04\root\projects\QK-Wrath-and-Glory\index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wrath &amp; Glory Tools</title>
  <style>
    :root { --bg:#1a1a2e; --card:#1f2937; --border:#374151; --gold:#d4af37; --text:#e5e7eb; --muted:#9ca3af; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; background:var(--bg); color:var(--text);
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
      display:flex; flex-direction:column; align-items:center; justify-content:center; padding:24px; }
    h1 { color:var(--gold); font-size:2rem; margin:0 0 4px; text-align:center; }
    p.sub { color:var(--muted); margin:0 0 32px; text-align:center; }
    .cards { display:flex; gap:20px; flex-wrap:wrap; justify-content:center; max-width:760px; }
    a.card { display:block; width:330px; background:var(--card); border:1px solid var(--border);
      border-radius:12px; padding:24px; text-decoration:none; color:var(--text);
      transition:border-color .15s, transform .15s; }
    a.card:hover { border-color:var(--gold); transform:translateY(-2px); }
    a.card h2 { color:var(--gold); margin:0 0 8px; font-size:1.25rem; }
    a.card p { margin:0; color:var(--muted); font-size:.95rem; }
    footer { color:var(--muted); font-size:.8rem; margin-top:32px; }
  </style>
</head>
<body>
  <h1>Wrath &amp; Glory Tools</h1>
  <p class="sub">Unofficial fan reference tools for the Wrath &amp; Glory tabletop RPG.</p>
  <div class="cards">
    <a class="card" href="creator/">
      <h2>Character Creator</h2>
      <p>Build and manage characters: species, archetypes, talents, wargear, ascension.</p>
    </a>
    <a class="card" href="bestiary/">
      <h2>Bestiary &amp; Encounters</h2>
      <p>Browse threats and build encounters with initiative, mobs, and wound tracking.</p>
    </a>
  </div>
  <footer>Single shared dataset &middot; two apps &middot; hosted from one repo.</footer>
</body>
</html>
```

- [ ] **Step 4: Create the unified `CLAUDE.md`** at `\\wsl.localhost\Ubuntu-24.04\root\projects\QK-Wrath-and-Glory\CLAUDE.md`:

```markdown
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

## Books (PDF, local reference only — not in this repo)

Sourcebook PDFs live under the dev working area (`/root/projects/wrath-and-glory/books/`),
NOT in this repo. Read PDFs visually (render via `pdftoppm`); never `pdftotext` for content.

## Related (not in this repo)

The old single-app repos `wrath-and-glory-creator-web` / `wrath-and-glory-bestiary-web`
remain live as a migration snapshot. Electron desktop wrappers are separate projects.
```

- [ ] **Step 5: Verify the tree**

Run: `wsl -d Ubuntu-24.04 -- bash -c "cd /root/projects/QK-Wrath-and-Glory && find . -maxdepth 2 -not -path '*/data/*' | sort"`
Expected: shows `./index.html`, `./CLAUDE.md`, `./STYLE_GUIDE.md`, `./.gitattributes`,
`./robots.txt`, `./.github/workflows/deploy.yml`, `./creator/{css,js,tabs,index.html,robots.txt}`,
`./bestiary/{…}`, `./data` (dir).

---

### Task 5: Local verification — serve + Playwright smoke both apps

**Files:** none (verification only)

- [ ] **Step 1: Serve the repo root**

Run (background): `wsl -d Ubuntu-24.04 -- bash -c "cd /root/projects/QK-Wrath-and-Glory && nohup python3 -m http.server 8003 >/tmp/mono.log 2>&1 & sleep 1; curl -s -o /dev/null -w 'root %{http_code}\n' http://localhost:8003/index.html; curl -s -o /dev/null -w 'creator %{http_code}\n' http://localhost:8003/creator/index.html; curl -s -o /dev/null -w 'bestiary %{http_code}\n' http://localhost:8003/bestiary/index.html"`
Expected: `root 200`, `creator 200`, `bestiary 200`.

- [ ] **Step 2: Playwright — creator loads data from ../data/, no errors**

Navigate `http://localhost:8003/creator/index.html`. Get console errors (level error) —
expect only a `favicon.ico` 404. Then `browser_evaluate`:
```js
async () => {
  const g = async f => (await (await fetch('../data/'+f+'.json',{cache:'no-store'})).json());
  const tal = await g('talents'); const wpn = await g('weapons');
  const bg = await g('backgrounds');
  return { talents: tal.length, weapons: wpn.length, origins: bg.origins.length,
           sharedPathWorks: tal.length>0 && wpn.length>0 };
}
```
Expected: `talents 425`, `weapons 448`, `origins 36`, `sharedPathWorks true`.

- [ ] **Step 3: Playwright — bestiary loads data from ../data/, no errors**

Navigate `http://localhost:8003/bestiary/index.html`. Console errors: only favicon 404.
`browser_evaluate`:
```js
async () => {
  const g = async f => (await (await fetch('../data/'+f+'.json',{cache:'no-store'})).json());
  const th = await g('threats'); const tw = await g('threat-weapons');
  const gl = await g('glossary');
  return { threats: th.length, threatWeapons: tw.length,
           glossaryCats: Object.keys(gl).length, sharedPathWorks: th.length>0 };
}
```
Expected: `threats 775`, `threatWeapons 11`, `glossaryCats` > 0, `sharedPathWorks true`.

- [ ] **Step 4: Confirm the app UI actually renders (not just fetch)**

For each app, after navigation, `browser_evaluate` returns
`document.querySelector('.tab-content, #app, main') !== null` → expect `true`, and capture
`browser_console_messages` (level error) shows no errors beyond favicon. If a real error
appears (e.g. a hardcoded `data/` path missed in some file), STOP and fix before Task 6.

- [ ] **Step 5: Stop the server + close browser**

Run: `wsl -d Ubuntu-24.04 -- bash -c "pkill -f 'http.server 8003'; echo stopped"`. Close the
Playwright page.

---

### Task 6: Initialize repo, initial commit, push to GitHub

**Files:**
- Create: `/root/projects/QK-Wrath-and-Glory/.git/` (via `git init`)

- [ ] **Step 1: Write the init+commit script** to `\\wsl.localhost\Ubuntu-24.04\tmp\mono-git.sh`:

```bash
#!/bin/bash
set -e
GIT=/usr/bin/git
D=/root/projects/QK-Wrath-and-Glory
cd "$D"
$GIT init -b main
$GIT add -A
$GIT status --short | head -40
echo "--- file count staged ---"; $GIT diff --cached --name-only | wc -l
```
Run `wsl -d Ubuntu-24.04 -- bash /tmp/mono-git.sh`. Expected: staged files include
`index.html`, `CLAUDE.md`, `data/…` (15), `creator/…`, `bestiary/…`,
`.github/workflows/deploy.yml`; NO `books/`, `rewrite/`, `*.py`, `audit-*`.

- [ ] **Step 2: Sanity-check nothing scratch got staged**

Run: `wsl -d Ubuntu-24.04 -- bash -c "cd /root/projects/QK-Wrath-and-Glory && /usr/bin/git diff --cached --name-only | grep -E 'books/|rewrite/|audit|\.py$|threat-listing|analysis_output' || echo CLEAN"`
Expected: `CLEAN`.

- [ ] **Step 3: Write commit message** to `\\wsl.localhost\Ubuntu-24.04\tmp\mono-commit.txt`:

```
Initial monorepo: shared data, creator + bestiary apps, single CLAUDE.md

Combines the two Wrath & Glory web apps into one repo with a single shared
/data/ source (eliminating the two-source sync problem) and one CLAUDE.md.
Each app lives in its own subfolder and fetches ../data/; a landing page links
to both; GitHub Pages deploys the whole repo (apps at /creator/ and /bestiary/).
No app code merged; data content unchanged (already reconciled).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

- [ ] **Step 4: Commit (as QuadraKev-bot), add remote, push**

Write to `\\wsl.localhost\Ubuntu-24.04\tmp\mono-push.sh`:
```bash
#!/bin/bash
set -e
GIT=/usr/bin/git
D=/root/projects/QK-Wrath-and-Glory
redact() { sed -E 's/(ghp|github_pat)_[A-Za-z0-9_]+/[REDACTED]/g'; }
cd "$D"
$GIT commit -F /tmp/mono-commit.txt \
  --author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>"
$GIT remote add origin https://github.com/QuadraKev/QK-Wrath-and-Glory.git 2>/dev/null || true
$GIT log -1 --format='commit %h by %an'
$GIT push -u origin main 2>&1 | redact
```
Run with the token propagated:
`$env:WSLENV="GH_TOKEN/u"; wsl -d Ubuntu-24.04 -- bash /tmp/mono-push.sh`
Expected: `commit <hash> by QuadraKev-bot` and a push line `* [new branch] main -> main`.

- [ ] **Step 5: Confirm remote has the commit**

Run (PowerShell, token in header, never printed):
```powershell
$h=@{Authorization="Bearer $env:GH_TOKEN";'User-Agent'='claude-code';Accept='application/vnd.github+json'}
(Invoke-RestMethod -Uri 'https://api.github.com/repos/QuadraKev/QK-Wrath-and-Glory/commits?per_page=1' -Headers $h)[0] |
  Select-Object @{n='sha';e={$_.sha.Substring(0,7)}}, @{n='author';e={$_.commit.author.name}}, @{n='msg';e={$_.commit.message.Split("`n")[0]}}
```
Expected: the sha, author `QuadraKev-bot`, and the message's first line.

---

### Task 7: Enable GitHub Pages + verify live sites

**Files:** none (remote config + verification)

- [ ] **Step 1: Enable Pages with the Actions build type via API**

Run (PowerShell):
```powershell
$h=@{Authorization="Bearer $env:GH_TOKEN";'User-Agent'='claude-code';Accept='application/vnd.github+json'}
$body = @{ build_type = 'workflow' } | ConvertTo-Json
try {
  Invoke-RestMethod -Uri 'https://api.github.com/repos/QuadraKev/QK-Wrath-and-Glory/pages' -Headers $h -Method Post -Body $body -ContentType 'application/json' | Out-Null
  Write-Output 'Pages created (workflow build type).'
} catch {
  $m = $_.Exception.Message -replace '(ghp|github_pat)_[A-Za-z0-9_]+','[REDACTED]'
  Write-Output "POST failed ($m); trying PUT to update build_type…"
  try { Invoke-RestMethod -Uri 'https://api.github.com/repos/QuadraKev/QK-Wrath-and-Glory/pages' -Headers $h -Method Put -Body $body -ContentType 'application/json' | Out-Null; Write-Output 'Pages build_type set to workflow.' }
  catch { Write-Output ('PUT also failed: ' + ($_.Exception.Message -replace '(ghp|github_pat)_[A-Za-z0-9_]+','[REDACTED]') + ' — MANUAL STEP: repo Settings -> Pages -> Source: GitHub Actions.') }
}
```
Expected: `Pages created (workflow build type).` If both API calls fail, surface the MANUAL
STEP to the user (Settings → Pages → Source: GitHub Actions) and wait.

- [ ] **Step 2: Wait for the deploy run to finish, then check Pages status**

Run (PowerShell), poll the latest Actions run + Pages status:
```powershell
$h=@{Authorization="Bearer $env:GH_TOKEN";'User-Agent'='claude-code';Accept='application/vnd.github+json'}
$run=(Invoke-RestMethod -Uri 'https://api.github.com/repos/QuadraKev/QK-Wrath-and-Glory/actions/runs?per_page=1' -Headers $h).workflow_runs[0]
Write-Output ("run: {0} / {1}" -f $run.status, $run.conclusion)
$p=Invoke-RestMethod -Uri 'https://api.github.com/repos/QuadraKev/QK-Wrath-and-Glory/pages' -Headers $h
Write-Output ("pages: status={0} url={1}" -f $p.status, $p.html_url)
```
Expected eventually: `run: completed / success` and `pages: status=built url=https://quadrakev.github.io/QK-Wrath-and-Glory/`.
(If `status`/`conclusion` is still in progress, wait ~30-60s and re-run. Deploy may take a
few minutes on first enable.)

- [ ] **Step 3: Verify all three live URLs return 200**

Run: `wsl -d Ubuntu-24.04 -- bash -c "for u in '' creator/ bestiary/; do curl -s -o /dev/null -w \"%{http_code} https://quadrakev.github.io/QK-Wrath-and-Glory/\$u\n\" \"https://quadrakev.github.io/QK-Wrath-and-Glory/\$u\"; done"`
Expected: `200` for the root, `creator/`, and `bestiary/`. (If 404 right after first deploy,
Pages CDN may lag 1-2 min; re-run.)

- [ ] **Step 4: Playwright — live bestiary loads data from the shared dir**

Navigate `https://quadrakev.github.io/QK-Wrath-and-Glory/bestiary/index.html`. Console
errors: only favicon 404. `browser_evaluate`:
```js
async () => {
  const th = await (await fetch('../data/threats.json',{cache:'no-store'})).json();
  return { threats: th.length, ok: th.length===775 };
}
```
Expected: `threats 775`, `ok true` — confirms `../data/` resolves correctly under the live
`/QK-Wrath-and-Glory/` subpath.

- [ ] **Step 5: Final report to user**

Report: repo URL, commit hash, the three live URLs, confirmation both apps render live from
the single dataset, and the reminder that the two old repos remain live and untouched.

---

## Self-Review

**Spec coverage:**
- New repo `QK-Wrath-and-Glory`, bot pushes → Tasks 6-7. ✓
- Fresh single initial commit, author QuadraKev-bot → Task 6 Steps 3-4. ✓
- Old repos untouched → never referenced for writes; stated in Task 7 Step 5. ✓
- Subpath Pages hosting → Task 4 Step 2 (deploy.yml) + Task 7. ✓
- Shared `/data/` (15 files = 13 creator + 2 bestiary-only) → Task 1. ✓
- `../data/` one-line change per app → Task 3 (creator keeps `?v=15`, bestiary none). ✓
- Landing page, unified CLAUDE.md, STYLE_GUIDE moved → Task 4. ✓
- No scratch/books/rewrite committed → Task 6 Steps 1-2 guard. ✓
- Local Playwright smoke before push → Task 5 (gate before Task 6). ✓
- Pages via API w/ manual fallback flagged → Task 7 Step 1. ✓
- Scope: no code merge, no Electron, no data content change → respected (only web-api.js edit). ✓

**Placeholder scan:** No TBD/TODO; every file's content is given in full (deploy.yml,
index.html, CLAUDE.md); every command has expected output. ✓

**Consistency:** Build dir `/root/projects/QK-Wrath-and-Glory` and repo
`https://github.com/QuadraKev/QK-Wrath-and-Glory.git` used consistently; data counts
(talents 425, weapons 448, threats 775, threat-weapons 11, origins 36) match the post-sync
state verified earlier this session; data path `../data/` consistent across Task 3/5/7.

**Known external dependency:** GitHub Pages first-enable + CDN propagation timing — handled
with poll/retry notes in Task 7.
