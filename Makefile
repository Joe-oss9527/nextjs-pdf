# Makefile for Next.js PDF Documentation Scraper

PYTHON = python3
VENV_DIR = venv
VENV_PYTHON = $(VENV_DIR)/bin/python
VENV_PIP = $(VENV_DIR)/bin/pip
NODE_MODULES = node_modules

.PHONY: help install install-python install-node venv clean clean-all run test lint

help:
	@echo "Available commands:"
	@echo "  install        - Install all dependencies (Python + Node.js)"
	@echo "  install-python - Create virtual environment and install Python dependencies"
	@echo "  install-node   - Install Node.js dependencies"
	@echo "  venv          - Create Python virtual environment"
	@echo "  run           - Generate PDF documentation"
	@echo "  run-clean     - Clean output and generate PDF documentation"
	@echo "  test          - Run tests"
	@echo "  lint          - Run linter"
	@echo "  clean         - Clean generated PDFs and metadata"
	@echo "  clean-all     - Clean everything including dependencies"

# Create Python virtual environment
venv:
	@echo "Creating Python virtual environment..."
	$(PYTHON) -m venv $(VENV_DIR)
	@echo "Virtual environment created at $(VENV_DIR)"

# Install Python dependencies in virtual environment
install-python: venv
	@echo "Installing Python dependencies..."
	$(VENV_PIP) install --upgrade pip
	$(VENV_PIP) install -r requirements.txt
	@echo "Python dependencies installed successfully"

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