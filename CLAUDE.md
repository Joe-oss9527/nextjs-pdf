# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js PDF documentation scraper with enterprise-grade architecture. It scrapes Next.js documentation pages and converts them to PDF format with Python-based merging capabilities.

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
- **Configuration System** - External `config.json` with validation via Joi schemas

## Common Commands

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

# Python Dependencies
pip install -r requirements.txt    # Install Python PDF processing dependencies
```

## Development Guidelines

### Service Architecture
- All services are registered in `src/core/setup.js` with proper dependency injection
- Services should have dispose/cleanup methods for graceful shutdown
- Use the container to resolve dependencies rather than direct imports
- **PDFStyleService** - Handles PDF styling, theme detection, and content optimization

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

## Python Integration

PDF merging is handled by Python scripts:
- `src/python/pdf_merger.py` - Main PDF merging logic using PyMuPDF
- `src/python/config_manager.py` - Python config handling
- PythonMergeService orchestrates Node.js to Python communication
- Python dependencies defined in `requirements.txt`

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
  - `theme` - PDF theme mode ('light' or 'dark')
  - `preserveCodeHighlighting` - Keep syntax highlighting in code blocks
  - `enableCodeWrap` - Enable code line wrapping to prevent overflow
  - `fontSize` - Base font size for PDF content
  - `fontFamily` - Font family for body text
  - `codeFont` - Font family for code blocks

## Debugging and Monitoring

- Health checks available via `Application.healthCheck()`
- Container health via `getContainerHealth(container)`
- Progress tracking via ProgressTracker service
- Structured logging with context information
- Graceful shutdown with resource cleanup