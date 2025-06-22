# Next.js PDF Documentation Scraper

## 🚀 Puppeteer PDF Generation System

A modern, enterprise-ready web scraper that converts documentation pages into high-quality PDF files. Features **Puppeteer PDF generation** with intelligent merging, modular dependency injection architecture, and comprehensive monitoring capabilities.

## ✨ Key Features

### 🎯 PDF Generation
- **Puppeteer Engine** - Fast Chrome/Chromium-based PDF generation
- **Smart Styling** - Minimal intervention approach preserving original web design
- **E-reader Optimization** - Kindle-compatible PDFs with proper tagging

### 🏗️ Enterprise Architecture
- **Dependency Injection Container** - Clean service management and lifecycle
- **8-Layer Modular Design** - Clear separation of concerns
- **Configuration Validation** - Joi-based schema validation
- **Structured Logging** - Winston-powered with context-specific loggers
- **Resource Management** - Automatic cleanup and memory optimization

### 🔧 Advanced Capabilities
- **Intelligent Web Scraping** - Navigate and extract documentation pages
- **State Management** - Incremental scraping with resume capability
- **Browser Pool Management** - Efficient Puppeteer instance handling
- **Queue Management** - Concurrent processing with rate limiting
- **Python Integration** - Seamless PDF merging
- **Real-time Monitoring** - Health checks and performance metrics

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 16.0.0
- **Python** >= 3.8
- **Memory** >= 2GB recommended
- **Disk Space** >= 1GB for temporary files

### Installation with Makefile (Recommended)

```bash
# Clone the repository
git clone <repository-url>
cd nextjs-pdf

# Install all dependencies (Python + Node.js)
make install

# Clean previous PDFs and generate documentation
make run-clean

# Run tests
make test
```

### Manual Installation

```bash
# Install Node.js dependencies
npm install

# Setup Python virtual environment and dependencies
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
./venv/Scripts/activate   # Windows
pip install -r requirements.txt
```

### Basic Usage

```bash
# Quick start with Makefile
make run                 # Generate PDF documentation
make clean               # Clean previous PDFs
make run-clean          # Clean + generate in one command

# Using npm commands
npm start               # Run complete workflow
npm run start:clean     # Clean output and run
npm test               # Run integration tests
```

## 🎨 PDF Generation

PDF generation uses Puppeteer engine configured in `config.json`:

```json
{
  "pdf": {
    "engine": "puppeteer"
  }
}
```
- **Output**: `001-page-name.pdf`, `002-page-name.pdf`
- **Final**: `domain_date.pdf`
- **Best for**: Fast generation, consistent quality

## 📁 Project Structure

```
nextjs-pdf/
├── src/
│   ├── app.js                    # Main application entry point
│   ├── config/
│   │   ├── configLoader.js       # Configuration management
│   │   └── schema.js            # Joi validation schemas
│   ├── core/
│   │   ├── container.js          # Dependency injection container
│   │   ├── setup.js             # Service registration
│   │   ├── scraper.js           # Core scraping logic
│   │   └── pythonRunner.js      # Python script execution
│   ├── services/
│   │   ├── fileService.js       # File operations
│   │   ├── pathService.js       # Path management
│   │   ├── stateManager.js      # State persistence
│   │   ├── progressTracker.js   # Progress monitoring
│   │   ├── queueManager.js      # Task queue management
│   │   ├── browserPool.js       # Browser instance pool
│   │   ├── pageManager.js       # Page lifecycle management
│   │   ├── imageService.js      # Image processing
│   │   ├── pdfStyleService.js   # PDF styling optimization
│   │   └── pythonMergeService.js # PDF merging service
│   ├── utils/
│   │   ├── logger.js            # Structured logging
│   │   ├── errors.js            # Custom error classes
│   │   ├── common.js            # Common utilities
│   │   └── url.js              # URL processing
│   └── python/
│       ├── pdf_merger.py        # PDF merger
│       └── config_manager.py    # Python config handler
├── tests/                       # Test suites
├── Makefile                    # Build automation
├── config.json                 # Application configuration
├── package.json               # Node.js dependencies
├── requirements.txt           # Python dependencies
└── README.md                 # This file
```

## ⚙️ Configuration

### Main Configuration (`config.json`)

