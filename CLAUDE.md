# CLAUDE.md

> **About this file**: Project-specific memory for Claude Code containing troubleshooting guides, debugging tips, configuration examples, and architectural decisions. See [@AGENTS.md](AGENTS.md) for repository structure, commands, and code standards.

**For repository guidelines, see:** @AGENTS.md

---

## Project Context

**Documentation PDF Scraper** - Puppeteer-based PDF generation with anti-bot bypass and collapsible content expansion

**Stack**: Node.js, Puppeteer-extra, Python PyMuPDF | **Tests**: 516 passing | **Status**: Production-ready

## Quick Reference

**Standard workflow**: `make clean && make run`  
**First-time setup**: `make install`  
**Before commits**: `make test && make lint` (require 516+ passing tests)  
**Kindle profiles**: `make kindle-oasis` or `make kindle-all`

## Critical Architecture Rules

### Config Validation (CRITICAL)
⚠️ **If config field is NOT in Joi schema** (`src/config/configValidator.js:5-282`), **it WILL BE SILENTLY REMOVED** during validation (`stripUnknown: true`)

**Workflow:**
1. Add field to `configValidator.js` Joi schema FIRST
2. Then add to `doc-targets/*.json`
3. Verify with: `node scripts/test-config-loading.js`

**Example failure:** `enablePDFStyleProcessing` was missing from schema → got stripped → feature never ran

### State & Metadata (Single Source of Truth)
⚠️ **Each data type should have ONLY ONE authoritative source**

- `stateManager` → Process state only (URLs, progress, failures)
- `metadataService` → Content metadata only (titles, sections, mappings)
- **Never duplicate data** across services (causes sync bugs)

**Fixed bug:** `articleTitles` was in both StateManager and MetadataService → StateManager overwrote MetadataService's incremental saves with empty Map → PDF TOC showed "Page 0" instead of real titles. **Fix:** Removed `articleTitles` from StateManager entirely.

### Logging Levels
- `error` - Critical failures requiring immediate attention
- `warn` - Recoverable issues that may need investigation
- `info` - **Important operations** (title extraction, PDF generation, file saves) - use for operations you want visible in default logs
- `debug` - Verbose details only needed during development
- ⚠️ **Don't use `debug` for critical operations** - they won't appear in production logs (default level is `info`)

## Configuration Deep Dive

### enablePDFStyleProcessing
Controls execution of `applyPDFStyles()` (scraper.js:562):
- `false` - Safe for most sites, skips DOM replacement, preserves original structure
- `true` - Required for Next.js/React SPAs (like Claude Code) to remove navigation/sidebars

**Effects when enabled:**
- Replaces `document.body.innerHTML` with extracted content only
- Removes navigation, sidebars, breadcrumbs, pagination
- Applies code block wrapping and color fixes

**Location:** Must be defined in `configValidator.js:51-52` AND `doc-targets/*.json`

### navigationStrategy
**Performance impact:** Specifying correct strategy can reduce scraping time by 2-3x (804s → 300s for 44 pages)

- `auto` - Try strategies in default order with fallbacks (safe default)
- `load` - Best for Next.js/React SPAs (Claude Code) - wait for all resources, avoid 90s of failed retries
- `domcontentloaded` - Best for SSR/static sites (OpenAI docs) - fast, wait for HTML parsed only
- `networkidle2` - Fallback for sites with moderate background requests
- `networkidle0` - **AVOID** - fails with analytics/websockets

**When to use:**
- SPA (code.claude.com): `"navigationStrategy": "load"`
- SSR (platform.openai.com): `"navigationStrategy": "domcontentloaded"`
- Unknown: `"navigationStrategy": "auto"`

### Page Load Strategies
Location: `src/core/scraper.js:_collectUrlsFromEntryPoint()`

- `domcontentloaded` (recommended for SPAs): Wait for HTML parsed, 15s timeout + 2s delay for JS execution
- `load`: Wait for all resources (images, CSS), may timeout on sites with persistent requests
- `networkidle0`: Wait for zero connections 500ms - **AVOID** (fails with analytics/websockets)
- `networkidle2`: Allow 2 connections - fallback if `domcontentloaded` too fast

### Claude Code Sections
New `code.claude.com/docs` IA with 7 section entry points:
1. Getting started – `https://code.claude.com/docs/en/overview`
2. Build with Claude Code – `https://code.claude.com/docs/en/sub-agents`
3. Deployment – `https://code.claude.com/docs/en/third-party-integrations`
4. Administration – `https://code.claude.com/docs/en/setup`
5. Configuration – `https://code.claude.com/docs/en/settings`
6. Reference – `https://code.claude.com/docs/en/cli-reference`
7. Resources – `https://code.claude.com/docs/en/legal-and-compliance`

## PDF Generation

### Critical Order
**Scrape FIRST** (collects titles) → **Then merge** (needs `articleTitles.json` for TOC)

