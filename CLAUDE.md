# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a documentation PDF scraper with enterprise-grade architecture and **dual-engine PDF generation**. It scrapes documentation pages and converts them to PDF format using either Puppeteer, Pandoc+weasyprint, or both engines simultaneously. Features Python-based intelligent merging with automatic dual-engine detection.

## Architecture

The project uses a modular dependency injection architecture with 8 layers:

1. **Application Layer** (`src/app.js`) - Main entry point and lifecycle management
2. **Core Layer** (`src/core/`) - Container, setup, scraper, and Python runner
3. **Services Layer** (`src/services/`) - Specialized services for different responsibilities
4. **Configuration Layer** (`src/config/`) - Config loading and validation  
5. **Utilities Layer** (`src/utils/`) - Common utilities, logging, errors
6. **Python Integration** (`src/python/`) - PDF merging and config management
7. **Tests** (`tests/`) - Test suites for services and utilities
8. **Configuration** - External JSON config with Joi validation

### Key Components

- **Dependency Injection Container** (`src/core/container.js`) - Manages service lifecycles and dependencies
- **Service Registration** (`src/core/setup.js`) - Registers all services with proper dependencies
- **Main Application** (`src/app.js`) - Orchestrates scraping and PDF merge workflow
- **Dual-Engine PDF System** (`src/core/scraper.js`) - Supports Puppeteer, Pandoc, or both engines
- **Configuration System** - External `config.json` with validation via Joi schemas
- **Intelligent PDF Styling** (`src/services/pdfStyleService.js`) - Minimal intervention approach to preserve original web design

## Common Commands

### Quick Start with Makefile (Recommended)

```bash
# Setup (run once)
make install                 # Install all dependencies (Python + Node.js)

# Daily workflow
make clean                   # Clean previous PDFs and metadata (recommended before testing)
make run                     # Generate PDF documentation
make run-clean              # Clean + generate in one command

# Development
make test                   # Run integration tests
make demo                   # Run demo with detailed output
make lint                   # Run linter
make lint-fix              # Fix linting issues
make python-info           # Show Python environment info
```

### NPM Commands (Alternative)

```bash
# Development
npm start                    # Run the complete scraping workflow
npm run start:clean         # Clean output directories and run
npm run clean               # Remove all generated PDFs and metadata

# Testing  
npm test                    # Run integration tests
npm run test:demo           # Run demo with detailed output
npm run test:watch          # Run tests in watch mode

# Code Quality
npm run lint                # Lint JavaScript files
npm run lint:fix            # Lint and auto-fix issues
```

### Python Dependencies (Manual Setup)

```bash
# Virtual environment setup
python3 -m venv venv
source venv/bin/activate     # Linux/Mac
./venv/Scripts/activate      # Windows

# Install dependencies
pip install -r requirements.txt
```

### Important: Clean Before Testing

⚠️ **Always run `make clean` or `npm run clean` before testing** to remove previous PDFs and metadata files that might interfere with testing results.

## Development Guidelines

### Service Architecture
- All services are registered in `src/core/setup.js` with proper dependency injection
- Services should have dispose/cleanup methods for graceful shutdown
- Use the container to resolve dependencies rather than direct imports

#### PDF Styling Strategy
- **PDFStyleService** - Implements minimal intervention approach for PDF styling
  - **Design Philosophy**: "Fix the function, preserve the form"
  - **Original Style Preservation**: Maintains source website's fonts, colors, and layout design
  - **Code Wrapping Fix**: Ensures long code lines wrap properly without changing visual appearance
  - **Smart Theme Handling**: Only converts dark themes to light for print readability
  - **Kindle Optimization**: 确保在Kindle等设备上有良好的阅读体验，同时不会"过度优化"而破坏原始网页的设计美感
  - **E-reader Compatibility**: Tagged PDF generation for improved accessibility

#### Engine-Specific Services
- **PandocPDFService** - Handles Pandoc+weasyprint PDF generation with enhanced style preservation

### Configuration Management
- Main config in `config.json` - validated with Joi schemas in `src/config/schema.js`
- Access config through the container: `await container.get('config')`
- Config is loaded and validated on startup

### Logging
- Structured logging with Winston via `src/utils/logger.js`
- Use context-specific loggers: `createLogger('ServiceName')`
- Log levels: error, warn, info, debug

### Error Handling
- Custom error classes in `src/utils/errors.js`
- Graceful shutdown with signal handlers in Application class
- Comprehensive try/catch with proper cleanup

### State Management
- StateManager service handles persistence and recovery
- ProgressTracker monitors scraping progress
- QueueManager handles concurrent task processing

### Browser Management
- BrowserPool manages Puppeteer instances
- PageManager handles page lifecycle
- Automatic cleanup and resource management

## Testing Strategy

The project uses integration tests rather than unit tests:
- `test-stage8-integration.js` - Full integration test suite
- `demo-stage8.js` - Demo with detailed component testing
- Tests cover container setup, services, Python integration, and full workflow

## Dual-Engine PDF Generation

The system supports three PDF generation modes:

### Engine Modes

1. **Puppeteer Only** (`"engine": "puppeteer"`)
   - Fast generation using Chrome/Chromium
   - Good for quick prototyping
   - Files named: `001-page-name.pdf`

2. **Pandoc Only** (`"engine": "pandoc"`)
   - High-quality output using Pandoc + weasyprint
   - Better typography and print-optimized styling
   - Files named: `001-page-name.pdf`

