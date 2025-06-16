# STO Tools Keybind Manager Test Suite

A comprehensive test suite for the STO Tools Keybind Manager application, providing both unit tests and integration tests to ensure reliability and functionality.

## Overview

The test suite includes:
- **Unit Tests**: Test individual modules in isolation
- **Integration Tests**: Test interaction between modules and end-to-end workflows
- **Custom Test Framework**: Lightweight testing framework with assertion utilities
- **Visual Test Runner**: Web-based interface for running and viewing test results

## Structure

```
test/
├── index.html              # Main test runner interface
├── runner.js               # Test execution and UI management
├── framework/
│   └── test-framework.js   # Custom test framework
├── suites/
│   ├── data.test.js        # Tests for data.js module
│   ├── storage.test.js     # Tests for storage.js module
│   ├── commands.test.js    # Tests for commands.js module
│   ├── keybinds.test.js    # Tests for keybinds.js module
│   ├── profiles.test.js    # Tests for profiles.js module
│   ├── aliases.test.js     # Tests for aliases.js module
│   ├── export.test.js      # Tests for export.js module
│   └── integration.test.js # Integration and end-to-end tests
└── README.md               # This file
```

## Running Tests

### Command Line Interface

The test suite can be run from the command line for automated testing and CI/CD integration.

#### Quick Start
```bash
# Navigate to test directory
cd test

# Install dependencies (first time only)
npm install

# Run all tests
npm test

# Run with verbose output
npm run test:verbose

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration
```

#### Advanced Usage

**Node.js CLI Runner:**
```bash
# Basic usage
node cli-runner.js

# With options
node cli-runner.js --verbose --filter "Data" --timeout 60000

# Generate reports
node cli-runner.js --reporter json --output results.json
node cli-runner.js --reporter junit --output results.xml
node cli-runner.js --reporter tap --output results.tap

# CI/CD usage
node cli-runner.js --reporter junit --output test-results.xml --stop-on-failure
```

**Cross-Platform Scripts:**

*Unix/Linux/macOS:*
```bash
# Make executable (first time only)
chmod +x run-tests.sh

# Run tests
./run-tests.sh test
./run-tests.sh test-verbose
./run-tests.sh test-ci
./run-tests.sh browser  # Opens web interface
```

*Windows:*
```cmd
run-tests.bat test
run-tests.bat test-verbose
run-tests.bat test-ci
run-tests.bat browser
```

**Using Make (Unix/Linux/macOS):**
```bash
make install     # Install dependencies
make test        # Run all tests
make test-unit   # Run unit tests only
make test-ci     # Run CI tests with JUnit output
make browser     # Open web test runner
make clean       # Clean generated files
```

#### CLI Options

- `--verbose` / `-v`: Show detailed test output
- `--filter <pattern>` / `-f`: Run only tests matching pattern
- `--stop-on-failure` / `-s`: Stop on first test failure
- `--timeout <ms>` / `-t`: Test timeout in milliseconds (default: 30000)
- `--reporter <type>` / `-r`: Reporter type (default, json, junit, tap)
- `--output <file>` / `-o`: Output file for test results
- `--help` / `-h`: Show help message

#### Report Formats

**Default Console Output:**
```
============================================================
  STO Tools Keybind Manager Test Results
============================================================

Tests:       150
Passed:      148 (98.7%)
Failed:      2
Skipped:     0
Duration:    2847ms
Status:      ❌ FAILED
```

**JSON Report:**
```json
{
  "summary": {
    "total": 150,
    "passed": 148,
    "failed": 2,
    "skipped": 0,
    "duration": 2847,
    "success": false,
    "timestamp": "2024-01-15T10:30:00.000Z"
  },
  "suites": [...],
  "tests": [...]
}
```

**JUnit XML:** Compatible with CI/CD systems like Jenkins, GitHub Actions, etc.

**TAP (Test Anything Protocol):** Compatible with TAP consumers.

### Web Interface

1. Open `test/index.html` in a web browser
2. Click "Run All Tests" to execute the complete test suite
3. Use "Unit Tests Only" or "Integration Tests Only" for focused testing
4. Click on test suite headers to expand/collapse individual test results

