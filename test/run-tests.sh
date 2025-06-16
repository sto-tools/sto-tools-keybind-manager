#!/bin/bash

# STO Tools Keybind Manager Test Suite - Unix Shell Runner

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Default values
COMMAND="help"
VERBOSE=""
FILTER=""
REPORTER=""
OUTPUT=""
TIMEOUT=""

# Function to print colored output
print_info() {
    echo -e "${BLUE}$1${NC}"
}

print_success() {
    echo -e "${GREEN}$1${NC}"
}

print_warning() {
    echo -e "${YELLOW}$1${NC}"
}

print_error() {
    echo -e "${RED}$1${NC}"
}

# Function to check if Node.js is installed
check_node() {
    if ! command -v node &> /dev/null; then
        print_error "Error: Node.js is not installed or not in PATH"
        print_error "Please install Node.js from https://nodejs.org/"
        exit 1
    fi
}

# Function to show help
show_help() {
    echo "STO Tools Keybind Manager Test Suite"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  help              Show this help message"
    echo "  install           Install dependencies"
    echo "  test              Run all tests"
    echo "  test-verbose      Run tests with verbose output"
    echo "  test-unit         Run only unit tests"
    echo "  test-integration  Run only integration tests"
    echo "  test-ci           Run tests for CI (with JUnit output)"
    echo "  test-json         Generate JSON test report"
    echo "  test-junit        Generate JUnit XML report"
    echo "  test-tap          Generate TAP report"
    echo "  test-watch        Run tests in watch mode"
    echo "  clean             Clean generated files"
    echo "  browser           Open browser test runner"
    echo "  quick             Run quick unit tests"
    echo "  perf              Run performance tests"
    echo ""
    echo "Options:"
    echo "  --verbose         Show detailed output"
    echo "  --filter <pattern>  Run only tests matching pattern"
    echo "  --reporter <type>   Reporter type: default, json, junit, tap"
    echo "  --output <file>     Output file for test results"
    echo "  --timeout <ms>      Test timeout in milliseconds"
    echo ""
    echo "Examples:"
    echo "  $0 test"
    echo "  $0 test-verbose"
    echo "  $0 test --filter \"Data\""
    echo "  $0 test-junit --output results.xml"
    echo "  $0 test --timeout 60000"
}

# Function to install dependencies
install_deps() {
    print_info "Installing test dependencies..."
    
    if [ ! -f "package.json" ]; then
        print_error "Error: package.json not found"
        exit 1
    fi
    
    if npm install; then
        print_success "Dependencies installed successfully!"
    else
        print_error "Error: Failed to install dependencies"
        exit 1
    fi
}

# Function to run tests
run_tests() {
    local cmd="node cli-runner.js"
    
    if [ -n "$VERBOSE" ]; then
        cmd="$cmd $VERBOSE"
    fi
    
    if [ -n "$FILTER" ]; then
        cmd="$cmd $FILTER"
    fi
    
    if [ -n "$REPORTER" ]; then
        cmd="$cmd $REPORTER"
    fi
    
    if [ -n "$OUTPUT" ]; then
        cmd="$cmd $OUTPUT"
    fi
    
    if [ -n "$TIMEOUT" ]; then
        cmd="$cmd $TIMEOUT"
    fi
    
    print_info "Running: $cmd"
    
    if eval "$cmd"; then
        print_success "All tests passed!"
        return 0
    else
        print_error "Tests failed!"
        return 1
    fi
}

# Function to clean generated files
clean_files() {
    print_info "Cleaning generated files..."
    
    rm -f results.json results.xml results.tap test-results.xml coverage.json
    rm -rf node_modules
    
    print_success "Clean complete!"
}

# Function to open browser test runner
open_browser() {
    print_info "Opening browser test runner..."
    
    # Try to start a local server
    if command -v python3 &> /dev/null; then
        print_info "Starting local server on http://localhost:8080"
        print_warning "Press Ctrl+C to stop the server"
        cd ..
        python3 -m http.server 8080
    elif command -v python &> /dev/null; then
        print_info "Starting local server on http://localhost:8080"
        print_warning "Press Ctrl+C to stop the server"
        cd ..
        python -m SimpleHTTPServer 8080
    else
        print_warning "Python not found. Please open test/index.html in your browser manually."
        
        # Try to open with system default browser
        if command -v xdg-open &> /dev/null; then
            xdg-open "index.html"
        elif command -v open &> /dev/null; then
            open "index.html"
        fi
    fi
}

