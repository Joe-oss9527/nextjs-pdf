# CLAUDE.md

**Documentation PDF Scraper** - Puppeteer-based PDF generation with anti-bot bypass and collapsible content expansion

**Stack**: Node.js, Puppeteer-extra, Python PyMuPDF | **Tests**: 556 passing | **Status**: Production-ready

## Quick Start

**Standard workflow**: `make clean && make run`
**First-time setup**: `make install`
**Before commits**: `make test && make lint` (require 556+ passing tests)
**Kindle profiles**: `make kindle-oasis` or `make kindle-all`

## Code Standards

**Indentation**: 2 spaces (JS), 4 spaces (Python)
**Testing**: All features need tests → maintain 556+ passing
**Errors**: Use custom classes from `src/utils/errors.js` (NetworkError, ValidationError, etc.)
**Logging**: `createLogger('ServiceName')` with levels: error, warn, info, debug

## Architecture Rules

**Services**: Register in `src/core/setup.js` with dependency injection
**Config**: Add new options to `src/config/configValidator.js` FIRST, never just schema.js
**State**: Use `stateManager` for persistence, NOT direct file operations
**PDF flow**: Puppeteer generates → PyMuPDF merges with bookmarks

## Configuration

**Essential settings**:
- `rootURL`: Start URL | `baseUrl`: URL prefix filter
- `navLinksSelector`: Nav links CSS (inspect actual DOM, not SSR HTML)
- `contentSelector`: Content area CSS (use `scripts/inspect-selectors.js` to find correct selector)
- `allowedDomains`: Domain whitelist array `["platform.openai.com"]`
- `concurrency`: Parallel scrapers (default: 5)
- `pageTimeout`: Max navigation time (default: 45000ms, reduce to 15000ms for `domcontentloaded`)
- `enablePDFStyleProcessing`: CSS transforms (default: false, true causes printToPDF errors)
- `sectionEntryPoints`: Extra root URLs for multi-section docs (Claude Code has 7)

**Page load strategies** (in `src/core/scraper.js:_collectUrlsFromEntryPoint()`):
- `domcontentloaded` (recommended for SPAs): Wait for HTML parsed, 15s timeout + 2s delay for JS execution
- `load`: Wait for all resources (images, CSS), but may timeout on sites with persistent requests
- `networkidle0`: Wait for zero connections 500ms - **AVOID** (fails with analytics/websockets)
- `networkidle2`: Allow 2 connections - fallback if `domcontentloaded` too fast

**Doc targets**:
- `node scripts/use-doc-target.js use openai` (or `npm run docs:openai`)
- `node scripts/use-doc-target.js use claude-code` (or `npm run docs:claude`)
- `make docs-current` to confirm current root/base URLs

**Claude Code sections** (new `code.claude.com/docs` IA):
1. Getting started – `https://code.claude.com/docs/en/overview`
2. Build with Claude Code – `https://code.claude.com/docs/en/sub-agents`
3. Deployment – `https://code.claude.com/docs/en/third-party-integrations`
4. Administration – `https://code.claude.com/docs/en/setup`
5. Configuration – `https://code.claude.com/docs/en/settings`
6. Reference – `https://code.claude.com/docs/en/cli-reference`
7. Resources – `https://code.claude.com/docs/en/legal-and-compliance`

**Profiles**: `make kindle-oasis` (single) or `make kindle-all` (all: kindle7, paperwhite, oasis, scribe)
**Debug config**: `node scripts/use-kindle-config.js current`

## PDF Generation

**Critical order**: Scrape FIRST (collects titles) → Then merge (needs `articleTitles.json` for TOC)
**Naming**: `001-page-name.pdf` (zero-padded) → `docs.example.com_YYYYMMDD.pdf` (merged)

**Auto-expansion** (always runs, independent of `enablePDFStyleProcessing`):
- Patterns: `<details>`, `[aria-expanded="false"]`, `.hidden`, accordion, tabs
- Detection: aria-controls → nextSibling → parent query
- Result: OpenAI docs 52MB → 67MB (+29% with expanded content)

## Testing

**Before commits**: `make test && make lint` (require 556+ passing tests)
**New features**: Write tests first
**Clean state**: Always `make clean` before testing

## Debugging Scripts