**Naming pattern:**
- Individual: `001-page-name.pdf` (zero-padded)
- Merged: `docs.example.com_YYYYMMDD.pdf`

### Auto-Expansion
Always runs, independent of `enablePDFStyleProcessing`:
- Patterns: `<details>`, `[aria-expanded="false"]`, `.hidden`, accordions, tabs
- Detection: aria-controls → nextSibling → parent query
- Result: OpenAI docs 52MB → 67MB (+29% with expanded content)

## Troubleshooting

### 403 Forbidden / 0 URLs
1. Check `browserPool.js` has `puppeteer-extra` import
2. Run `node scripts/test-openai-access.js`
3. Update `allowedDomains` for target site
4. Use generic selectors: `"nav a, aside a, main, article"`

### printToPDF Failed
Set `enablePDFStyleProcessing: false` (collapsible expansion still works)

### Missing Content
Check logs for `特殊内容处理完成 { detailsExpanded: X, ... }` or run:
```bash
node scripts/verify-expansion.js
```

**PDF size check:**
- ~50MB/50 pages = missing content
- ~65-70MB/50 pages = complete

### TOC Issues
- Scrape first for titles
- Set `pdf.bookmarks: true`
- Use zero-padded file names

### articleTitles.json Empty / PDF TOC Shows "Page 0"
**Symptom:** Python merger warns "⚠️ articleTitles.json 为空或不存在", PDF bookmarks show generic names

**Root cause:** Data conflict between StateManager and MetadataService (see Architecture Rules)

**How it happened:** MetadataService saved titles incrementally during scraping → StateManager.save() overwrote file with empty Map at the end

**Evidence:** `articleTitles.json` is 2 bytes (empty `{}`), but scraping logs show titles extracted successfully

**Fix applied (2025-01-08):** Removed `articleTitles` from StateManager entirely, MetadataService is now single source

**Verify fix:** Check `pdfs/metadata/articleTitles.json` is >1KB with actual titles, not empty object

**Related files:** `src/services/stateManager.js` (removed lines 17, 64-71, 138-146, 266-269, 310), `src/services/metadataService.js` (unchanged, already correct)

### Python Logs Not Appearing in Log Files
**Symptom:** Python merger warnings visible in console but missing from `logs/` directory

**Root cause:** Python script only used `logging.StreamHandler()` → writes to stderr, not files

**Fix applied (2025-01-08):** Added `logging.FileHandler` to `src/python/pdf_merger.py:95-103`

**Python logs now written to:** `logs/python_pdf_merger.log`

**Verify:** Check file exists and contains Python warnings/errors (if any occurred)

### Page Load Timeout (45s+)
**Symptom:** Page loads timeout, but `curl` shows fast response (1-2s)

**Root cause:** `waitUntil: 'networkidle0'` waits for zero network connections, fails with persistent background requests (analytics, websockets)

**Fix:** Use `waitUntil: 'domcontentloaded'` (15s timeout) + 2s delay for dynamic content

**Location:** `src/core/scraper.js:_collectUrlsFromEntryPoint()`

**Note:** Never use `page.waitForTimeout()` (removed in new Puppeteer) → use `new Promise(resolve => setTimeout(resolve, ms))`

### Dynamic Content Missing
**Symptom:** Content selectors don't match actual DOM

**Solution:**
1. Run `node scripts/inspect-selectors.js` to check actual DOM structure after JS execution
2. Update selectors in `doc-targets/*.json` based on inspection results
3. Common issue: Generic selectors (`main`, `article`) don't exist in SPA frameworks (Next.js, React)
4. Solution: Inspect with browser DevTools or custom script, use actual IDs/classes (`#content-area`, `[id*='content']`)

### Dark Theme in PDF
**Symptom:** Black background + white text in generated PDF

**Root cause:** CSS variables not overridden, localStorage not cleared, prefers-color-scheme not handled

**Solution implemented** (pdfStyleService.js):
- `removeDarkTheme()` (81-158): Clears localStorage (9 frameworks), sets light classes, modifies meta tags
- `getPDFOptimizedCSS()` (301-379): Overrides 30+ CSS variables, forces body/html colors, handles @media
- `applyPDFStyles()` (773-819): Detects RGB values, converts dark (RGB<50) → white, light text (RGB>200) → black

