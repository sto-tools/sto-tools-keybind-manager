/**
 * Lightweight Test Framework for STO Tools Keybind Manager
 * Provides assertion methods, test organization, and result reporting
 */

class TestFramework {
    constructor() {
        this.suites = new Map();
        this.currentSuite = null;
        this.results = {
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            suites: []
        };
        this.isRunning = false;
        this.stopOnFailure = false;
    }

    /**
     * Create a new test suite
     */
    describe(name, callback) {
        const suite = {
            name,
            tests: [],
            beforeEach: null,
            afterEach: null,
            beforeAll: null,
            afterAll: null,
            status: 'pending',
            startTime: null,
            endTime: null,
            results: {
                total: 0,
                passed: 0,
                failed: 0,
                skipped: 0
            }
        };

        this.suites.set(name, suite);
        this.currentSuite = suite;
        
        try {
            callback();
        } catch (error) {
            console.error(`Error in test suite "${name}":`, error);
        }
        
        this.currentSuite = null;
        return suite;
    }

    /**
     * Define a test case
     */
    it(name, callback) {
        if (!this.currentSuite) {
            throw new Error('Test case must be defined within a describe block');
        }

        const test = {
            name,
            callback,
            status: 'pending',
            error: null,
            startTime: null,
            endTime: null,
            duration: 0,
            skip: false
        };

        this.currentSuite.tests.push(test);
        return test;
    }

    /**
     * Skip a test case
     */
    xit(name, callback) {
        const test = this.it(name, callback);
        test.skip = true;
        return test;
    }

    /**
     * Setup hooks
     */
    beforeEach(callback) {
        if (this.currentSuite) {
            this.currentSuite.beforeEach = callback;
        }
    }

    afterEach(callback) {
        if (this.currentSuite) {
            this.currentSuite.afterEach = callback;
        }
    }

    beforeAll(callback) {
        if (this.currentSuite) {
            this.currentSuite.beforeAll = callback;
        }
    }

    afterAll(callback) {
        if (this.currentSuite) {
            this.currentSuite.afterAll = callback;
        }
    }

    /**
     * Run all test suites
     */
    async runAll(options = {}) {
        this.isRunning = true;
        this.stopOnFailure = options.stopOnFailure || false;
        
        this.resetResults();
        
        let suiteNames = Array.from(this.suites.keys());
        if (options.filter) {
            suiteNames = suiteNames.filter(name => 
                name.toLowerCase().includes(options.filter.toLowerCase())
            );
        }

        for (const suiteName of suiteNames) {
            if (this.stopOnFailure && this.results.failed > 0) {
                break;
            }
            
            await this.runSuite(suiteName);
        }

        this.isRunning = false;
        return this.results;
    }

    /**
     * Run a specific test suite
     */
    async runSuite(suiteName) {
        const suite = this.suites.get(suiteName);
        if (!suite) {
            throw new Error(`Test suite "${suiteName}" not found`);
        }

        suite.status = 'running';
        suite.startTime = Date.now();
        
        try {
            // Run beforeAll hook
            if (suite.beforeAll) {
                await this.runHook(suite.beforeAll, 'beforeAll');
            }

            // Run each test
            for (const test of suite.tests) {
                if (this.stopOnFailure && this.results.failed > 0) {
                    test.status = 'skipped';
                    suite.results.skipped++;
                    continue;
                }

                await this.runTest(test, suite);
            }

            // Run afterAll hook
            if (suite.afterAll) {
                await this.runHook(suite.afterAll, 'afterAll');
            }

            suite.status = suite.results.failed > 0 ? 'failed' : 'passed';
            
        } catch (error) {
            suite.status = 'failed';
            console.error(`Error in suite "${suiteName}":`, error);
        }

        suite.endTime = Date.now();
        this.results.suites.push({
            name: suiteName,
            ...suite.results,
            status: suite.status,
            duration: suite.endTime - suite.startTime
        });

        return suite;
    }

    /**
     * Run a single test
     */
    async runTest(test, suite) {
        if (test.skip) {
            test.status = 'skipped';
            suite.results.skipped++;
            this.results.skipped++;
            this.results.total++;
            return;
        }

        test.status = 'running';
        test.startTime = Date.now();

        try {
            // Run beforeEach hook
            if (suite.beforeEach) {
                await this.runHook(suite.beforeEach, 'beforeEach');
            }

            // Run the test
            await this.runHook(test.callback, 'test');

            // Run afterEach hook
            if (suite.afterEach) {
                await this.runHook(suite.afterEach, 'afterEach');
            }

            test.status = 'passed';
            suite.results.passed++;
            this.results.passed++;

        } catch (error) {
            test.status = 'failed';
            test.error = error;
            suite.results.failed++;
            this.results.failed++;
        }

        test.endTime = Date.now();
        test.duration = test.endTime - test.startTime;
        suite.results.total++;
        this.results.total++;
    }