**Anti-bot**: `node scripts/test-openai-access.js` (verify stealth bypass)
**PDF generation**: `node scripts/test-pdf-generation.js` (test different configs)
**Collapsibles**: `node scripts/inspect-collapsible.js` (analyze DOM), `node scripts/verify-expansion.js` (validate extraction)
**Selectors**: `node scripts/inspect-selectors.js` (check actual DOM structure after JS execution, find correct content/nav selectors)

## Troubleshooting

**403 Forbidden / 0 URLs**:
1. Check `browserPool.js` has `puppeteer-extra` import
2. Run `node scripts/test-openai-access.js`
3. Update `allowedDomains` for target site
4. Use generic selectors: `"nav a, aside a, main, article"`

**printToPDF failed**: Set `enablePDFStyleProcessing: false` (collapsible expansion still works)

**Missing content**: Check logs for `特殊内容处理完成 { detailsExpanded: X, ... }` or run `node scripts/verify-expansion.js`

**PDF size check**: ~50MB/50 pages = missing content | ~65-70MB/50 pages = complete

**TOC issues**: Scrape first for titles | Set `pdf.bookmarks: true` | Use zero-padded file names

**Page load timeout (45s+)**: Check `waitUntil` setting in `scraper.js`
- Symptom: Page loads timeout, but `curl` shows fast response (1-2s)
- Root cause: `waitUntil: 'networkidle0'` waits for zero network connections, fails with persistent background requests (analytics, websockets)
- Fix: Use `waitUntil: 'domcontentloaded'` (15s timeout) + 2s delay for dynamic content
- Location: `src/core/scraper.js:_collectUrlsFromEntryPoint()`
- Never use: `page.waitForTimeout()` (removed in new Puppeteer) → use `new Promise(resolve => setTimeout(resolve, ms))`

**Dynamic content missing**: Content selectors don't match actual DOM
1. Run `node scripts/inspect-selectors.js` to check actual DOM structure after JS execution
2. Update selectors in `doc-targets/*.json` based on inspection results
3. Common issue: Generic selectors (`main`, `article`) don't exist in SPA frameworks (Next.js, React)
4. Solution: Inspect with browser DevTools or custom script, use actual IDs/classes (`#content-area`, `[id*='content']`)

**Environment**: `make python-info` | `npm list puppeteer-extra` | `make clean-venv`

## Best Practices

**Security**: Use `validateSafePath()` for files | Never commit secrets | Validate all config inputs
**Performance**: Respect `concurrency` setting | Monitor PDF merger memory | Implement service `dispose()`
**Selectors**: Always inspect actual DOM with `scripts/inspect-selectors.js` | Prefer specific over generic for SPAs | Static sites: `main, article` | Dynamic sites: `#content-area, [id*='content']`
**Page loading**: Use `domcontentloaded` + delay for SPAs | Avoid `networkidle0` (fails with persistent requests) | Test with `curl` first to verify actual load time
**Common errors**: Config to `configValidator.js` first | Verify selectors match actual DOM (not SSR HTML) | Update `allowedDomains` when changing sites

## Config Examples

**OpenAI** (51 pages, 67MB with expanded collapsibles):
```json
{
  "rootURL": "https://platform.openai.com/docs/guides/prompt-engineering",
  "baseUrl": "https://platform.openai.com/docs",
  "navLinksSelector": "nav a[href], aside a[href], [role='navigation'] a[href], .sidebar a[href]",
  "contentSelector": "main, article, [role='main'], .main-content",
  "allowedDomains": ["platform.openai.com", "openai.com"],
  "ignoreURLs": ["docs/pages", "docs/app/api-reference"],
  "sectionEntryPoints": [],
  "enablePDFStyleProcessing": false
}
```

**Claude Code (code.claude.com)** (44 pages, dynamic Next.js app):
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
  "enablePDFStyleProcessing": false
}
```

**Generic template** (start broad, narrow after inspecting with `node scripts/test-openai-access.js`):
```json
{
  "rootURL": "https://example.com/docs",
  "baseUrl": "https://example.com/docs",
  "navLinksSelector": "nav a, aside a, [role='navigation'] a, [class*='nav'] a",
  "contentSelector": "main, article, [role='main'], [class*='content']",
  "allowedDomains": ["example.com"],
  "enablePDFStyleProcessing": false,
  "concurrency": 3,
  "pageTimeout": 60000
}
```
