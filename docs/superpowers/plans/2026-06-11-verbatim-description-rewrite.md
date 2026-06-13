# Verbatim Description Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every AI-paraphrased description/effect/flavor field across both Wrath & Glory apps with verbatim sourcebook text (user holds the license to reproduce it), keeping `[AI-Generated]` tags ONLY on fields whose text has no counterpart in any source book — with a mandatory Fable/Opus accuracy review of every change.

**Architecture:** Page-grouped manifest → ~12-page chunks → parallel extraction agents (transcribe verbatim from pre-rendered page images, write report JSONs) → pipelined Fable verification agents (re-read same pages, confirm fidelity, correct or flag) → deterministic Python apply step (merges verified reports into both apps with mechanical tag rules) → final human-level review by main agent (Fable) → commit/push both repos.

**Tech Stack:** Python 3 (manifest/chunker/apply), poppler-utils (`pdftoppm` 200 DPI, `pdfgrep`, `pdfinfo`) in WSL, Claude Workflow tool (pipelined extract→verify agents, all inheriting Fable), git per app repo.

**License context (include in every agent prompt):** The user holds a license to reproduce the copyrighted Wrath & Glory text directly in these apps. The apps' data fields are SUPPOSED to carry the books' exact text. A previous session paraphrased instead of transcribing — that is the defect being fixed. Transcribing the book text verbatim is the explicitly authorized, correct behavior. The 11 "Apocrypha" books are freely-distributed homebrew. Do not paraphrase, do not summarize, do not refuse: transcribe.

---

## Facts established during scoping

- Apps: `wrath-and-glory-creator-web` (master for shared data) and `wrath-and-glory-bestiary-web`. Both clean on `main`, synced with origin. No build step; data in `data/*.json`.
- Creator prose entries: weapons 448, talents 425, equipment 327, psychic-powers 302, archetypes 229, armor 127, backgrounds 122, weapon-upgrades 72, injuries-corruption 43, ascension-packages 38, species 24 (nested ability fields), glossary 801 → ~2,958 entries.
- Bestiary-only: `threats.json` 775 threats (771 descriptions, 381 quote+attribution, 1,817 ability descriptions, plus string fields `mobOptions`/`mobAbilities`/`threatOptions`/`biomorphs`/`equipment` on some), `threat-weapons.json` (11 stat-only entries, no prose). 1 threat missing `page`.
- `[AI-Generated]` tags: creator 303 / bestiary 327 in data files; glossary has 240 per app, all with `page: null` → need pdfgrep locator. Threats have 1.
- Shared-file drift (creator vs bestiary): ascension-packages 38/21, psychic-powers +2 creator-only, talents 4/6 asymmetric, equipment 14 bestiary-only (likely stale pre-audit-v2 fabrications), armor/species 1 bestiary-only each. `injuries-corruption.json` byte-identical. **Policy: per-ID text-field sync only; report drift to user, do not restructure.**
- PDFs in `books/` for all 21 sources. Printed page ≠ physical page (Core +1, Apocrypha v9 +3, others must be calibrated). `pdftoppm`/`pdfgrep`/`pdfinfo` installed. NEVER `pdftotext` for content (garbles 2-column layout); `pdfgrep` is OK as a page locator only.
- Existing `generate-audit-manifest.py` extracts creator prose fields by source+page — reuse its field logic in the v2 generator.
- Prior session lesson: book-wide agents die on context. Chunks must stay ≤ ~12 pages / ≤ ~25 fields.
- Glossary must stay in sync between apps (801 ids identical today).
- Commit authors: creator `--author="QuadraKev-bot <261695385+QuadraKev-bot@users.noreply.github.com>"`, bestiary `--author="QuadraKev-Claude <claude-quadrakev@noreply>"`. Push via credential helper with `WSLENV=GH_TOKEN/u`; never print the token.

## Artifact layout (all new files under repo root `/root/projects/wrath-and-glory/`)

