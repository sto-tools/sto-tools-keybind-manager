#!/usr/bin/env node

/**
 * Command Line Test Runner for STO Tools Keybind Manager
 * Runs tests in Node.js environment for automated testing and CI/CD
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

class CLITestRunner {
    constructor() {
        this.options = {
            verbose: false,
            filter: null,
            stopOnFailure: false,
            timeout: 30000,
            reporter: 'default',
            outputFile: null
        };
        this.results = {
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            duration: 0,
            suites: []
        };
        this.startTime = 0;
    }

    parseArgs() {
        const args = process.argv.slice(2);
        
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            
            switch (arg) {
                case '--verbose':
                case '-v':
                    this.options.verbose = true;
                    break;
                    
                case '--filter':
                case '-f':
                    this.options.filter = args[++i];
                    break;
                    
                case '--stop-on-failure':
                case '-s':
                    this.options.stopOnFailure = true;
                    break;
                    
                case '--timeout':
                case '-t':
                    this.options.timeout = parseInt(args[++i]) || 30000;
                    break;
                    
                case '--reporter':
                case '-r':
                    this.options.reporter = args[++i] || 'default';
                    break;
                    
                case '--output':
                case '-o':
                    this.options.outputFile = args[++i];
                    break;
                    
                case '--help':
                case '-h':
                    this.showHelp();
                    process.exit(0);
                    break;
                    
                default:
                    if (arg.startsWith('-')) {
                        console.error(`Unknown option: ${arg}`);
                        process.exit(1);
                    }
                    break;
            }
        }
    }

    showHelp() {
        console.log(`
STO Tools Keybind Manager Test Runner

Usage: node cli-runner.js [options]

Options:
  -v, --verbose           Show detailed test output
  -f, --filter <pattern>  Run only tests matching pattern
  -s, --stop-on-failure   Stop on first test failure
  -t, --timeout <ms>      Test timeout in milliseconds (default: 30000)
  -r, --reporter <type>   Reporter type: default, json, junit, tap
  -o, --output <file>     Output file for test results
  -h, --help              Show this help message

Examples:
  node cli-runner.js                    # Run all tests
  node cli-runner.js --verbose          # Run with detailed output
  node cli-runner.js --filter "Data"    # Run only Data module tests
  node cli-runner.js --reporter json    # Output results as JSON
  node cli-runner.js --output results.xml --reporter junit
`);
    }

    async setupEnvironment() {
        // Create global window object for browser compatibility
        global.window = {};
        
        // Mock document object for DOM-dependent code
        global.document = {
            addEventListener: () => {},
            getElementById: () => null,
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: (tag) => ({
                tagName: tag.toUpperCase(),
                innerHTML: '',
                textContent: '',
                value: '',
                className: '',
                style: {},
                addEventListener: () => {},
                appendChild: () => {},
                setAttribute: () => {},
                getAttribute: () => null,
                classList: {
                    add: () => {},
                    remove: () => {},
                    contains: () => false
                }
            })
        };
        
        // Make document available on window as well
        global.window.document = global.document;
        
        // Mock other browser globals that might be needed
        global.localStorage = {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
            clear: () => {},
            length: 0,
            key: () => null
        };
        global.window.localStorage = global.localStorage;

        // Create DOM environment
        const dom = new JSDOM(`
            <!DOCTYPE html>
            <html>
            <head><title>Test Environment</title></head>
            <body></body>
            </html>
        `, {
            url: 'http://localhost',
            pretendToBeVisual: true,
            resources: 'usable'
        });

        // Store references
        this.mockWindow = dom.window;
        this.mockDocument = dom.window.document;
        this.mockLocalStorage = this.createMockLocalStorage();

        // Enhance document with better mocks
        this.mockDocument.getElementById = (id) => ({
            addEventListener: () => {},
            removeEventListener: () => {},
            style: {},
            innerHTML: '',
            textContent: '',
            value: '',
            checked: false,
            disabled: false,
            classList: {
                add: () => {},
                remove: () => {},
                contains: () => false,
                toggle: () => {}
            }
        });
        
        this.mockDocument.addEventListener = () => {};
        this.mockDocument.removeEventListener = () => {};
        this.mockDocument.createElement = (tag) => ({
            addEventListener: () => {},
            removeEventListener: () => {},
            appendChild: () => {},
            removeChild: () => {},
            style: {},
            innerHTML: '',
            textContent: '',
            setAttribute: () => {},
            getAttribute: () => '',
            classList: {
                add: () => {},
                remove: () => {},
                contains: () => false,
                toggle: () => {}
            }
        });

        // Set up global environment
        global.window = this.mockWindow;
        global.document = this.mockDocument;
        global.localStorage = this.mockLocalStorage;
        global.console = console;

        // Load application modules
        await this.loadApplicationModules();
        
        // Create manager aliases for tests
        this.createManagerAliases();
        
        // Load test framework
        await this.loadTestFramework();
        
        // Make test framework functions available globally
        if (global.window && global.window.testFramework) {
            global.testFramework = global.window.testFramework;
            global.describe = global.window.describe;
            global.it = global.window.it;
            global.xit = global.window.xit;
            global.beforeEach = global.window.beforeEach;
            global.afterEach = global.window.afterEach;
            global.beforeAll = global.window.beforeAll;
            global.afterAll = global.window.afterAll;
            global.expect = global.window.expect;
            global.Mock = global.window.Mock;
        }
        
        // Load test suites
        await this.loadTestSuites();
    }

    createMockLocalStorage() {
        const storage = {};
        return {
            getItem: (key) => storage[key] || null,
            setItem: (key, value) => storage[key] = value,
            removeItem: (key) => delete storage[key],
            clear: () => Object.keys(storage).forEach(key => delete storage[key]),
            get length() { return Object.keys(storage).length; },
            key: (index) => Object.keys(storage)[index] || null
        };
    }

    async loadApplicationModules() {
        // Load modules in dependency order
        const moduleFiles = [
            '../src/js/data.js',      // Must be first - defines STO_DATA
            '../src/js/storage.js',   // Depends on STO_DATA
            '../src/js/ui.js',
            '../src/js/commands.js',
            '../src/js/keybinds.js',
            '../src/js/profiles.js',
            '../src/js/aliases.js',
            '../src/js/export.js',
            '../src/js/app.js'        // Main application controller
        ];

        // Create a shared context for all modules
        const sharedContext = {
            console,
            localStorage: global.localStorage,
            window: global.window,
            document: global.document,
            // Don't include global to avoid conflicts
        };
        
        // Create the VM context
        const vm = require('vm');
        vm.createContext(sharedContext);

        for (const file of moduleFiles) {
            try {
                const filePath = path.join(__dirname, file);
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf8');
                    
                    // Execute in shared context
                    vm.runInContext(content, sharedContext);
                    
                    if (this.options.verbose) {
                        console.log(`✓ Loaded ${file}`);
                    }
                } else {
                    console.warn(`⚠ Module not found: ${file}`);
                }
            } catch (error) {
                console.error(`✗ Failed to load ${file}:`, error.message);
                if (this.options.verbose) {
                    console.error(error.stack);
                }
            }
        }

        // Copy all context variables to global, handling read-only properties
        Object.keys(sharedContext).forEach(key => {
            if (!['console', 'localStorage', 'window', 'document'].includes(key)) {
                try {
                    global[key] = sharedContext[key];
                } catch (error) {
                    // Skip read-only properties silently
                    if (this.options.verbose && !error.message.includes('only a getter')) {
                        console.warn(`⚠ Could not set global.${key}:`, error.message);
                    }
                }
            }
        });

        // Ensure data structures and manager instances are properly available on global.window
        if (sharedContext.window) {
            Object.keys(sharedContext.window).forEach(key => {
                // Copy data structures
                if (key.startsWith('STO_') || key.startsWith('COMMAND_') || 
                    key.startsWith('KEY_') || key.startsWith('DEFAULT_') || 
                    key.startsWith('SAMPLE_') || key.startsWith('TRAY_') ||
                    key === 'getCommandsByCategory') {
                    try {
                        let value = sharedContext.window[key];
                        
                        // Recreate arrays with global Array constructor to fix instanceof issues
                        if (Array.isArray(value)) {
                            value = [...value];
                        } else if (value && typeof value === 'object') {
                            // Deep clone objects to ensure they use global constructors
                            value = JSON.parse(JSON.stringify(value));
                        }
                        
                        global.window[key] = value;
                        // Also ensure they're available globally for tests
                        global[key] = value;
                    } catch (error) {
                        if (this.options.verbose) {
                            console.warn(`⚠ Could not copy ${key}:`, error.message);
                        }
                    }
                }
                
                // Copy manager instances (these are objects with methods, don't clone them)
                if (key.startsWith('sto') && typeof sharedContext.window[key] === 'object' && 
                    sharedContext.window[key] !== null) {
                    try {
                        global.window[key] = sharedContext.window[key];
                        global[key] = sharedContext.window[key];
                        if (this.options.verbose) {
                            console.log(`✓ Copied manager ${key}`);
                        }
                    } catch (error) {
                        if (this.options.verbose) {
                            console.warn(`⚠ Could not copy manager ${key}:`, error.message);
                        }
                    }
                }
            });
        }
    }

    async loadTestFramework() {
        try {
            const frameworkPath = path.join(__dirname, 'framework/test-framework.js');
            const content = fs.readFileSync(frameworkPath, 'utf8');
            
            // Create a context with necessary globals
            const context = {
                console,
                localStorage: global.localStorage,
                window: global.window,
                document: global.document,
                global,
                // Add any existing globals that might have been defined
                ...global
            };
            
            // Execute in context and assign to global
            const vm = require('vm');
            vm.createContext(context);
            vm.runInContext(content, context);
            
            // Copy context variables to global (skip read-only properties)
            Object.keys(context).forEach(key => {
                if (!['console', 'localStorage', 'window', 'document', 'global', 'navigator'].includes(key)) {
                    try {
                        global[key] = context[key];
                    } catch (error) {
                        // Skip read-only properties silently
                        if (this.options.verbose && !error.message.includes('only a getter')) {
                            console.warn(`⚠ Could not set global.${key}:`, error.message);
                        }
                    }
                }
            });
            
            if (this.options.verbose) {
                console.log('✓ Loaded test framework');
            }
        } catch (error) {
            console.error('✗ Failed to load test framework:', error.message);
            if (this.options.verbose) {
                console.error(error.stack);
            }
            process.exit(1);
        }
    }

    async loadTestSuites() {
        const suiteFiles = [
            'data.test.js',
            'storage.test.js',
            'commands.test.js',
            'keybinds.test.js',
            'profiles.test.js',
            'aliases.test.js',
            'export.test.js',
            'integration.test.js'
        ];

        // Ensure window is available in global context for tests
        if (!global.window) {
            global.window = {};
        }
        
        // Copy all managers to the global window object that tests will access
        Object.keys(global).forEach(key => {
            if (key.startsWith('sto') && typeof global[key] === 'object' && global[key] !== null) {
                global.window[key] = global[key];
                if (this.options.verbose) {
                    console.log(`✓ Made ${key} available on global.window for tests`);
                }
            }
        });
        
        // Make window available directly as a global variable so tests can access window.stoKeybinds
        global['window'] = global.window;
        if (this.options.verbose) {
            console.log(`✓ Made window available as global variable`);
        }

        for (const file of suiteFiles) {
            try {
                const filePath = path.join(__dirname, 'suites', file);
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf8');
                    
                    // Execute test suites directly in global context to avoid VM context issues
                    eval(content);
                    
                    if (this.options.verbose) {
                        console.log(`✓ Loaded ${file}`);
                    }
                } else {
                    console.warn(`⚠ Test suite not found: ${file}`);
                }
            } catch (error) {
                console.error(`✗ Failed to load ${file}:`, error.message);
                if (this.options.verbose) {
                    console.error(error.stack);
                }
            }
        }
    }

    async runTests() {
        this.startTime = Date.now();
        
        try {
            const testFramework = global.testFramework;
            if (!testFramework) {
                throw new Error('Test framework not loaded');
            }

            // Configure test options
            const runOptions = {
                stopOnFailure: this.options.stopOnFailure,
                filter: this.options.filter
            };

            // Set timeout
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Test timeout')), this.options.timeout);
            });

            // Run tests with timeout
            const testPromise = testFramework.runAll(runOptions);
            this.results = await Promise.race([testPromise, timeoutPromise]);
            
            this.results.duration = Date.now() - this.startTime;
            
        } catch (error) {
            console.error('Test execution failed:', error.message);
            process.exit(1);
        }
    }

    generateReport() {
        switch (this.options.reporter) {
            case 'json':
                return this.generateJSONReport();
            case 'junit':
                return this.generateJUnitReport();
            case 'tap':
                return this.generateTAPReport();
            default:
                return this.generateDefaultReport();
        }
    }

    generateDefaultReport() {
        const { total, passed, failed, skipped, duration } = this.results;
        const success = failed === 0;
        
        let report = '\n';
        report += '='.repeat(60) + '\n';
        report += '  STO Tools Keybind Manager Test Results\n';
        report += '='.repeat(60) + '\n\n';
        
        // Summary
        report += `Tests:       ${total}\n`;
        report += `Passed:      ${passed} (${((passed/total)*100).toFixed(1)}%)\n`;
        report += `Failed:      ${failed}\n`;
        report += `Skipped:     ${skipped}\n`;
        report += `Duration:    ${duration}ms\n`;
        report += `Status:      ${success ? '✅ PASSED' : '❌ FAILED'}\n\n`;
        
        // Suite details
        if (this.options.verbose || failed > 0) {
            report += 'Test Suites:\n';
            report += '-'.repeat(40) + '\n';
            
            this.results.suites.forEach(suite => {
                const status = suite.status === 'passed' ? '✅' : 
                              suite.status === 'failed' ? '❌' : '⏭️';
                
                report += `${status} ${suite.name}\n`;
                report += `   ${suite.passed}/${suite.total} passed`;
                if (suite.failed > 0) report += `, ${suite.failed} failed`;
                if (suite.skipped > 0) report += `, ${suite.skipped} skipped`;
                report += ` (${suite.duration}ms)\n\n`;
            });
        }
        
        // Failed tests details
        if (failed > 0) {
            report += 'Failed Tests:\n';
            report += '-'.repeat(40) + '\n';
            
            const testFramework = global.testFramework;
            testFramework.getSuites().forEach(suite => {
                suite.tests.forEach(test => {
                    if (test.status === 'failed') {
                        report += `❌ ${suite.name} > ${test.name}\n`;
                        report += `   ${test.error.message}\n\n`;
                    }
                });
            });
        }
        
        return report;
    }

    generateJSONReport() {
        const report = {
            summary: {
                total: this.results.total,
                passed: this.results.passed,
                failed: this.results.failed,
                skipped: this.results.skipped,
                duration: this.results.duration,
                success: this.results.failed === 0,
                timestamp: new Date().toISOString()
            },
            suites: this.results.suites,
            tests: []
        };

        // Add individual test details
        const testFramework = global.testFramework;
        testFramework.getSuites().forEach(suite => {
            suite.tests.forEach(test => {
                report.tests.push({
                    suite: suite.name,
                    name: test.name,
                    status: test.status,
                    duration: test.duration,
                    error: test.error ? test.error.message : null
                });
            });
        });

        return JSON.stringify(report, null, 2);
    }

    generateJUnitReport() {
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += `<testsuites tests="${this.results.total}" failures="${this.results.failed}" `;
        xml += `skipped="${this.results.skipped}" time="${this.results.duration/1000}">\n`;

        const testFramework = global.testFramework;
        testFramework.getSuites().forEach(suite => {
            xml += `  <testsuite name="${this.escapeXML(suite.name)}" `;
            xml += `tests="${suite.results.total}" failures="${suite.results.failed}" `;
            xml += `skipped="${suite.results.skipped}" time="${(suite.endTime - suite.startTime)/1000}">\n`;

            suite.tests.forEach(test => {
                xml += `    <testcase name="${this.escapeXML(test.name)}" `;
                xml += `time="${test.duration/1000}"`;
                
                if (test.status === 'failed') {
                    xml += '>\n';
                    xml += `      <failure message="${this.escapeXML(test.error.message)}">`;
                    xml += this.escapeXML(test.error.stack || test.error.message);
                    xml += '</failure>\n';
                    xml += '    </testcase>\n';
                } else if (test.status === 'skipped') {
                    xml += '>\n      <skipped/>\n    </testcase>\n';
                } else {
                    xml += '/>\n';
                }
            });

            xml += '  </testsuite>\n';
        });

        xml += '</testsuites>\n';
        return xml;
    }

    generateTAPReport() {
        let tap = `1..${this.results.total}\n`;
        let testNumber = 1;

        const testFramework = global.testFramework;
        testFramework.getSuites().forEach(suite => {
            suite.tests.forEach(test => {
                const status = test.status === 'passed' ? 'ok' : 'not ok';
                const name = `${suite.name} > ${test.name}`;
                
                tap += `${status} ${testNumber} - ${name}`;
                
                if (test.status === 'skipped') {
                    tap += ' # SKIP';
                } else if (test.status === 'failed') {
                    tap += `\n  ---\n  message: "${test.error.message}"\n  ...`;
                }
                
                tap += '\n';
                testNumber++;
            });
        });

        return tap;
    }

    escapeXML(str) {
        if (!str) return '';
        return str.replace(/[<>&'"]/g, (char) => {
            switch (char) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case "'": return '&apos;';
                case '"': return '&quot;';
                default: return char;
            }
        });
    }

    async saveReport(report) {
        if (this.options.outputFile) {
            try {
                fs.writeFileSync(this.options.outputFile, report);
                if (this.options.verbose) {
                    console.log(`Report saved to: ${this.options.outputFile}`);
                }
            } catch (error) {
                console.error(`Failed to save report: ${error.message}`);
            }
        }
    }

    async run() {
        try {
            this.parseArgs();
            
            if (this.options.verbose) {
                console.log('Setting up test environment...');
            }
            
            await this.setupEnvironment();
            
            if (this.options.verbose) {
                console.log('Running tests...\n');
            }
            
            await this.runTests();
            
            const report = this.generateReport();
            
            if (this.options.reporter === 'json' || this.options.reporter === 'junit' || this.options.reporter === 'tap') {
                if (!this.options.outputFile) {
                    console.log(report);
                }
            } else {
                console.log(report);
            }
            
            await this.saveReport(report);
            
            // Exit with appropriate code
            process.exit(this.results.failed > 0 ? 1 : 0);
            
        } catch (error) {
            console.error('Test runner failed:', error.message);
            if (this.options.verbose) {
                console.error(error.stack);
            }
            process.exit(1);
        }
    }

    createManagerAliases() {
        // Create aliases for test compatibility using the actual application managers
        if (global.window) {
            // Use the actual STOStorage instance for storage tests
            global.window.storageManager = global.window.stoStorage;
            global.storageManager = global.window.storageManager;
            
            // Use the actual manager instances
            global.window.commandManager = global.window.stoCommands;
            global.commandManager = global.window.commandManager;
            
            global.window.keybindManager = global.window.stoKeybinds;
            global.keybindManager = global.window.keybindManager;
            
            global.window.profileManager = global.window.stoProfiles;
            global.profileManager = global.window.profileManager;
            
            global.window.aliasManager = global.window.stoAliases;
            global.aliasManager = global.window.aliasManager;
            
            global.window.exportManager = global.window.stoExport;
            global.exportManager = global.window.exportManager;
            
            if (this.options.verbose) {
                console.log('✓ Created manager aliases for tests');
            }
        }
    }
}

// Run if called directly
if (require.main === module) {
    const runner = new CLITestRunner();
    runner.run();
}

module.exports = CLITestRunner; 