```json
{
  "rootURL": "https://docs.anthropic.com/en/docs/claude-code/overview",
  "pdfDir": "pdfs",
  "concurrency": 5,
  "pdf": {
    "engine": "puppeteer",
    "theme": "light",
    "preserveCodeHighlighting": true,
    "enableCodeWrap": true,
    "fontSize": "14px",
    "fontFamily": "system-ui, sans-serif",
    "codeFont": "SFMono-Regular, Consolas, monospace"
  },
  "python": {
    "executable": "./venv/bin/python",
    "timeout": 300000
  }
}
```

### PDF Styling Strategy

The system follows a **"Fix the function, preserve the form"** philosophy:

- ✅ **Preserve Original Design** - Maintains source website's fonts, colors, and layouts
- ✅ **Code Wrapping Fix** - Ensures long code lines wrap properly
- ✅ **Smart Theme Handling** - Converts dark themes to light for print readability
- ✅ **Kindle Optimization** - E-reader compatible with proper tagging
- ❌ **No Over-styling** - Minimal intervention to avoid design disruption

## 🧪 Testing

### Run Tests with Makefile

```bash
make test              # Run integration tests
make demo             # Run demo with detailed output
make lint             # Run linter
make lint-fix         # Fix linting issues
make python-info      # Show Python environment info
```

### Manual Testing

```bash
# Full integration test suite
npm test

# Demo with detailed component testing
npm run test:demo

# Lint JavaScript files
npm run lint
npm run lint:fix
```

### Test Coverage

- ✅ **PDF Generation** - Puppeteer engine
- ✅ **Dependency Injection** - Container and service resolution
- ✅ **Configuration System** - Loading and validation
- ✅ **Python Integration** - Script execution and PDF merging
- ✅ **Browser Management** - Pool and page lifecycle
- ✅ **Error Handling** - Exception management and recovery
- ✅ **PDF Styling** - Code wrapping and theme conversion

## 🛠️ Development

### Makefile Commands

```bash
# Setup and dependencies
make install          # Install all dependencies
make install-python   # Install Python dependencies only
make install-node     # Install Node.js dependencies only
make clean-venv       # Recreate Python virtual environment

# Development workflow
make clean            # Clean generated PDFs
make run              # Generate PDFs
make run-clean        # Clean + generate
make test             # Run tests
make demo             # Run demo
make lint             # Check code style
make lint-fix         # Fix linting issues

# Utilities
make python-info      # Show Python environment info
make clean-all        # Remove all dependencies and generated files
```

### Adding New Services

```javascript
// Register a new service in src/core/setup.js
container.register('myService', (config, logger) => {
  return new MyService(config, logger);
}, {
  dependencies: ['config', 'logger'],
  singleton: true
});
```

### Testing Different PDF Engines

1. **Clean State**: Always run `make clean` before testing
2. **Test PDF Generation**: 
   ```bash
   # Test PDF generation
   # Run with Puppeteer engine (default)
   make clean && make run
   ```
3. **Verify Output**: Check generated PDFs in the output directory

## 🚨 Troubleshooting

### Common Issues

**Python Virtual Environment**
```bash
# Recreate virtual environment
make clean-venv

# Check Python environment
make python-info
```

**PDF Generation Failures**
```bash
# Clean and retry
make clean && make run

# Check dependencies
./venv/bin/python -c "import fitz; print('PyMuPDF OK')"
```

**Code Block Rendering Issues**
- The system automatically fixes white text on dark backgrounds
- Ensures proper code wrapping for long lines
- Optimizes for Kindle and e-reader compatibility

## 📦 Dependencies

### Node.js Dependencies
- **Puppeteer** - Browser automation
- **Winston** - Structured logging
- **Joi** - Configuration validation
- **p-queue** - Queue management
- **pdf-lib** - PDF manipulation

### Python Dependencies
- **PyMuPDF** - PDF processing and merging

## 🏆 Performance

- **Startup Time**: < 50ms
- **Container Creation**: ~0.4ms average
- **Concurrent Processing**: Up to 10 parallel scrapers
- **Memory Optimization**: Automatic cleanup and resource management
- **Optimized PDF Generation**: Efficient Puppeteer-based processing

## 📜 License

This project is licensed under the ISC License.

## 🙏 Acknowledgments

- **Puppeteer Team** - Browser automation excellence
- **PyMuPDF** - Powerful PDF processing
- **Winston** - Structured logging
- **Joi** - Configuration validation
- **PyMuPDF** - Powerful PDF processing

---

**Built with ❤️ for comprehensive documentation processing**

*Last updated: June 2025 - v2.0.0*