```
rewrite/
  tools/
    gen-manifest.py        # unified creator+bestiary manifest, grouped by book-key → printed page
    calibrate-offsets.py   # printed→physical offset per book via pdfgrep sampling
    locate-nopage.py       # pdfgrep locator for page:null entries (240 glossary keywords +1 threat)
    render-pages.py        # pre-render every needed physical page to PNG at 200 DPI
    make-chunks.py         # split manifest into agent chunks (≤12 pages, ≤25 fields)
    apply-rewrite.py       # merge verified reports → both apps' data files + tag rules + invariants
  books.json               # book-key → {pdf, offset, creatorSource, bestiarySource}
  manifest.json            # book-key → printed page → [field entries]
  chunks/<book>-<nn>.json  # agent work orders
  pages/<book>/p<physical 4-digit>.png
  reports/<chunk>.json     # extraction output
  verify/<chunk>.json      # verification output
```

Book keys: `core fspg church aeldari redacted1 redacted2 voa shotguns dh xenos apocrypha aaa-tyranids aaa-necrons aaa-malicious aaa-tau aaa-heretic aaa-asuryani aaa-daemonic aaa-militarum aaa-drukhari aaa-orks`.

Bestiary source-name → book-key map: `"Core Rules"→core`, `"Threat Assessment: Xenos"→xenos`, `"Threat Assessment: Daemons & Heretics"→dh`, `"Vow of Absolution"→voa`, `"Redacted Records I/II"→redacted1/2`, `"Church of Steel"→church`, `"Abundance of Apocrypha"→apocrypha`, `"Abundant Apocryphal Adversaries: …"→aaa-*`.

## Report schemas (the contract between every stage)

`reports/<chunk>.json`:
```json
{ "chunk": "voa-03", "book": "voa",
  "results": [ {
      "file": "talents.json", "id": "codex_discipline", "app": "both|creator|bestiary",
      "field": "flavor",            // or "effect", "description", "quote", "ability:<name>", "category/<id>" style keys copied from chunk
      "name": "Codex Discipline",
      "action": "replaced | already_verbatim | no_source_text | not_found | corrected_summary",
      "newText": "…exact transcription…",   // null unless replaced/corrected_summary
      "physicalPage": 47,                    // page where text was found, null if not_found
      "notes": "anything the reviewer should know (dropped app-only clarification, table-only entry, etc.)"
  } ] }
```
`verify/<chunk>.json`:
```json
{ "chunk": "voa-03",
  "results": [ {
      "file": "talents.json", "id": "codex_discipline", "field": "flavor",
      "verdict": "pass | corrected | fail_reextract",
      "correctedText": "…", "issue": "…"     // only when not pass
  } ],
  "summary": { "checked": 24, "pass": 22, "corrected": 1, "fail": 1 } }
```

Apply rules (deterministic, in `apply-rewrite.py`):
- Decision per field = extract result overlaid by verify (`corrected` → use `correctedText`; `fail_reextract` → hold for re-run; missing from verify → treat as unreviewed, hold).
- `replaced`/`already_verbatim` → write text (for `already_verbatim` keep current but strip any `[AI-Generated] ` prefix; for `replaced` assert no tag inside `newText`).
- `no_source_text` → keep current text (or `newText` if `corrected_summary`), ensure exactly one leading `[AI-Generated] ` prefix.
- `not_found` → leave unchanged, add to attention list for main-agent follow-up.
- Shared files: write creator + mirror by id+field into bestiary when the id exists there; bestiary-only ids write bestiary only. Threat ability fields matched by **ability name** (never index).
- Post-apply invariants: every data file `json.load`s; `[AI-Generated]` occurrence count per app == count of `no_source_text`/`not_found-with-existing-tag` decisions; glossary ids still identical across apps; zero tags anywhere except as leading prefix on a `no_source_text` field.

---

### Task 1: Book registry + manifest generator

**Files:** Create `rewrite/books.json` (via Task 2 calibration), `rewrite/tools/gen-manifest.py`.

