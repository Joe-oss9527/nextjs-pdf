# AGENTS.md

A comprehensive guide for AI coding agents working on this documentation PDF scraper project.

## Project Overview

**Documentation PDF Scraper** - A Puppeteer-based system for generating PDFs from documentation sites with anti-bot bypass and collapsible content expansion capabilities.

**Tech Stack:** Node.js ESM, Puppeteer-extra (stealth), Python PyMuPDF for merging  
**Test Coverage:** 516+ passing tests  
**Status:** Production-ready

## Quick Start

```bash
# First-time setup
make install

# Standard workflow
make clean && make run

# Before commits (required)
make test && make lint  # Must show 516+ passing tests
```

## Project Structure & Architecture

### Directory Layout
```
src/
├── app.js                    # Entry point
├── core/                     # DI container, setup, scraper orchestration
├── services/                 # Core services (browser, page, PDF, queue, etc.)
├── config/                   # Schema, loader, validator
├── utils/                    # Logger, errors, URL helpers
└── python/                   # PyMuPDF merge scripts

tests/                        # Mirrors src/ structure
pdfs/                         # Generated artifacts (gitignored)
config.json                   # Root configuration
doc-targets/                  # Pre-configured site targets
config-profiles/              # Kindle device profiles
```

### Service Architecture

**Dependency Injection:** All services registered in `src/core/setup.js`

**Single Source of Truth Principle:**
- Each data type has ONE authoritative source to prevent conflicts
- `stateManager` → Process state only (URLs, progress, failures)
- `metadataService` → Content metadata only (titles, sections, mappings)
- Never duplicate data across services

**PDF Generation Flow:**
1. Puppeteer generates individual PDFs
2. PyMuPDF merges with bookmarks using `articleTitles.json`

## Build, Test, and Development Commands

### Core Commands
```bash
make install          # Install Node + Python deps (creates venv/)
make run             # Scrape and generate PDFs
npm start            # Alternative to make run
make clean           # Remove pdfs/*, metadata, temp files
```

### Testing & Quality
```bash
npm test             # Run all Jest tests
make test            # Same as npm test
npm run lint         # ESLint checks
npm run lint:fix     # Auto-fix linting issues
```

### Documentation Targets
```bash
npm run docs:openai      # Switch to OpenAI config
npm run docs:claude      # Switch to Claude Code config
npm run docs:list        # List available targets
make docs-current        # Show current root/base URLs
```

### Kindle Profiles
```bash
make kindle-oasis        # Single device profile
make kindle-all          # All profiles (kindle7, paperwhite, oasis, scribe)
node scripts/use-kindle-config.js current  # Debug current config
```

### Debugging Scripts
```bash
node scripts/test-openai-access.js           # Verify anti-bot stealth bypass
node scripts/test-pdf-generation.js          # Test PDF generation configs
node scripts/inspect-collapsible.js          # Analyze collapsible DOM
node scripts/verify-expansion.js             # Validate content expansion
node scripts/inspect-selectors.js            # Check actual DOM structure
node scripts/test-config-loading.js          # Verify config validation
```

### Environment Info
```bash
make python-info         # Show Python/pip versions
npm list puppeteer-extra # Verify puppeteer installation
make clean-venv          # Remove and recreate Python venv
```

## Code Standards & Conventions

### Language & Style
- **JavaScript:** ESM modules (`type: module`), Node.js ≥ 16
- **Async patterns:** Use `async/await`, avoid callbacks
- **Indentation:** 2 spaces (JavaScript), 4 spaces (Python)
- **Naming:**
  - Variables/functions: `camelCase`
  - Classes: `PascalCase`
  - Service files: end with `Service` (e.g., `PythonMergeService.js`)
  - Manager files: end with `Manager` (e.g., `StateManager.js`)

### Error Handling
- Use custom error classes from `src/utils/errors.js`
- Available types: `NetworkError`, `ValidationError`, `ConfigurationError`, etc.

### Logging Strategy
- Use `createLogger('ServiceName')` from `src/utils/logger.js`
- Avoid raw `console` statements in application code
- **Levels:**
  - `error` - Critical failures requiring immediate attention
  - `warn` - Recoverable issues that may need investigation
  - `info` - Important operations (title extraction, PDF saves) - visible in production
  - `debug` - Verbose details only needed during development
- **Important:** Use `info` level for operations you want visible in production logs (default level)

### Linting
- Configuration: `eslint.config.js`
- Run `npm run lint` before all pull requests
- Auto-fix when possible: `npm run lint:fix`

## Testing Guidelines

### Framework & Structure
- **Framework:** Jest with Babel
- **Location:** `tests/**/*.test.js`
- **Structure:** Mirror source directory (e.g., `src/core/setup.js` → `tests/core/setup.test.js`)

### Testing Requirements
- Write tests for all new public functions
- Cover error paths and edge cases
- Maintain 516+ passing tests before commits
- Always run `make clean` before testing to ensure clean state