# Function to run tests in watch mode
run_watch() {
    print_info "Running tests in watch mode..."
    print_info "Watching for changes in ../js and suites directories..."
    print_warning "Press Ctrl+C to stop watching"
    
    if command -v npx &> /dev/null; then
        npx nodemon --watch ../js --watch suites --exec "$0 test"
    else
        print_error "nodemon not found. Please install it with: npm install -g nodemon"
        exit 1
    fi
}

# Function to run performance tests
run_perf() {
    print_info "Running performance test..."
    time node cli-runner.js --verbose
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        help)
            COMMAND="help"
            shift
            ;;
        install)
            COMMAND="install"
            shift
            ;;
        test)
            COMMAND="test"
            shift
            ;;
        test-verbose)
            COMMAND="test-verbose"
            shift
            ;;
        test-unit)
            COMMAND="test-unit"
            shift
            ;;
        test-integration)
            COMMAND="test-integration"
            shift
            ;;
        test-ci)
            COMMAND="test-ci"
            shift
            ;;
        test-json)
            COMMAND="test-json"
            shift
            ;;
        test-junit)
            COMMAND="test-junit"
            shift
            ;;
        test-tap)
            COMMAND="test-tap"
            shift
            ;;
        test-watch)
            COMMAND="test-watch"
            shift
            ;;
        clean)
            COMMAND="clean"
            shift
            ;;
        browser)
            COMMAND="browser"
            shift
            ;;
        quick)
            COMMAND="quick"
            shift
            ;;
        perf)
            COMMAND="perf"
            shift
            ;;
        --verbose)
            VERBOSE="--verbose"
            shift
            ;;
        --filter)
            FILTER="--filter \"$2\""
            shift 2
            ;;
        --reporter)
            REPORTER="--reporter $2"
            shift 2
            ;;
        --output)
            OUTPUT="--output $2"
            shift 2
            ;;
        --timeout)
            TIMEOUT="--timeout $2"
            shift 2
            ;;
        *)
            print_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Check Node.js installation
check_node

# Execute command
case $COMMAND in
    help)
        show_help
        ;;
    install)
        install_deps
        ;;
    test)
        print_info "Running all tests..."
        run_tests
        ;;
    test-verbose)
        print_info "Running tests with verbose output..."
        VERBOSE="--verbose"
        run_tests
        ;;
    test-unit)
        print_info "Running unit tests..."
        VERBOSE="--verbose"
        FILTER="--filter \"Module\""
        run_tests
        ;;
    test-integration)
        print_info "Running integration tests..."
        VERBOSE="--verbose"
        FILTER="--filter \"Integration\""
        run_tests
        ;;
    test-ci)
        print_info "Running tests for CI..."
        REPORTER="--reporter junit"
        OUTPUT="--output test-results.xml"
        if node cli-runner.js $REPORTER $OUTPUT --stop-on-failure; then
            print_success "CI tests passed!"
        else
            print_error "CI tests failed!"
            exit 1
        fi
        ;;
    test-json)
        print_info "Generating JSON test report..."
        if node cli-runner.js --reporter json --output results.json; then
            print_success "Report saved to results.json"
        else
            print_error "Failed to generate JSON report"
            exit 1
        fi
        ;;
    test-junit)
        print_info "Generating JUnit XML report..."
        if node cli-runner.js --reporter junit --output results.xml; then
            print_success "Report saved to results.xml"
        else
            print_error "Failed to generate JUnit report"
            exit 1
        fi
        ;;
    test-tap)
        print_info "Generating TAP report..."
        if node cli-runner.js --reporter tap --output results.tap; then
            print_success "Report saved to results.tap"
        else
            print_error "Failed to generate TAP report"
            exit 1
        fi
        ;;
    test-watch)
        run_watch
        ;;
    clean)
        clean_files
        ;;
    browser)
        open_browser
        ;;
    quick)
        print_info "Running quick test (unit tests only)..."
        FILTER="--filter \"Module\""
        if node cli-runner.js $FILTER --stop-on-failure; then
            print_success "Quick tests passed!"
        else
            print_error "Quick tests failed!"
            exit 1
        fi
        ;;
    perf)
        run_perf
        ;;
    *)
        print_error "Unknown command: $COMMAND"
        show_help
        exit 1
        ;;
esac

print_success "Done!" 