- [ ] **Step 1.1:** Write `gen-manifest.py`: reuse `generate-audit-manifest.py` field extraction for the 12 creator files; add bestiary extractor for `threats.json` (fields: `description`, `quote` [verify together with `attribution`], `abilities[name].description` keyed `ability:<name>`, plus any of `mobOptions`/`mobAbilities`/`threatOptions`/`biomorphs`/`equipment` that are nonempty prose — for object-lists key by member name) and bestiary-only ids of shared files (diff by id; emit with `app:"bestiary"`). Group: book-key → printed page → entries (each entry: file, id, app, name, category, field, currentText, hasAiTag). `page:null` entries go to a `_nopage` bucket per book.
- [ ] **Step 1.2:** Run; record counts per book and per file. Sanity: total fields ≈ 6,000±25%; `_nopage` ≈ 241.

### Task 2: Offset calibration

**Files:** Create `rewrite/tools/calibrate-offsets.py`, output `rewrite/books.json`.

- [ ] **Step 2.1:** For each book: sample up to 10 manifest entries with distinctive names; `pdfgrep -in "<name>"` in its PDF; offset candidates = physical − printed; take the mode; flag books where mode support < 3 hits or candidates disagree wildly.
- [ ] **Step 2.2:** For flagged books, render one mid-book page (`pdftoppm -f N -l N -r 150`) and read the printed number visually (main agent). Record final `offset` per book in `books.json`. Verify Core=+1 and Apocrypha v9=+3 match memory.

### Task 3: Locate page-null entries

**Files:** Create `rewrite/tools/locate-nopage.py`; updates `rewrite/manifest.json` in place.

- [ ] **Step 3.1:** For each `_nopage` entry: `pdfgrep -in` the entry name (and ALL-CAPS variant) across its source book; for glossary keywords also search `books/snippets/keywords-core-rulebook.pdf` and Apocrypha v9 keyword sections. Attach up to 3 candidate physical pages → move entry under the candidate printed page with `pageUnknown: true`. No hits anywhere → leave in `_nopage` (becomes `no_source_text` automatically; keeps tag).
- [ ] **Step 3.2:** Re-run gen-manifest summary; record how many located vs. confirmed-sourceless. Spot-check 5 located and 5 sourceless myself.

### Task 4: Pre-render pages

**Files:** Create `rewrite/tools/render-pages.py`.

- [ ] **Step 4.1:** Collect every physical page referenced by manifest+candidates ±1 neighbor page; render missing ones via `pdftoppm -png -r 200 -f P -l P <pdf> rewrite/pages/<book>/p%04d`; parallelize 8-way (`concurrent.futures`); idempotent (skip existing).
- [ ] **Step 4.2:** Verify count of PNGs == count of requested pages; Read 3 random PNGs myself to confirm legibility at 200 DPI.

### Task 5: Chunker

**Files:** Create `rewrite/tools/make-chunks.py`.