**Verify fix:** PDF should be white background (#ffffff) + dark text (#000000)

**Supports:** Next.js, Tailwind, Chakra UI, Mantine, Docusaurus, VuePress

### Config Field Not Working
**Symptom:** Field exists in config.json but returns undefined in code

**Root cause:** Field NOT defined in `configValidator.js` Joi schema → stripped by validation (stripUnknown: true)

**Fix:** Add field to `configValidator.js:5-282` BEFORE using in code:
```javascript
myField: Joi.boolean().default(false).description('What it does'),
```

**Verify:** `node scripts/test-config-loading.js` should show field with correct type

**Real example:** `enablePDFStyleProcessing` was missing → feature never ran → navigation stayed in PDF

### Floating UI Elements in PDF
**Symptom:** Floating input boxes, "Ask a question..." prompts, sticky navigation in PDF

**Root cause:** CSS selectors missing from hide rules in `getPDFOptimizedCSS()`

**Solution:** Add selectors to pdfStyleService.js:537-568 hide rules:
```css
.chat-assistant-floating-input,
[class*="chat-assistant"],
[class*="floating-input"],
[id*="assistant-bar"] {
  display: none !important;
}
```

**Pattern:** Use `[class*="pattern"]` for partial matches, `#specific-id` for exact IDs

## Best Practices

### Selectors
Always inspect actual DOM with `scripts/inspect-selectors.js`
- Prefer specific over generic for SPAs
- Static sites: `main, article`
- Dynamic sites: `#content-area, [id*='content']`

### Page Loading
- Use `domcontentloaded` + delay for SPAs
- Avoid `networkidle0` (fails with persistent requests)
- Test with `curl` first to verify actual load time

### Common Errors
- Add config fields to `configValidator.js` first
- Verify selectors match actual DOM (not SSR HTML)
- Update `allowedDomains` when changing sites

### PDF Theme Handling
1. `removeDarkTheme()` ALWAYS runs (scraper.js:547) - safe, no DOM replacement
2. Clears localStorage/sessionStorage for 9 frameworks
3. Sets light classes, modifies meta tags
4. CSS variables override in `getPDFOptimizedCSS()` (30+ variables)
5. Global color detection in `applyPDFStyles()` (if enabled)
6. Result: White background (#ffffff) + dark text (#000000)

### Hiding UI Elements
1. Inspect element in browser DevTools to get class/id
2. Add to `getPDFOptimizedCSS()` hide rules (537-568)
3. Use patterns: `.exact-class`, `#exact-id`, `[class*="partial"]`, `[id*="partial"]`
4. Test with: `make clean && make run`
5. Common patterns: `chat-assistant`, `floating-input`, `sidebar`, `pagination`

## Configuration Examples

### OpenAI (51 pages, 67MB with expanded collapsibles)
```json
{
  "rootURL": "https://platform.openai.com/docs/guides/prompt-engineering",
  "baseUrl": "https://platform.openai.com/docs",
  "navLinksSelector": "nav a[href], aside a[href], [role='navigation'] a[href], .sidebar a[href]",
  "contentSelector": "main, article, [role='main'], .main-content",
  "allowedDomains": ["platform.openai.com", "openai.com"],
  "ignoreURLs": ["docs/pages", "docs/app/api-reference"],
  "sectionEntryPoints": [],
  "enablePDFStyleProcessing": false,
  "navigationStrategy": "domcontentloaded"
}
```

### Claude Code (44 pages, dynamic Next.js app)
```json
{
  "rootURL": "https://code.claude.com/docs/en/overview",
  "baseUrl": "https://code.claude.com/docs/en/",
  "navLinksSelector": "a[href^='/docs/en/'], [id*='sidebar'] a[href], nav a[href]",
  "contentSelector": "#content-area",
  "allowedDomains": ["code.claude.com"],
  "sectionEntryPoints": [
    "https://code.claude.com/docs/en/overview",
    "https://code.claude.com/docs/en/sub-agents",
    "https://code.claude.com/docs/en/third-party-integrations",
    "https://code.claude.com/docs/en/setup",
    "https://code.claude.com/docs/en/settings",
    "https://code.claude.com/docs/en/cli-reference",
    "https://code.claude.com/docs/en/legal-and-compliance"
  ],
  "enablePDFStyleProcessing": true,
  "navigationStrategy": "load"
}
```
**Note:** Uses `enablePDFStyleProcessing: true` to remove navigation/sidebars/floating UI from Next.js app, and `navigationStrategy: "load"` to avoid 90s of timeout retries per page

### Generic Template
Start broad, narrow after inspecting with `node scripts/test-openai-access.js`:
```json
{
  "rootURL": "https://example.com/docs",
  "baseUrl": "https://example.com/docs",
  "navLinksSelector": "nav a, aside a, [role='navigation'] a, [class*='nav'] a",
  "contentSelector": "main, article, [role='main'], [class*='content']",
  "allowedDomains": ["example.com"],
  "enablePDFStyleProcessing": false,
  "navigationStrategy": "auto",
  "concurrency": 3,
  "pageTimeout": 60000
}
```

## Scraping Notes (OpenAI Codex Docs)
- Prefer stable content selectors: `#track-content, main #track-content, main .space-y-12` before falling back to `main/article`
- When un-hiding `.hidden` elements, skip nav/aside/TOC and modal overlays (search dialogs) to avoid blank-overlay PDFs
- Hide ToC/PageActions/copy-link UI (`TableOfContents` astro island, `PageActions`, `[data-anchor-id]`) before printing
- If only the first screen prints, clone the main content container into `document.body` and set `html/body` height/overflow to auto/visible to force multi-page output