    /**
     * Run a hook function with error handling
     */
    async runHook(hook, type) {
        try {
            const result = hook();
            if (result && typeof result.then === 'function') {
                await result;
            }
        } catch (error) {
            throw new Error(`${type} hook failed: ${error.message}`);
        }
    }

    /**
     * Reset test results
     */
    resetResults() {
        this.results = {
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            suites: []
        };

        // Reset suite results
        for (const suite of this.suites.values()) {
            suite.status = 'pending';
            suite.results = {
                total: 0,
                passed: 0,
                failed: 0,
                skipped: 0
            };
            
            // Reset test results
            for (const test of suite.tests) {
                test.status = 'pending';
                test.error = null;
                test.startTime = null;
                test.endTime = null;
                test.duration = 0;
            }
        }
    }

    /**
     * Get all test suites
     */
    getSuites() {
        return Array.from(this.suites.values());
    }

    /**
     * Get test results
     */
    getResults() {
        return this.results;
    }
}

/**
 * Assertion utilities
 */
class Expect {
    constructor(actual) {
        this.actual = actual;
        this.isNot = false;
    }

    get not() {
        this.isNot = !this.isNot;
        return this;
    }

    toBe(expected) {
        const passed = this.isNot ? this.actual !== expected : this.actual === expected;
        if (!passed) {
            throw new Error(`Expected ${this.actual} ${this.isNot ? 'not ' : ''}to be ${expected}`);
        }
        return this;
    }

    toEqual(expected) {
        const passed = this.isNot ? 
            !this.deepEqual(this.actual, expected) : 
            this.deepEqual(this.actual, expected);
        
        if (!passed) {
            throw new Error(`Expected ${JSON.stringify(this.actual)} ${this.isNot ? 'not ' : ''}to equal ${JSON.stringify(expected)}`);
        }
        return this;
    }

    toBeNull() {
        const passed = this.isNot ? this.actual !== null : this.actual === null;
        if (!passed) {
            throw new Error(`Expected ${this.actual} ${this.isNot ? 'not ' : ''}to be null`);
        }
        return this;
    }

    toBeUndefined() {
        const passed = this.isNot ? this.actual !== undefined : this.actual === undefined;
        if (!passed) {
            throw new Error(`Expected ${this.actual} ${this.isNot ? 'not ' : ''}to be undefined`);
        }
        return this;
    }

    toBeDefined() {
        const passed = this.isNot ? this.actual === undefined : this.actual !== undefined;
        if (!passed) {
            throw new Error(`Expected ${this.actual} ${this.isNot ? 'not ' : ''}to be defined`);
        }
        return this;
    }

    toBeTruthy() {
        const passed = this.isNot ? !this.actual : !!this.actual;
        if (!passed) {
            throw new Error(`Expected ${this.actual} ${this.isNot ? 'not ' : ''}to be truthy`);
        }
        return this;
    }

    toBeFalsy() {
        const passed = this.isNot ? !!this.actual : !this.actual;
        if (!passed) {
            throw new Error(`Expected ${this.actual} ${this.isNot ? 'not ' : ''}to be falsy`);
        }
        return this;
    }

    toContain(expected) {
        let contains = false;
        
        if (Array.isArray(this.actual)) {
            contains = this.actual.includes(expected);
        } else if (typeof this.actual === 'string') {
            contains = this.actual.includes(expected);
        } else if (this.actual && typeof this.actual === 'object') {
            contains = expected in this.actual;
        }

        const passed = this.isNot ? !contains : contains;
        if (!passed) {
            throw new Error(`Expected ${JSON.stringify(this.actual)} ${this.isNot ? 'not ' : ''}to contain ${JSON.stringify(expected)}`);
        }
        return this;
    }

    toHaveLength(expected) {
        const actualLength = this.actual ? this.actual.length : 0;
        const passed = this.isNot ? actualLength !== expected : actualLength === expected;
        if (!passed) {
            throw new Error(`Expected length ${actualLength} ${this.isNot ? 'not ' : ''}to be ${expected}`);
        }
        return this;
    }

    toBeGreaterThan(expected) {
        const passed = this.isNot ? this.actual <= expected : this.actual > expected;
        if (!passed) {
            throw new Error(`Expected ${this.actual} ${this.isNot ? 'not ' : ''}to be greater than ${expected}`);
        }
        return this;
    }

    toBeGreaterThanOrEqual(expected) {
        const passed = this.isNot ? this.actual < expected : this.actual >= expected;
        if (!passed) {
            throw new Error(`Expected ${this.actual} ${this.isNot ? 'not ' : ''}to be greater than or equal to ${expected}`);
        }
        return this;
    }

