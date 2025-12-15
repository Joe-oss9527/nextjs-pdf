# Documentation PDF Scraper

A professional web scraper that converts documentation websites into high-quality PDF files using Puppeteer. Features intelligent content extraction, modular architecture, and device-optimized output.

## Features

- **Puppeteer PDF Engine** - Chrome-based PDF generation with consistent rendering
- **Kindle Optimization** - Device-specific configurations for optimal e-reader experience
- **Smart Content Processing** - Preserves original styling while ensuring readability
- **Modular Architecture** - Dependency injection with comprehensive service management
- **Concurrent Processing** - Parallel scraping with intelligent queue management

## Quick Start

### Installation

```bash
# Install all dependencies
make install

# Generate PDFs (default configuration)
make clean && make run
```

### Prerequisites

- Node.js >= 16.0.0
- Python >= 3.8
- 2GB RAM recommended

## Usage

### Basic PDF Generation

```bash
# Generate with default settings
make clean && make run

# Clean previous output
make clean
```

### Kindle Device Optimization

Generate device-optimized PDFs with a single command:

```bash
# Single device
make kindle7           # Kindle 7-inch
make kindle-paperwhite # Kindle Paperwhite  
make kindle-oasis      # Kindle Oasis
make kindle-scribe     # Kindle Scribe

# All devices
make kindle-all
```

### Device Specifications

| Device | Font Size | Code Size | Line Height | Page Format |
|--------|-----------|-----------|-------------|-------------|
| Kindle 7" | 16px | 13px | 1.6 | Letter |
| Paperwhite | 16px | 14px | 1.6 | Letter |
| Oasis | 17px | 14px | 1.65 | Letter |
| Scribe | 18px | 15px | 1.7 | A4 |

## Configuration

### Base Configuration (`config.json`)

`config.json` 仅保留公共配置（PDF/翻译/Markdown 等）。文档站点相关的 URL、选择器等配置放在 `doc-targets/*.json` 中，并会根据 `docTarget` 自动合并进来。

```json
{
  "docTarget": "openai",
  "pdfDir": "pdfs",
  "concurrency": 5,
  "markdown": { "enabled": true },
  "markdownPdf": { "enabled": true }
}
```

### Doc Target Configuration (`doc-targets/*.json`)

每个站点一个文件，例如 `doc-targets/openai-docs.json`：

```json
{
  "rootURL": "https://docs.example.com",
  "baseUrl": "https://docs.example.com/docs/",
  "navLinksSelector": "nav a[href]",
  "contentSelector": "main",
  "allowedDomains": ["docs.example.com"]
}
```

### Markdown Source (`markdownSource`, optional)

部分站点提供原始 Markdown 源文件（例如在页面 URL 后追加 `.md`）。可以在对应的 `doc-targets/*.json` 里启用：

```json
{
  "markdownSource": { "enabled": true, "urlSuffix": ".md" }
}
```

### Scraping Specific URLs (`targetUrls`)

To scrape specific URLs without crawling the entire site, use the `targetUrls` configuration (通常放在对应的 `doc-targets/*.json` 里):

```json
{
  "targetUrls": [
    "https://example.com/specific-page-1",
    "https://example.com/specific-page-2"
  ]
}
```

### Device Profiles

Device-specific settings are stored in `config-profiles/` and automatically merged:

```json
{
  "output": {
    "finalPdfDirectory": "finalPdf-kindle7"
  },
  "pdf": {
    "deviceProfile": "kindle7",
    "fontSize": "16px",
    "codeFontSize": "13px",
    "maxCodeLineLength": 70
  }
}
```

### Switching Documentation Targets

Use the helper script to swap between OpenAI and Claude Code configs without manually editing `config.json`:

```bash
# Apply OpenAI defaults
npm run docs:openai

# Apply Claude Code (code.claude.com/docs) defaults
npm run docs:claude

# Apply Anthropic Research defaults
npm run docs:anthropic

# Apply Claude Blog defaults
npm run docs:claude-blog

# Inspect current root/base URLs
npm run docs:current

# List all available doc targets
npm run docs:list
```

说明：这些命令会更新 `config.json` 里的 `docTarget` 字段；站点具体配置来自 `doc-targets/*.json` 并在运行时自动合并。

## Development

### Project Structure

```
src/
├── app.js              # Main application
├── core/               # Dependency injection & core services
├── services/           # Modular services (browser, PDF, queue)
├── config/             # Configuration management
├── utils/              # Common utilities
└── python/             # PDF merging scripts
```

### Available Commands

```bash
# Development
make test               # Run test suite
make lint               # Code quality checks

# Configuration
make reset-config       # Reset to base configuration
make list-configs       # Show available configurations

# Maintenance  
make clean-all          # Remove all generated files
make python-info        # Check Python environment
```

### Adding Services

Register new services in `src/core/setup.js`:

```javascript
container.register('myService', (config, logger) => {
  return new MyService(config, logger);
}, {
  dependencies: ['config', 'logger'],
  singleton: true
});
```

## Testing

```bash
make test               # Full test suite
npm test               # Alternative test command
```

## Architecture

- **Dependency Injection** - Clean service management with automatic lifecycle handling
- **Concurrent Processing** - Configurable parallel scraping with rate limiting
- **State Management** - Incremental processing with resume capability
- **Error Recovery** - Comprehensive error handling and retry mechanisms

## Troubleshooting

### Common Issues

**Python Environment:**
```bash
make clean-venv         # Recreate Python environment
make python-info        # Check Python setup
```

**PDF Generation:**
```bash
make clean && make run  # Clean slate generation
```

**Dependencies:**
```bash
./venv/bin/python -c "import fitz; print('PyMuPDF OK')"
```

## Dependencies

**Node.js:**
- Puppeteer (browser automation)
- Winston (logging)
- Joi (configuration validation)

**Python:**
- PyMuPDF (PDF processing)

## License

ISC License

---

*Professional documentation processing solution - v2.0.0*
