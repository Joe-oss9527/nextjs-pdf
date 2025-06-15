# Makefile for Next.js PDF Documentation Scraper

PYTHON = python3
VENV_DIR = venv
VENV_PYTHON = $(VENV_DIR)/bin/python
VENV_PIP = $(VENV_DIR)/bin/pip
NODE_MODULES = node_modules

.PHONY: help install install-python install-node venv clean-venv clean clean-all run test lint

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