### CI/CD Integration

The test suite includes GitHub Actions workflow and can be integrated into any CI/CD pipeline:

```yaml
# Example GitHub Actions step
- name: Run Tests
  working-directory: ./test
  run: |
    npm ci
    npm run test:ci
```

### Test Controls

- **Run All Tests**: Execute all unit and integration tests
- **Unit Tests Only**: Run only unit tests (excludes integration tests)
- **Integration Tests Only**: Run only integration tests
- **Clear Results**: Reset all test results and statistics
- **Stop on first failure**: Halt execution when the first test fails

## Test Framework Features

### Assertion Methods

```javascript
expect(value).toBe(expected)                    // Strict equality
expect(value).toEqual(expected)                 // Deep equality
expect(value).toBeNull()                        // Null check
expect(value).toBeUndefined()                   // Undefined check
expect(value).toBeTruthy()                      // Truthy check
expect(value).toBeFalsy()                       // Falsy check
expect(array).toContain(item)                   // Array/string contains
expect(array).toHaveLength(count)               // Length check
expect(number).toBeGreaterThan(value)           // Numeric comparison
expect(number).toBeLessThan(value)              // Numeric comparison
expect(fn).toThrow(message)                     // Exception testing
expect(obj).toBeInstanceOf(Class)               // Instance check
```

### Test Organization

```javascript
describe('Module Name', () => {
    beforeAll(() => {
        // Setup before all tests in suite
    });
    
    beforeEach(() => {
        // Setup before each test
    });
    
    afterEach(() => {
        // Cleanup after each test
    });
    
    afterAll(() => {
        // Cleanup after all tests in suite
    });
    
    it('should do something', () => {
        // Test implementation
        expect(result).toBe(expected);
    });
    
    xit('should skip this test', () => {
        // Skipped test
    });
});
```

### Mocking Utilities

```javascript
// Create mock function
const mockFn = Mock.fn();
const mockFnWithImpl = Mock.fn((x) => x * 2);

// Spy on existing method
const spy = Mock.spyOn(object, 'method');

// Mock function methods
mockFn.mockReturnValue(42);
mockFn.mockImplementation((x) => x + 1);
mockFn.mockReset();
spy.restore();
```

## Test Coverage

## Adding New Tests

### Unit Tests
1. Create or modify test files in `suites/`
2. Follow the existing naming convention: `module.test.js`
3. Use descriptive test names and organize with `describe` blocks
4. Include both positive and negative test cases
5. Test error conditions and edge cases

### Integration Tests
1. Add tests to `integration.test.js`
2. Focus on module interactions and workflows
3. Test realistic user scenarios
4. Verify data consistency across modules

### Example Test Structure
```javascript
describe('New Module', () => {
    let moduleInstance;
    
    beforeEach(() => {
        moduleInstance = new NewModule();
    });
    
    describe('Core Functionality', () => {
        it('should perform basic operation', () => {
            const result = moduleInstance.basicOperation();
            expect(result).toBeDefined();
        });
        
        it('should handle invalid input', () => {
            expect(() => {
                moduleInstance.basicOperation(null);
            }).toThrow();
        });
    });
    
    describe('Edge Cases', () => {
        it('should handle empty data', () => {
            const result = moduleInstance.processData([]);
            expect(result).toEqual([]);
        });
    });
});
```

## Best Practices

1. **Test Names**: Use descriptive names that explain what is being tested
2. **Test Organization**: Group related tests with `describe` blocks
3. **Setup/Teardown**: Use hooks to maintain clean test state
4. **Assertions**: Use specific assertions that clearly express intent
5. **Error Testing**: Always test error conditions and edge cases
6. **Performance**: Keep tests fast and focused
7. **Independence**: Ensure tests don't depend on each other
8. **Coverage**: Aim for comprehensive coverage of functionality

## Continuous Testing

The test suite is designed to be run frequently during development:
- Run tests before committing changes
- Use focused test runs during development
- Run full suite before releases
- Monitor test performance and add new tests for new features 