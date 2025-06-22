# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

Documentation PDF scraper with Puppeteer PDF generation. Scrapes documentation pages and converts them to PDF using dependency injection architecture.

## Quick Start

```bash
# Setup (run once)
make install

# Daily workflow
make clean && make run

# Development
make test
make lint
```

## Architecture

- **Application**: `src/app.js` - Main entry point
- **Core**: `src/core/` - Container, scraper, setup
- **Services**: `src/services/` - Modular services with dependency injection
- **Config**: `src/config/` - Configuration loading and validation
- **Python**: `src/python/` - PDF merging scripts

## Configuration

⚠️ **Important**: Add new config options to `src/config/configValidator.js`, not `schema.js`.

Key options in `config.json`:
- `rootURL` - Starting point for scraping
- `baseUrl` - URL prefix filter (optional)
- `engine` - PDF engine: `"puppeteer"` (only option)
- `concurrency` - Parallel scrapers

## PDF Engine

**Puppeteer** - Fast, reliable PDF generation with good typography and styling

File naming: `001-page.pdf`

## Development Guidelines

### Service Architecture
- Services registered in `src/core/setup.js`
- Use dependency injection container
- Implement cleanup methods

### Configuration
- Access via `await container.get('config')`
- Validate with Joi schemas

### Logging
- Use `createLogger('ServiceName')`
- Levels: error, warn, info, debug

### Testing
```bash
npm test        # Run tests
npm run test:watch  # Watch mode
```

### PDF Styling
- Philosophy: "Fix function, preserve form"
- Minimal intervention approach
- Preserve original website design
- Convert dark themes for print readability

## Debugging

```bash
# Check Python environment
make python-info

# Test PDF generation
# Config is automatically set to "puppeteer"

# Verify Python dependencies (for merging)
./venv/bin/python -c "import fitz; print('PyMuPDF OK')"
```

## Common Issues

### Configuration
**Config options not working**: Verify you added them to `configValidator.js`, not just `schema.js`.

### Testing
**Clean before testing**: Always run `make clean` before testing to avoid stale files.

### PDF Styling Issues

**Dark theme code blocks**: Dark backgrounds with white text become unreadable in PDFs.
- **Solution**: Force light backgrounds and dark text for all code elements
- **Files**: `src/services/pdfStyleService.js`

**Syntax highlighting broken**: Code loses readability when themes are converted.
- **Solution**: Reset all syntax highlighting tokens to print-friendly colors
- **Prevention**: Test all code blocks in generated PDFs, especially on e-readers