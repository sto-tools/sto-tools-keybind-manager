# STO Tools Keybind Manager Test Suite Makefile

.PHONY: help install test test-verbose test-unit test-integration test-ci test-watch clean

# Default target
help:
	@echo "STO Tools Keybind Manager Test Suite"
	@echo ""
	@echo "Available targets:"
	@echo "  install       Install dependencies"
	@echo "  test          Run all tests"
	@echo "  test-verbose  Run tests with verbose output"
	@echo "  test-unit     Run only unit tests"
	@echo "  test-integration  Run only integration tests"
	@echo "  test-ci       Run tests for CI (with JUnit output)"
	@echo "  test-watch    Run tests in watch mode"
	@echo "  test-json     Generate JSON test report"
	@echo "  test-junit    Generate JUnit XML report"
	@echo "  test-tap      Generate TAP report"
	@echo "  clean         Clean generated files"
	@echo "  browser       Open browser test runner"
	@echo ""

# Install dependencies
install:
	@echo "Installing test dependencies..."
	npm install
	@echo "Dependencies installed successfully!"

# Run all tests
test:
	@echo "Running all tests..."
	node cli-runner.js

# Run tests with verbose output
test-verbose:
	@echo "Running tests with verbose output..."
	node cli-runner.js --verbose

# Run only unit tests
test-unit:
	@echo "Running unit tests..."
	node cli-runner.js --filter "Module" --verbose

# Run only integration tests
test-integration:
	@echo "Running integration tests..."
	node cli-runner.js --filter "Integration" --verbose

# Run tests for CI with JUnit output
test-ci:
	@echo "Running tests for CI..."
	node cli-runner.js --reporter junit --output test-results.xml --stop-on-failure

# Run tests in watch mode (requires nodemon)
test-watch:
	@echo "Running tests in watch mode..."
	@echo "Watching for changes in ../js and suites directories..."
	npx nodemon --watch ../js --watch suites --exec "make test"

# Generate JSON test report
test-json:
	@echo "Generating JSON test report..."
	node cli-runner.js --reporter json --output results.json
	@echo "Report saved to results.json"

# Generate JUnit XML report
test-junit:
	@echo "Generating JUnit XML report..."
	node cli-runner.js --reporter junit --output results.xml
	@echo "Report saved to results.xml"

# Generate TAP report
test-tap:
	@echo "Generating TAP report..."
	node cli-runner.js --reporter tap --output results.tap
	@echo "Report saved to results.tap"

# Clean generated files
clean:
	@echo "Cleaning generated files..."
	rm -f results.json results.xml results.tap test-results.xml
	rm -rf node_modules
	@echo "Clean complete!"

# Open browser test runner
browser:
	@echo "Opening browser test runner..."
	@if command -v python3 >/dev/null 2>&1; then \
		echo "Starting local server on http://localhost:8080"; \
		echo "Press Ctrl+C to stop the server"; \
		cd .. && python3 -m http.server 8080; \
	elif command -v python >/dev/null 2>&1; then \
		echo "Starting local server on http://localhost:8080"; \
		echo "Press Ctrl+C to stop the server"; \
		cd .. && python -m SimpleHTTPServer 8080; \
	else \
		echo "Python not found. Please open test/index.html in your browser manually."; \
	fi

# Quick test for development
quick:
	@echo "Running quick test (unit tests only)..."
	node cli-runner.js --filter "Module" --stop-on-failure

# Performance test
perf:
	@echo "Running performance test..."
	time node cli-runner.js --verbose

# Lint test files (if you have a linter)
lint:
	@echo "Linting test files..."
	@if command -v eslint >/dev/null 2>&1; then \
		eslint suites/*.js cli-runner.js; \
	else \
		echo "ESLint not found. Skipping lint check."; \
	fi

# Check test coverage
coverage:
	@echo "Checking test coverage..."
	node cli-runner.js --reporter json --output coverage.json
	@echo "Coverage report saved to coverage.json"

# Run specific test suite
test-data:
	node cli-runner.js --filter "Data Module" --verbose

test-storage:
	node cli-runner.js --filter "Storage Module" --verbose

test-commands:
	node cli-runner.js --filter "Commands Module" --verbose

test-keybinds:
	node cli-runner.js --filter "Keybinds Module" --verbose

test-profiles:
	node cli-runner.js --filter "Profiles Module" --verbose

test-aliases:
	node cli-runner.js --filter "Aliases Module" --verbose

test-export:
	node cli-runner.js --filter "Export Module" --verbose

# Development helpers
dev-setup: install
	@echo "Development environment setup complete!"
	@echo "Run 'make test' to run tests"
	@echo "Run 'make test-watch' for continuous testing"
	@echo "Run 'make browser' to open the web test runner"

# CI/CD helpers
ci-test: test-ci
	@if [ -f test-results.xml ]; then \
		echo "Test results available in test-results.xml"; \
	else \
		echo "No test results generated"; \
		exit 1; \
	fi 