    toBeLessThan(expected) {
        const passed = this.isNot ? this.actual >= expected : this.actual < expected;
        if (!passed) {
            throw new Error(`Expected ${this.actual} ${this.isNot ? 'not ' : ''}to be less than ${expected}`);
        }
        return this;
    }

    toBeLessThanOrEqual(expected) {
        const passed = this.isNot ? this.actual > expected : this.actual <= expected;
        if (!passed) {
            throw new Error(`Expected ${this.actual} ${this.isNot ? 'not ' : ''}to be less than or equal to ${expected}`);
        }
        return this;
    }

    toThrow(expectedError) {
        let threw = false;
        let actualError = null;

        try {
            if (typeof this.actual === 'function') {
                this.actual();
            }
        } catch (error) {
            threw = true;
            actualError = error;
        }

        if (this.isNot) {
            if (threw) {
                throw new Error(`Expected function not to throw, but it threw: ${actualError.message}`);
            }
        } else {
            if (!threw) {
                throw new Error('Expected function to throw an error');
            }
            
            if (expectedError && actualError.message !== expectedError) {
                throw new Error(`Expected error message "${expectedError}", but got "${actualError.message}"`);
            }
        }
        
        return this;
    }

    toBeInstanceOf(expectedClass) {
        let isInstance = false;
        
        if (expectedClass === Array || expectedClass.name === 'Array') {
            // Special handling for Array to work across VM contexts
            isInstance = Array.isArray(this.actual);
        } else if (expectedClass === Object || expectedClass.name === 'Object') {
            // Special handling for Object - exclude null and arrays
            isInstance = this.actual !== null && typeof this.actual === 'object' && !Array.isArray(this.actual);
        } else {
            // Standard instanceof check
            isInstance = this.actual instanceof expectedClass;
        }
        
        const passed = this.isNot ? !isInstance : isInstance;
        
        if (!passed) {
            throw new Error(`Expected ${this.actual} ${this.isNot ? 'not ' : ''}to be instance of ${expectedClass.name}`);
        }
        return this;
    }

    deepEqual(a, b) {
        if (a === b) return true;
        if (a == null || b == null) return false;
        if (typeof a !== typeof b) return false;
        
        if (typeof a === 'object') {
            if (Array.isArray(a) !== Array.isArray(b)) return false;
            
            const keysA = Object.keys(a);
            const keysB = Object.keys(b);
            
            if (keysA.length !== keysB.length) return false;
            
            for (const key of keysA) {
                if (!keysB.includes(key)) return false;
                if (!this.deepEqual(a[key], b[key])) return false;
            }
            
            return true;
        }
        
        return false;
    }
}

/**
 * Global test functions
 */
function expect(actual) {
    return new Expect(actual);
}

// Create global test framework instance
const testFramework = new TestFramework();

// Export global functions
const describe = testFramework.describe.bind(testFramework);
const it = testFramework.it.bind(testFramework);
const xit = testFramework.xit.bind(testFramework);
const beforeEach = testFramework.beforeEach.bind(testFramework);
const afterEach = testFramework.afterEach.bind(testFramework);
const beforeAll = testFramework.beforeAll.bind(testFramework);
const afterAll = testFramework.afterAll.bind(testFramework);

// Mock utilities for testing
const Mock = {
    fn: (implementation) => {
        const mockFn = function(...args) {
            mockFn.calls.push(args);
            mockFn.callCount++;
            
            if (implementation) {
                return implementation.apply(this, args);
            }
            
            return mockFn.returnValue;
        };
        
        mockFn.calls = [];
        mockFn.callCount = 0;
        mockFn.returnValue = undefined;
        
        mockFn.mockReturnValue = (value) => {
            mockFn.returnValue = value;
            return mockFn;
        };
        
        mockFn.mockImplementation = (impl) => {
            implementation = impl;
            return mockFn;
        };
        
        mockFn.mockReset = () => {
            mockFn.calls = [];
            mockFn.callCount = 0;
            mockFn.returnValue = undefined;
            implementation = null;
        };
        
        return mockFn;
    },
    
    spyOn: (object, method) => {
        const original = object[method];
        const spy = Mock.fn(original);
        spy.original = original;
        spy.restore = () => {
            object[method] = original;
        };
        object[method] = spy;
        return spy;
    }
};

// Export for use in tests
window.testFramework = testFramework;
window.expect = expect;
window.describe = describe;
window.it = it;
window.xit = xit;
window.beforeEach = beforeEach;
window.afterEach = afterEach;
window.beforeAll = beforeAll;
window.afterAll = afterAll;
window.Mock = Mock;

// Add skip functionality to it
it.skip = xit; 