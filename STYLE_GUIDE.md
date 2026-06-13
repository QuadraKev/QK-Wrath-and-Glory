# Wrath & Glory Projects — Style Guide

This style guide documents the conventions and patterns shared across all four Wrath & Glory projects. All new code and modifications should follow these standards for consistency.

## Projects Covered

| Project | Type | Description |
|---------|------|-------------|
| `wrath-and-glory-bestiary-web` | Static web app | Threat/NPC reference + encounter builder |
| `wrath-and-glory-creator-web` | Static web app | Character creation tool |
| `wrath-and-glory-bestiary` | Electron app | Desktop wrapper for bestiary-web |
| `wrath-and-glory-creator` | Electron app | Desktop wrapper for creator-web |

---

## Architecture

### No Build Step

All web projects are served as static files. There is no bundler, transpiler, or module system. Files are loaded via `<script>` tags in `index.html`.

### Global Object Pattern

Every JavaScript file defines a single `const` global object that acts as a module:

```javascript
// Good — one global object per file
const ThreatsTab = {
    selectedThreatId: null,

    init() { /* ... */ },
    refresh() { /* ... */ },
    render() { /* ... */ }
};
```

Do NOT use ES modules (`import`/`export`), classes, or IIFEs.

### Tab Module Structure

Every tab module follows this interface:

```javascript
const ExampleTab = {
    // --- State properties ---
    searchQuery: '',
    currentFilter: 'all',

    // --- Lifecycle ---
    init() {
        // Set up event listeners. Called once on app start.
    },

    refresh() {
        // Called when the tab is switched to.
        this.render();
    },

    // --- Rendering ---
    render() {
        // Top-level render, delegates to sub-renderers.
    },

    renderSubsection() {
        // Renders a specific part of the UI.
    },

    // --- Event handlers ---
    handleAction() {
        // Responds to user interaction.
    },

    // --- Helpers ---
    helperMethod() {
        // Internal utility.
    }
};
```

Method ordering within a module: state properties, then lifecycle (`init`, `refresh`), then rendering, then event handlers, then helpers.

### State Management

- **Creator app**: Uses `State` object with a listener pattern. Tabs register callbacks via `State.addListener(() => Tab.refresh())`. State changes propagate through `State.notifyListeners()`.
- **Bestiary app**: Uses `EncounterState` and `ThreatBuilderState` for persistent state. Tab-local filter state lives on the tab object itself (e.g., `ThreatsTab.filters`).
- **Auto-save**: Both apps auto-save to `localStorage` with a dirty flag (`isDirty`).

### Data Loading

Data is loaded once via `DataLoader.loadAll()`, cached in a plain object (`DataLoader.cache`), and accessed through getter methods (`DataLoader.getThreat(id)`, etc.). Never re-fetch data that is already cached.

---

## Naming Conventions

### Files

| Type | Convention | Examples |
|------|-----------|----------|
| JS files | kebab-case | `threat-builder-tab.js`, `encounter-state.js`, `data-loader.js` |
| CSS files | kebab-case | `styles.css` |
| Data files | kebab-case | `threats.json`, `ascension-packages.json`, `threat-weapons.json` |

### JavaScript

| Type | Convention | Examples |
|------|-----------|----------|
| Global objects / modules | PascalCase | `ThreatsTab`, `EncounterState`, `DataLoader` |
| Methods and functions | camelCase | `renderThreatList()`, `populateFactionFilters()` |
| Properties and variables | camelCase | `searchQuery`, `threatId`, `currentWounds`, `maxShock` |
| Private properties | `_` prefix + camelCase | `_searchTimer`, `_autoSaveTimer`, `_AUTO_SAVE_KEY` |
| Constants (string keys) | UPPER_SNAKE_CASE | `_AUTO_SAVE_KEY: 'wng-creator-autosave'` |

### HTML

| Type | Convention | Examples |
|------|-----------|----------|
| IDs | kebab-case | `#threat-list`, `#encounter-tier`, `#talent-search` |
| Classes | kebab-case | `.threat-detail-container`, `.filter-btn-group`, `.sheet-body-left` |
| Data attributes | kebab-case | `data-tab`, `data-threat-id`, `data-faction`, `data-deferred` |

