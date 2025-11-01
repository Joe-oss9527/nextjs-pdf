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
- `navLinksSelector`: Nav links CSS (use multiple: `"nav a, aside a"`)
- `contentSelector`: Content area CSS (use multiple: `"main, article"`)
- `allowedDomains`: Domain whitelist array `["platform.openai.com"]`
- `concurrency`: Parallel scrapers (default: 5)
- `enablePDFStyleProcessing`: CSS transforms (default: false, true causes printToPDF errors)

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

**Environment**: `make python-info` | `npm list puppeteer-extra` | `make clean-venv`

## Best Practices

**Security**: Use `validateSafePath()` for files | Never commit secrets | Validate all config inputs
**Performance**: Respect `concurrency` setting | Monitor PDF merger memory | Implement service `dispose()`
**Common errors**: Config to `configValidator.js` first | Use generic selectors (`nav a, main`) not specific (`#sidebar`) | Update `allowedDomains` when changing sites

## Config Examples

**OpenAI** (51 pages, 67MB with expanded collapsibles):
```json
{
  "rootURL": "https://platform.openai.com/docs/guides/prompt-engineering",
  "baseUrl": "https://platform.openai.com/docs",
  "navLinksSelector": "nav a, aside a",
  "contentSelector": "main, article",
  "allowedDomains": ["platform.openai.com"],
  "enablePDFStyleProcessing": false
}
```

**Claude Docs**:
```json
{
  "rootURL": "https://docs.claude.com/en/docs/claude-code/overview",
  "baseUrl": "https://docs.claude.com/en/docs/claude-code/",
  "navLinksSelector": "#sidebar a[href]",
  "contentSelector": "#content-area",
  "allowedDomains": ["docs.claude.com"]
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