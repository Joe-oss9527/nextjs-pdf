# Makefile for Next.js PDF Documentation Scraper

PYTHON = python3
VENV_DIR = venv
VENV_PYTHON = $(VENV_DIR)/bin/python
VENV_PIP = $(VENV_DIR)/bin/pip
NODE_MODULES = node_modules

.PHONY: help install install-python install-node venv clean-venv clean clean-all run test lint kindle7 kindle-paperwhite kindle-oasis kindle-scribe kindle-all reset-config list-configs clean-kindle

help:
	@echo "Available commands:"
	@echo "  install        - Install all dependencies (Python + Node.js)"
	@echo "  install-python - Create virtual environment and install Python dependencies"
	@echo "  install-node   - Install Node.js dependencies"
	@echo "  venv          - Create Python virtual environment"
	@echo "  clean-venv    - Remove and recreate Python virtual environment"
	@echo "  run           - Generate PDF documentation"
	@echo "  run-clean     - Clean output and generate PDF documentation"
	@echo "  test          - Run tests"
	@echo "  lint          - Run linter"
	@echo "  clean         - Clean generated PDFs and metadata"
	@echo "  clean-all     - Clean everything including dependencies"
	@echo ""
	@echo "Kindle PDF optimization:"
	@echo "  kindle7           - Generate PDFs for Kindle 7-inch"
	@echo "  kindle-paperwhite - Generate PDFs for Kindle Paperwhite"
	@echo "  kindle-oasis      - Generate PDFs for Kindle Oasis"
	@echo "  kindle-scribe     - Generate PDFs for Kindle Scribe"
	@echo "  kindle-all        - Generate PDFs for all Kindle devices"
	@echo "  reset-config      - Reset to base configuration"
	@echo "  list-configs      - List all available configurations"
	@echo "  clean-kindle      - Clean Kindle PDF files"

# Create Python virtual environment with enhanced checking
venv:
	@echo "\033[0;34m=== Creating Python Virtual Environment ===\033[0m"
	@if ! command -v $(PYTHON) >/dev/null 2>&1; then \
		echo "\033[0;31mError: python3 not found\033[0m"; \
		echo "\033[1;33mPlease install Python 3: sudo apt install python3 python3-venv python3-pip\033[0m"; \
		exit 1; \
	fi
	@if [ ! -f "requirements.txt" ]; then \
		echo "\033[0;31mError: requirements.txt not found in current directory\033[0m"; \
		exit 1; \
	fi
	@if [ -d "$(VENV_DIR)" ]; then \
		echo "\033[1;33mVirtual environment already exists at $(VENV_DIR)\033[0m"; \
		echo "\033[1;33mRun 'make clean-venv' first to recreate it\033[0m"; \
	else \
		echo "\033[0;34mCreating virtual environment at $(VENV_DIR)...\033[0m"; \
		$(PYTHON) -m venv $(VENV_DIR) || (echo "\033[0;31mFailed to create virtual environment\033[0m"; exit 1); \
		echo "\033[0;32m✅ Virtual environment created successfully!\033[0m"; \
	fi

# Install Python dependencies in virtual environment
install-python: venv
	@echo "\033[0;34m=== Installing Python Dependencies ===\033[0m"
	@echo "\033[0;34mUpgrading pip...\033[0m"
	@$(VENV_PIP) install --upgrade pip
	@echo "\033[0;34mInstalling project dependencies...\033[0m"
	@$(VENV_PIP) install -r requirements.txt
	@echo "\033[0;32m✅ Python dependencies installed successfully!\033[0m"
	@echo "\033[0;34m=== Usage Instructions ===\033[0m"
	@echo "\033[1;33m1. Activate virtual environment:\033[0m source venv/bin/activate"
	@echo "\033[1;33m2. Run the project:\033[0m make run"
	@echo "\033[1;33m3. Deactivate virtual environment:\033[0m deactivate"

# Install Node.js dependencies
install-node:
	@echo "Installing Node.js dependencies..."
	npm install
	@echo "Node.js dependencies installed successfully"

# Install all dependencies
install: install-python install-node
	@echo "All dependencies installed successfully"

# Generate PDF documentation
run:
	@echo "Generating PDF documentation..."
	npm start

# Clean output and generate PDF documentation
run-clean:
	@echo "Cleaning output and generating PDF documentation..."
	npm run start:clean

# Run tests
test:
	@echo "Running tests..."
	npm test

# Run demo
demo:
	@echo "Running demo..."
	npm run test:demo

# Run linter
lint:
	@echo "Running linter..."
	npm run lint

# Fix linting issues
lint-fix:
	@echo "Fixing linting issues..."
	npm run lint:fix