### Data IDs

| Context | Convention | Examples |
|---------|-----------|----------|
| Creator data | snake_case | `angel_of_death`, `imperial_citizen` |
| Bestiary threats | snake_case | `chaos_space_marine`, `ork_boy` |
| Apocrypha entries | snake_case + `_aaa` suffix | `rogue_trader_aaa`, `kroot_shaper_aaa` |

---

## CSS Conventions

### CSS Variables

All theming goes through CSS variables in `:root`. Use semantic names:

```css
:root {
    /* Backgrounds */
    --bg-primary: #1a1a2e;
    --bg-secondary: #16213e;
    --bg-tertiary: #0f3460;
    --bg-card: #1f2937;
    --bg-hover: #374151;

    /* Text */
    --text-primary: #e5e7eb;
    --text-secondary: #9ca3af;
    --text-muted: #6b7280;

    /* Accents */
    --accent-gold: #d4af37;
    --accent-gold-dark: #b8960c;
    --accent-red: #dc2626;
    --accent-green: #22c55e;
    --accent-blue: #3b82f6;

    /* Borders */
    --border-color: #374151;
    --border-light: #4b5563;

    /* Layout */
    --sidebar-width: 240px;
    --header-height: 50px;
    --nav-height: 45px;
    --footer-height: 35px;

    /* Typography */
    --font-main: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    --font-mono: 'Consolas', 'Monaco', monospace;

    /* Spacing & Shape */
    --radius-sm: 4px;
    --radius-md: 8px;
    --radius-lg: 12px;

    /* Shadows */
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
    --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);
    --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.5);
}
```

Never use raw color values in component styles — always reference a variable.

### Theme

Dark theme throughout. Navy/dark blue backgrounds with gold accents. Consistent across all four projects.

### Section Comments

Use section headers to organize the stylesheet:

```css
/* ===== Section Name ===== */
```

### Layout

- `#app` uses `position: fixed; inset: 0` (NOT `height: 100vh` — avoids iOS Safari bug)
- Header, tab-nav, and footer: `flex-shrink: 0`
- Content area: `overflow-y: auto; overscroll-behavior: contain`
- Use flexbox for linear layouts, CSS Grid for 2D layouts

### Responsive Breakpoints

| Breakpoint | Purpose |
|-----------|---------|
| `>=1400px` | Wide layout (2-column character sheet, expanded panels) |
| `<=1024px` | Medium — stack side-by-side panels vertically |
| `<=768px` | Mobile — sidebar becomes drawer, single-column everything |

---

## HTML Conventions

### Tab Navigation

Tabs use `data-tab` attributes on buttons. The `App.switchTab()` method shows/hides `.tab-content` divs by toggling the `.active` class.

```html
<button class="tab-btn active" data-tab="threats">Threats</button>
<div id="tab-threats" class="tab-content active">...</div>
```

### Modals

Modals are created once in a tab's `init()` and toggled with the `hidden` class:

```html
<div id="example-modal" class="modal hidden">
    <div class="modal-content">
        <div class="modal-header">
            <h3>Title</h3>
            <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">...</div>
        <div class="modal-footer">
            <button class="btn-secondary">Cancel</button>
            <button class="btn-primary">Confirm</button>
        </div>
    </div>
</div>
```

Modal containers must be inside `#app` (for stacking context). Use `z-index: 2000` for modals.

### Dynamic HTML

Use template literals for dynamic content. Prefer `innerHTML` assignment for bulk updates:

```javascript
container.innerHTML = items.map(item =>
    `<div class="item-card" data-id="${item.id}">
        <h4>${item.name}</h4>
        <p>${item.description}</p>
    </div>`
).join('');
```

---

## JavaScript Patterns

### Event Handling

- Use `addEventListener`, never inline `onclick` attributes.
- Use **event delegation** with `closest()` for dynamic/repeated content:

```javascript
container.addEventListener('click', (e) => {
    const card = e.target.closest('.item-card');
    if (!card) return;
    this.handleCardClick(card.dataset.id);
});
```

- Use **debounce** for search inputs (200–300ms):

```javascript
searchInput.addEventListener('input', (e) => {
    this.searchQuery = e.target.value;
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.render(), 300);
});
```

### Performance

- **Deferred rendering**: Use `data-deferred` attribute on expandable items. Render body content only on first expand.
- **Progressive rendering**: Render large lists in batches of 100, loading more on scroll.
- **Event delegation**: One listener on the container, not one per item.
- **Search debounce**: 200–300ms timeout on input events.
- **Cache data**: Use `DataLoader.cache` — never re-fetch loaded JSON.

### Comments

Use `//` single-line comments. Place a comment above a method when its purpose isn't obvious from the name. Don't over-comment straightforward code.

```javascript
// Good — explains why
// SIF module not emulated; return success immediately
init() { /* ... */ },

// Bad — restates what the code does
// Initializes the tab
init() { /* ... */ },
```

### Error Handling

Use `try/catch` only around I/O operations (file load/save, JSON parsing). Don't wrap internal logic. Log errors with `console.error()`.

### String Formatting

Use template literals for string interpolation. Use `.join('')` for arrays of HTML strings. Avoid string concatenation with `+` for multi-part HTML.

---

## Data File Conventions

### Location

All game data lives in `data/` as JSON files.

### Source Field Values

**Creator app** (lowercase shortcodes):
`core`, `fspg`, `church`, `aeldari`, `redacted1`, `redacted2`, `voa`, `shotguns`, `dh`, `apocrypha`

**Bestiary app** (full names):
`"Core Rules"`, `"Forsaken System Player Guide"`, `"Church of Steel"`, `"Abundance of Apocrypha"`, etc.

### Common Data Patterns

- **IDs**: snake_case. Apocrypha content uses `_aaa` suffix to avoid collisions.
- **Traits/Keywords**: Arrays of uppercase strings (`["IMPERIUM", "ADEPTUS ASTARTES"]`).
- **Missing/N/A values**: Use `"-"` string (not `null` or `0`) for display fields like shock.
- **Speed**: Always integer. Use a separate `speedNote` field for text like `"Flight"`.
- **Page references**: Use `source` and `page` fields. Don't embed page numbers in description text.
- **AI-generated content**: Mark with `[AI-Generated]` annotation if no source PDF text exists.

---

## Electron App Conventions

### Security

- `contextIsolation: true` — renderer cannot access Node.js.
- `nodeIntegration: false` — all Node.js calls go through the preload bridge.
- All file I/O uses `ipcRenderer.invoke()` through the preload `api` object.

### Preload Bridge

Expose a minimal API via `contextBridge.exposeInMainWorld('api', { ... })`. Each method returns a Promise from `ipcRenderer.invoke()`.

### Window Config

- Default: 1400×900, min 1200×700.
- Menu bar hidden.
- Data directory: `path.join(__dirname, 'data')`.

---

## Workflow Rules

### Cache Busting

When modifying CSS or JS files, bump the `?v=N` query string on **all** `<script>` and `<link>` tags in `index.html`. Always bump all version numbers together.

```html
<link rel="stylesheet" href="css/styles.css?v=42">
<script src="js/app.js?v=42"></script>
```

### Glossary Sync

The `glossary.json` file must be kept in sync between bestiary and creator apps. Both share the same categories: `characterTerms`, `conditions`, `combatTerms`, `terms`, `weaponTraits`, `armorTraits`, `keywords`, `psychicPowers`. When adding terms to one app, copy to the other.

### GitHub Issues

Do NOT close issues until the user confirms resolution. After closing, post a summary comment (what was wrong, what changed, relevant commit hash).

### Commits

Push using the QuadraKev PAT for GitHub Pages deploys. The QuadraKev-bot PAT is for issues/comments only.

### PDFs

Always use the Read tool to view PDFs visually. Never use `pdftotext` — it garbles 2-column layouts.