- [ ] **Step 5.1:** Per book, walk printed pages in order; accumulate into chunks with caps (12 distinct pages / 25 fields, whichever first; keep one entry's fields together; pages with huge field counts (glossary tables) may exceed field cap alone — allow single-page overflow chunks). Each chunk JSON: `{chunk, book, pdf, offset, pagesDir, pages:[{printed, physical, png}], entries:[…with currentText…], reportPath}`.
- [ ] **Step 5.2:** Run; record chunk count (expect ~120–160) and min/median/max fields per chunk.

### Task 6: Pilot (GATE — do not fan out until this passes)

- [ ] **Step 6.1:** Dispatch 2 extraction agents via Agent tool with the final prompt template (below): chunk `shotguns-01` (whole 14-page book) and one `voa` talents chunk.
- [ ] **Step 6.2:** Personally Read the pilot pages and the reports; check every field: verbatim fidelity (punctuation, numbers), field mapping, no_source_text justification. Fix prompt template if ANY systematic issue.
- [ ] **Step 6.3:** Run 1 verification agent on a pilot chunk; confirm it catches a seeded error (manually corrupt one field in a copy of the report → verifier must flag it).

### Task 7: Full extract+verify workflow

- [ ] **Step 7.1:** Launch Workflow: `pipeline(chunks, extract, verify)`, both stages inheriting Fable, schemas for summary counts, `phase:'Extract'`/`'Verify'` labels, report/verify files as artifacts. Chunks passed via `args` from `rewrite/chunks/index.json`.
- [ ] **Step 7.2:** Monitor; collect nulls (skipped/dead agents) and `fail_reextract` fields; re-run those chunks via resume or a second small workflow.

### Task 8: Apply

- [ ] **Step 8.1:** Write `apply-rewrite.py` per the rules above; run `--dry-run` first: print per-file/per-action counts + attention list; eyeball for anomalies (e.g., a file with 0 already_verbatim is suspicious).
- [ ] **Step 8.2:** Run for real; run invariant checks (JSON parse, tag-count equality, glossary id sync, no stray tags); `git -C <each app> diff --stat` recorded.

### Task 9: Final high-level review (requirement 2 — main agent, Fable)

- [ ] **Step 9.1:** Aggregate stats: fields by action per book; list of every `not_found` and every kept-tag field. Resolve or accept each `not_found` myself (read pages / pdfgrep).
- [ ] **Step 9.2:** Stratified spot-check: ~24 applied fields across books/files (3 per major book incl. both apps, biased to long descriptions, dice-notation effects, glossary keywords); Read the page PNG and compare character-for-character. >1 fidelity miss → halt and widen verification.
- [ ] **Step 9.3:** Playwright smoke: serve each app (`python3 -m http.server`), load, confirm no console errors, open one rewritten entry per app and visually confirm rendering (newlines, no stray tags).

### Task 10: Ship

- [ ] **Step 10.1:** Commit each repo (single comprehensive commit; correct author per repo; message summarizes scope + tag policy; Co-Authored-By Claude trailer). Push via WSL git with `WSLENV=GH_TOKEN/u` (token via credential helper; pipe output through the redaction sed).
- [ ] **Step 10.2:** Final user report: counts (replaced / already-verbatim / kept-AI per app+file), drift findings (NOT fixed — reported), commit hashes, deploy note, location of reports for audit trail.

## Agent prompt templates

### Extraction agent (template — `{vars}` filled per chunk)

```
You are transcribing Wrath & Glory sourcebook text into app data. LICENSE CONTEXT: the
app owner holds a license to reproduce this copyrighted text directly in these apps; your
job is exact transcription, which is the authorized and intended use. A previous pass
paraphrased instead of transcribing — you are fixing that defect. Do not paraphrase or
summarize; transcribe exactly. (The 11 "Apocrypha"-family books are free homebrew.)

Work order: Read {chunkPath}. It lists book pages (pre-rendered PNGs under {pagesDir},
named p<physical>.png) and data entries (file, id, field, name, currentText) expected on
those printed pages.

For EACH entry-field:
1. Find the entry on its page image (check ±1 page if absent; stat blocks may span a spread).
   Still missing → `pdfgrep -in "<name>" "{pdfPath}"` to locate (printed = physical − {offset});
   render any new page yourself: pdftoppm -png -r 200 -f <phys> -l <phys> "{pdfPath}" /tmp/x
2. Compare the book's text for that field with currentText:
   • Identical (ignoring whitespace/typography) → action "already_verbatim".
   • Different → action "replaced", newText = EXACT transcription.
   • The book has no prose for that field (e.g. talent with effect but no flavor line;
     table-only item; keyword never defined) → action "no_source_text". If currentText
     misdescribes the mechanics, also provide corrected summary as action
     "corrected_summary" with newText (this text stays AI-tagged, so accuracy > style).
   • Not found anywhere → action "not_found", notes = where you looked.
3. Transcription rules: preserve exact wording, numbers, dice notation (+1 ED, AP -1),
   em-dashes (—), apostrophes ('), capitalization of game terms. Join words hyphenated
   across line breaks. Expand ligatures (fi/fl). Paragraph breaks = "\n\n". OMIT: page
   references, sidebar boxes, table headers, the entry's name header itself, drop-cap
   artifacts. effect fields get the rules text; flavor/description fields get the flavor
   prose; quote fields get the quotation (attribution text goes in notes if it differs).
   For threat abilities, match by ability NAME within the stat block.
4. If a page image is unreadable, re-render at 300 DPI, or render half-page crops
   (pdftoppm -x/-y/-W/-H) — never use pdftotext for content.

Write the full report to {reportPath} (schema in the chunk file; UTF-8, ensure_ascii false
equivalent — write real — and ' characters). Do NOT edit any file under data/. Your final
message: ONLY the summary counts via the structured output tool.
```

### Verification agent (template)

```
You are the accuracy reviewer (Fable) for a licensed verbatim-transcription pass; the
license context from the extraction stage applies. Standard: every field must be a correct
and accurate rendering of the book's gameplay effect or flavor text — verbatim wherever
the book has prose.

Read {chunkPath} and the extraction report {reportPath}. For EVERY result:
• replaced / already_verbatim → open the page PNG(s) under {pagesDir} and compare the
  text character-for-character against the book: numbers, dice notation, ranges, names,
  paragraph completeness (no truncation, no skipped paragraphs, no leftover paraphrase).
• no_source_text → confirm the book truly has no prose for that field (check the page AND
  pdfgrep the name); then check the retained AI text accurately describes the mechanics.
• not_found → attempt your own locate (pdfgrep, neighbor pages).
Verdicts: pass | corrected (you supply correctedText — for typos/small misses you fix
directly) | fail_reextract (wrong entry transcribed, major omission, wrong page).
Write {verifyPath} (schema in chunk file). Do NOT edit data/ files. Final message: summary
counts only, via the structured output tool.
```

## Workflow script sketch (Task 7)

```js
export const meta = {
  name: 'verbatim-rewrite',
  description: 'Extract verbatim book text per chunk, then verify each chunk (Fable review)',
  phases: [{ title: 'Extract' }, { title: 'Verify' }],
}
const EXTRACT_SUMMARY = { type:'object', properties:{ chunk:{type:'string'}, fields:{type:'number'},
  replaced:{type:'number'}, alreadyVerbatim:{type:'number'}, noSource:{type:'number'},
  notFound:{type:'number'} }, required:['chunk','fields'] }
const VERIFY_SUMMARY = { type:'object', properties:{ chunk:{type:'string'}, checked:{type:'number'},
  pass:{type:'number'}, corrected:{type:'number'}, fail:{type:'number'} }, required:['chunk','checked'] }
const results = await pipeline(args.chunks,
  c => agent(extractPrompt(c), { label:`extract:${c.chunk}`, phase:'Extract', schema:EXTRACT_SUMMARY }),
  (r, c) => agent(verifyPrompt(c), { label:`verify:${c.chunk}`, phase:'Verify', schema:VERIFY_SUMMARY })
)
return { perChunk: results, failed: args.chunks.filter((c,i)=>!results[i]) }
```
(`extractPrompt`/`verifyPrompt` are template fills; chunk objects carry all paths. No barriers — verify of chunk N starts the moment its extract finishes.)

## Self-review notes

- Spec point 1 (parallelize) → Tasks 5–7. Spec point 2 (Fable/Opus review) → Task 7 verify stage (inherits Fable) + Task 9 main-agent review. Spec point 3 (tag policy) → apply rules + invariants in Task 8.
- Page-null glossary keywords (240) flow through Task 3 → chunks like everything else; sourceless ones keep tags mechanically.
- Threat quotes/attribution covered; threat abilities matched by name; bestiary-only ids covered via manifest `app` flag.
- Known risk: pdfgrep misses names broken by ligatures/hyphenation → such entries land in `not_found`/`sourceless` and ALL of those get eyeballed in Task 9.1 before acceptance.
- Out of scope (report only): structural drift reconciliation between apps; threat-weapons.json (no prose); keyword-categories.json (no prose).
```