3. **Dual Engine** (`"engine": "both"`)
   - Generates both versions simultaneously
   - Compare output quality between engines
   - Files named: `001-page-name_puppeteer.pdf` and `001-page-name_pandoc.pdf`
   - Final merged PDFs: `domain_puppeteer_date.pdf` and `domain_pandoc_date.pdf`

### How Dual-Engine Works

1. **Individual Page Generation**: Each page generates two PDF files with engine-specific suffixes
2. **Automatic Detection**: Python merger detects dual-engine mode by file naming patterns
3. **Separate Merging**: Creates two final merged documents, one for each engine
4. **Quality Comparison**: Allows side-by-side comparison of PDF generation approaches

## Python Integration

PDF merging is handled by Python scripts with intelligent dual-engine support:
- `src/python/pdf_merger.py` - Main PDF merging logic using PyMuPDF with dual-engine detection
- `src/python/config_manager.py` - Python config handling
- PythonMergeService orchestrates Node.js to Python communication
- Python dependencies defined in `requirements.txt`
- Automatic engine filtering and separate merging for dual-engine mode

## File Structure Conventions

- Services in `src/services/` follow naming pattern: `ServiceName.js` with class exports
- Core components in `src/core/` handle fundamental application logic
- Utilities in `src/utils/` provide common functionality
- Configuration logic isolated in `src/config/`
- Python scripts in `src/python/` for PDF processing

## Configuration

Main configuration file `config.json` includes:
- `rootURL` - Target documentation URL
- `concurrency` - Number of parallel scrapers  
- `pdfDir` - Output directory for PDFs
- `browser` - Puppeteer browser settings
- `queue` - Queue management settings
- `python` - Python executable and timeout settings
- `monitoring` - Health check and progress settings
- `pdf` - PDF generation and styling options:
  - **`engine`** - PDF generation engine: `"puppeteer"`, `"pandoc"`, or `"both"`
  - `theme` - PDF theme mode ('light' or 'dark')
  - `preserveCodeHighlighting` - Keep syntax highlighting in code blocks
  - `enableCodeWrap` - Enable code line wrapping to prevent overflow
  - `fontSize` - Base font size for PDF content
  - `fontFamily` - Font family for body text
  - `codeFont` - Font family for code blocks
  - `pandoc` - Pandoc-specific settings:
    - `pdfEngine` - Pandoc PDF engine (weasyprint, prince, wkhtmltopdf, pagedjs-cli)
    - `cssFile` - Custom CSS file for Pandoc styling
    - `options` - Additional Pandoc command line options

## Debugging and Monitoring

- Health checks available via `Application.healthCheck()`
- Container health via `getContainerHealth(container)`
- Progress tracking via ProgressTracker service
- Structured logging with context information
- Graceful shutdown with resource cleanup
- Dual-engine mode automatically detected and logged during merging

## Best Practices for Development

### Testing Different PDF Engines

1. **Start with Clean State**: Always run `make clean` before testing to avoid stale files
2. **Test Single Engines First**: Verify `"puppeteer"` and `"pandoc"` modes work individually
3. **Use Dual Engine for Comparison**: Set `"engine": "both"` to compare output quality
4. **Check Dependencies**: Run `make python-info` to verify Python environment

### Debugging Engine Issues

```bash
# Check if Pandoc dependencies are installed
./venv/bin/python -c "import fitz; print('PyMuPDF OK')"
pandoc --version
weasyprint --version

# Test individual engines
# 1. Set config.json "engine": "puppeteer" and run
# 2. Set config.json "engine": "pandoc" and run  
# 3. Set config.json "engine": "both" and run

# Manual Python merger test
./venv/bin/python src/python/pdf_merger.py --verbose
```

### File Naming Patterns

- **Single Engine**: `001-page-name.pdf`, `002-page-name.pdf`
- **Dual Engine**: `001-page-name_puppeteer.pdf`, `001-page-name_pandoc.pdf`
- **Final Merged**: `domain_puppeteer_date.pdf`, `domain_pandoc_date.pdf`

### Performance Considerations

- **Puppeteer**: Faster generation, good for development
- **Pandoc**: Slower but higher quality, good for final output
- **Dual Engine**: Twice the generation time, use for quality comparison
- **Concurrent Processing**: Adjust `concurrency` setting based on system resources

### PDF Styling Best Practices

#### Minimal Intervention Strategy
The system follows a **"Fix the function, preserve the form"** philosophy:

- **✅ DO**: Preserve original website design, fonts, colors, and layouts
- **✅ DO**: Only fix critical functional issues (code wrapping, dark theme conversion)
- **✅ DO**: Ensure excellent Kindle and e-reader compatibility
- **❌ DON'T**: Override original styles unless absolutely necessary
- **❌ DON'T**: Add custom borders, padding, or visual changes that alter the original design

#### Code Block Handling
- **Problem Solved**: Long code lines now wrap properly without visual design changes
- **Style Preservation**: Original syntax highlighting and color schemes are maintained
- **Multi-border Fix**: Eliminated nested border issues that created "box-in-box" effects
- **Responsive Design**: Code blocks adapt to different screen sizes while maintaining readability

#### E-reader Optimization
- **Kindle Compatibility**: 确保在Kindle等设备上有良好的阅读体验，同时不会"过度优化"而破坏原始网页的设计美感
- **Tagged PDFs**: Generated PDFs include proper tagging for screen readers and accessibility
- **Flexible Layouts**: Content adapts to various screen sizes without losing original design intent
- **Print Quality**: Optimized margins and sizing for physical printing and digital reading

