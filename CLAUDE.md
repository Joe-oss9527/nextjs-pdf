# CLAUDE.md

Project-specific instructions for efficient development and maintenance.

## Project Context

- **Purpose**: Documentation PDF scraper with Puppeteer-based PDF generation
- **Architecture**: Dependency injection with modular services
- **Target**: Kindle-optimized PDFs from web documentation
- **Current Status**: Production-ready with comprehensive test coverage (556 tests)

## Essential Commands

```bash
# Complete workflow (most common)
make clean && make run

# Setup (run once)
make install

# Quality assurance (always run before commits)
make test && make lint

# Kindle device profiles
make kindle-oasis    # Single device
make kindle-all      # All devices
```

## Development Guidelines

### Code Standards
- **Indentation**: 2 spaces (JavaScript), 4 spaces (Python)
- **Testing**: Write tests for all new features - maintain 556+ passing tests
- **Error Handling**: Use custom error classes from `src/utils/errors.js`
- **Logging**: Use `createLogger('ServiceName')` with levels: error, warn, info, debug

### Architecture Patterns
- **Services**: Register in `src/core/setup.js` with dependency injection
- **Configuration**: Always validate new options in `src/config/configValidator.js`
- **State Management**: Use `stateManager` for persistence, not direct file operations
- **PDF Processing**: Puppeteer for generation, PyMuPDF for merging

## Configuration Management

### Critical Rules
- **New config options**: Add to `src/config/configValidator.js` first, never just `schema.js`
- **Device profiles**: Store only overrides in `config-profiles/*.json`
- **Security**: All paths validated through `validateSafePath()` function

### Key Settings
- `rootURL`: Starting point for scraping
- `concurrency`: Parallel scrapers (default: 5)
- `pdf.bookmarks`: Enable TOC generation (required: true)
- `pdf.kindleOptimized`: Device-specific optimizations (required: true)

### Workflow Efficiency

**Preferred**: Use Makefile commands (handles config automatically)
```bash
make kindle-oasis    # Switches config + runs generation
make kindle-all      # All device profiles
```

**Manual**: For debugging config issues only
```bash
node scripts/use-kindle-config.js current  # Check status
node scripts/use-kindle-config.js use oasis
```

Available profiles: `kindle7`, `paperwhite`, `oasis`, `scribe`

## PDF Generation Process

### Critical Workflow Order
1. **Scrape first**: Always run scraping to collect page titles
2. **Then merge**: PDF merger requires `articleTitles.json` for proper TOC
3. **Never skip scraping**: Empty title mapping causes generic "Docs YYYYMMDD" TOC entries

### File Naming Convention
- Individual PDFs: `001-page-name.pdf` (zero-padded index)
- Final merged: `docs.example.com_YYYYMMDD.pdf`

## Testing & Quality

### Test Requirements
- **Before any commit**: Run `make test` (must show 556+ tests passing)
- **New features**: Write corresponding tests
- **Clean state**: Always `make clean` before testing

### PDF Styling Philosophy
- **"Fix function, preserve form"**: Minimal intervention approach
- **Dark theme handling**: Convert to print-friendly colors in `pdfStyleService.js`
- **Code blocks**: Force light backgrounds, dark text for readability
- **E-reader optimization**: Test on actual devices when possible

## Troubleshooting Guide

### Environment Issues
```bash
make python-info                    # Check Python setup
./venv/bin/python -c "import fitz"  # Verify PyMuPDF
make clean-venv                     # Recreate Python environment
```

### PDF TOC Problems
- **Generic titles**: Run scraping first to populate `pdfs/metadata/articleTitles.json`
- **Missing bookmarks**: Ensure `pdf.bookmarks: true` in config
- **Wrong order**: Check file naming uses zero-padded indices

### Configuration Debugging
```bash
node scripts/use-kindle-config.js current  # Show active config
make list-configs                           # Available profiles
```

## Security & Best Practices

### Security Requirements
- **Path validation**: All file operations use `validateSafePath()`
- **Input sanitization**: Configuration scripts validate all inputs
- **No secrets**: Never commit API keys or credentials

### Performance Guidelines
- **Memory monitoring**: PDF merger tracks peak usage
- **Concurrent limits**: Respect `concurrency` setting for scraping
- **Cleanup**: Services implement proper `dispose()` methods

### Common Pitfalls
- **Config validation**: New options MUST be added to `configValidator.js`
- **Circular references**: Deep merge functions handle circular objects safely
- **Test isolation**: Clean state between test runs prevents false positives