### Test Workflow
```bash
# Run all tests
npm test

# Watch mode during development
npm test -- --watch

# Run specific test file
npm test -- tests/services/fileService.test.js
```

## Configuration

### Essential Settings

**URL Configuration:**
- `rootURL` - Starting URL for scraping
- `baseUrl` - URL prefix filter (only crawl URLs starting with this)
- `allowedDomains` - Domain whitelist array (e.g., `["platform.openai.com"]`)
- `sectionEntryPoints` - Additional root URLs for multi-section docs

**Selectors (inspect actual DOM, not SSR HTML):**
- `navLinksSelector` - CSS selector for navigation links
- `contentSelector` - CSS selector for main content area
- Use `scripts/inspect-selectors.js` to find correct selectors

**Performance:**
- `concurrency` - Number of parallel scrapers (default: 5)
- `pageTimeout` - Max navigation time in ms (default: 45000, reduce to 15000 for `domcontentloaded`)

**PDF Processing:**
- `enablePDFStyleProcessing` - Enable CSS transforms and DOM manipulation (default: false)
  - `false` - Safe for most sites, preserves original structure
  - `true` - Required for Next.js/React SPAs to remove navigation/sidebars
  - Must be defined in `src/config/configValidator.js` FIRST

**Navigation Strategy:**
- `navigationStrategy` - Page load strategy (default: `auto`)
  - `auto` - Try strategies in order: `domcontentloaded` → `networkidle2` → `networkidle0` → `load`
  - `domcontentloaded` - Best for SSR/static sites (fastest)
  - `load` - Best for Next.js/React SPAs (avoid timeout retries)
  - `networkidle2` - Fallback for moderate background requests
  - `networkidle0` - Avoid (fails with analytics/websockets)

### Configuration Validation Workflow

⚠️ **CRITICAL - Prevents silent failures:**
1. Add field to `src/config/configValidator.js` Joi schema FIRST
2. Then add to `doc-targets/*.json`
3. Test with `node scripts/test-config-loading.js`
4. Verify field appears with correct type (not undefined)

**Why:** Fields not in Joi schema are silently removed during validation (`stripUnknown: true`)

## Security & Best Practices

### Security
- Use `validateSafePath()` for all file operations
- Never commit secrets or API keys
- Validate all configuration inputs
- Keep `allowedDomains` strict
- Default headless browser recommended

### Performance
- Respect `concurrency` setting to avoid overwhelming target sites
- Monitor PDF merger memory usage
- Implement `dispose()` methods in services for proper cleanup

### Git Workflow
- **Commit style:** Conventional Commits (`feat:`, `fix:`, `perf:`, `refactor:`, `docs:`)
- **Before commits:** `make test && make lint` (require 516+ passing)
- **Pull requests:** Include clear description, linked issues, reproduction notes, before/after logs

### Ignored Files
- Do not commit: PDFs, logs, or `venv/` (already in `.gitignore`)

## Common Workflows

### Adding a New Documentation Target

1. **Inspect the site:**
   ```bash
   node scripts/inspect-selectors.js
   ```

2. **Create config file:**
   ```bash
   # Create doc-targets/new-site.json
   {
     "rootURL": "https://example.com/docs",
     "baseUrl": "https://example.com/docs",
     "navLinksSelector": "nav a, aside a",
     "contentSelector": "main, article",
     "allowedDomains": ["example.com"],
     "enablePDFStyleProcessing": false,
     "navigationStrategy": "auto"
   }
   ```

3. **Test anti-bot bypass:**
   ```bash
   node scripts/test-openai-access.js
   ```

4. **Run scraper:**
   ```bash
   node scripts/use-doc-target.js use new-site
   make clean && make run
   ```

### Adding a New Configuration Option

1. **Add to Joi schema** in `src/config/configValidator.js`:
   ```javascript
   myNewOption: Joi.boolean().default(false).description('What it does'),
   ```

2. **Update doc-targets** as needed

3. **Verify:**
   ```bash
   node scripts/test-config-loading.js
   # Should show myNewOption with correct type
   ```

### Scraping Workflow

**Critical order:** Scrape FIRST (collects titles) → Then merge (needs `articleTitles.json` for TOC)

1. **Clean previous run:**
   ```bash
   make clean
   ```

2. **Run scraper:**
   ```bash
   make run
   ```

3. **Verify output:**
   - Individual PDFs: `001-page-name.pdf` (zero-padded)
   - Merged PDF: `docs.example.com_YYYYMMDD.pdf`
   - Metadata: `pdfs/metadata/articleTitles.json` should be >1KB with actual titles

### Creating Kindle-Optimized PDFs

```bash
# Single device
make kindle-oasis

# All devices
make kindle-all  # Generates PDFs for kindle7, paperwhite, oasis, scribe

# Check current config
node scripts/use-kindle-config.js current
```