# Clean and recreate Python virtual environment
clean-venv:
	@echo "\033[1;33mRemoving existing Python virtual environment...\033[0m"
	@rm -rf $(VENV_DIR)
	@echo "\033[0;32mVirtual environment removed\033[0m"
	@$(MAKE) install-python

# Clean generated files
clean:
	@echo "Cleaning generated PDFs and metadata..."
	npm run clean

# Clean all generated files and dependencies
clean-all: clean
	@echo "Removing Python virtual environment..."
	rm -rf $(VENV_DIR)
	@echo "Removing Node.js dependencies..."
	rm -rf $(NODE_MODULES)
	@echo "All dependencies and generated files removed"

# Check if virtual environment exists
check-venv:
	@if [ ! -d "$(VENV_DIR)" ]; then \
		echo "Virtual environment not found. Run 'make install-python' first."; \
		exit 1; \
	fi

# Show Python environment info
python-info: check-venv
	@echo "Python virtual environment info:"
	@echo "Python executable: $(VENV_PYTHON)"
	@echo "Python version: $$($(VENV_PYTHON) --version)"
	@echo "Pip version: $$($(VENV_PIP) --version)"
	@echo "Installed packages:"
	@$(VENV_PIP) list

# Kindle PDF optimization commands
CONFIG_SCRIPT = scripts/use-kindle-config.js

# Generate PDFs for Kindle 7-inch
kindle7:
	@echo "🔧 切换到Kindle 7英寸配置..."
	@node $(CONFIG_SCRIPT) use kindle7
	@echo "🧹 清理旧文件..."
	@rm -rf pdfs/finalPdf-kindle7
	@echo "📄 生成Kindle 7英寸优化PDF..."
	@node src/app.js
	@echo "✅ Kindle 7英寸PDF生成完成"
	@echo "📍 PDF位置: pdfs/finalPdf-kindle7/"

# Generate PDFs for Kindle Paperwhite
kindle-paperwhite:
	@echo "🔧 切换到Kindle Paperwhite配置..."
	@node $(CONFIG_SCRIPT) use paperwhite
	@echo "🧹 清理旧文件..."
	@rm -rf pdfs/finalPdf-paperwhite
	@echo "📄 生成Kindle Paperwhite优化PDF..."
	@node src/app.js
	@echo "✅ Kindle Paperwhite PDF生成完成"
	@echo "📍 PDF位置: pdfs/finalPdf-paperwhite/"

# Generate PDFs for Kindle Oasis
kindle-oasis:
	@echo "🔧 切换到Kindle Oasis配置..."
	@node $(CONFIG_SCRIPT) use oasis
	@echo "🧹 清理旧文件..."
	@rm -rf pdfs/finalPdf-oasis
	@echo "📄 生成Kindle Oasis优化PDF..."
	@node src/app.js
	@echo "✅ Kindle Oasis PDF生成完成"
	@echo "📍 PDF位置: pdfs/finalPdf-oasis/"

# Generate PDFs for Kindle Scribe
kindle-scribe:
	@echo "🔧 切换到Kindle Scribe配置..."
	@node $(CONFIG_SCRIPT) use scribe
	@echo "🧹 清理旧文件..."
	@rm -rf pdfs/finalPdf-scribe
	@echo "📄 生成Kindle Scribe优化PDF..."
	@node src/app.js
	@echo "✅ Kindle Scribe PDF生成完成"
	@echo "📍 PDF位置: pdfs/finalPdf-scribe/"

# Generate PDFs for all Kindle devices
kindle-all: kindle7 kindle-paperwhite kindle-oasis kindle-scribe
	@echo "🎉 所有Kindle设备PDF生成完成！"
	@echo ""
	@echo "生成的PDF文件："
	@echo "  - pdfs/finalPdf-kindle7/"
	@echo "  - pdfs/finalPdf-paperwhite/"
	@echo "  - pdfs/finalPdf-oasis/"
	@echo "  - pdfs/finalPdf-scribe/"
	@echo ""
	@echo "请将这些PDF传输到相应设备进行验证"

# Reset to base configuration
reset-config:
	@echo "🔄 重置为基础配置..."
	@node $(CONFIG_SCRIPT) reset
	@echo "✅ 配置已重置"

# List all configurations
list-configs:
	@node $(CONFIG_SCRIPT) list

# Clean Kindle PDF files
clean-kindle:
	@echo "🧹 清理所有Kindle PDF文件..."
	@rm -rf pdfs/finalPdf-kindle7
	@rm -rf pdfs/finalPdf-paperwhite
	@rm -rf pdfs/finalPdf-oasis
	@rm -rf pdfs/finalPdf-scribe
	@echo "✅ 清理完成"