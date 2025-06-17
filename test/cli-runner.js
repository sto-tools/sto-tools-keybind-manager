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
        if (this.options.verbose) {
            console.log('Setting up test environment...');
        }

        try {
            // Load the actual HTML file like E2E runner
            const indexPath = path.join(__dirname, '../src/index.html');
            let htmlContent = fs.readFileSync(indexPath, 'utf8');
            
            // Create DOM environment from actual HTML with E2E-like setup
            this.dom = new JSDOM(htmlContent, {
                url: 'file://' + path.resolve(indexPath),
                pretendToBeVisual: true,
                resources: 'usable',
                runScripts: 'dangerously', // Allow scripts to run naturally like E2E
                beforeParse: (window) => {
                    // Mock browser APIs similar to E2E runner
                    window.alert = (msg) => {
                        if (this.options.verbose) console.log('ALERT:', msg);
                    };
                    window.confirm = (msg) => {
                        if (this.options.verbose) console.log('CONFIRM:', msg);
                        return true; // Default to yes for tests
                    };
                    window.prompt = (msg, defaultValue) => {
                        if (this.options.verbose) console.log('PROMPT:', msg);
                        return defaultValue || 'test';
                    };
                    
                    // Mock file APIs
                    window.URL = window.URL || {};
                    window.URL.createObjectURL = () => 'blob:mock-url';
                    window.URL.revokeObjectURL = () => {};
                    
                    // Mock Blob constructor
                    if (!window.Blob) {
                        window.Blob = class MockBlob {
                            constructor(parts, options) {
                                this.parts = parts;
                                this.options = options;
                            }
                        };
                    }
                }
            });

            this.window = this.dom.window;
            this.document = this.window.document;
            
            // Force document to be in complete state (like E2E runner)
            Object.defineProperty(this.document, 'readyState', {
                value: 'complete',
                writable: false,
                configurable: true
            });
            
            // Set up global environment
            global.window = this.window;
            global.document = this.document;
            
            // Replace localStorage with enhanced mock BEFORE scripts run
            const mockLocalStorage = this.createMockLocalStorage();
            this.window.localStorage = mockLocalStorage;
            global.localStorage = mockLocalStorage;
            
            // Ensure the DOM has it too
            Object.defineProperty(this.window, 'localStorage', {
                value: mockLocalStorage,
                writable: false,
                configurable: false
            });

            if (this.options.verbose) {
                console.log('✓ JSDOM environment created from HTML file');
            }

            // Wait for scripts to load naturally (like E2E runner)
            if (this.options.verbose) {
                console.log('⏳ Waiting for scripts to load naturally...');
            }
            await this.sleep(5000); // Wait 5 seconds for scripts like E2E
            
            // Wait for application to be ready
            await this.waitForApplicationReady();
            
            // Bridge window context to global context for tests
            this.bridgeWindowToGlobal();

            // Load test framework
            await this.loadTestFramework();
            
            // Make test framework functions available globally
            this.exposeTestFramework();
            
            // Load test suites
            await this.loadTestSuites();

            if (this.options.verbose) {
                console.log('✓ CLI test environment setup complete');
            }

        } catch (error) {
            console.error('✗ Failed to setup CLI environment:', error.message);
            if (this.options.verbose) {
                console.error(error.stack);
            }
            process.exit(1);
        }
    }

    createMockLocalStorage() {
        const storage = {};
        return {
            getItem: (key) => storage[key] || null,
            setItem: (key, value) => {
                // Allow tests to override setItem for error simulation
                if (typeof storage[key] === 'function') {
                    return storage[key](key, value);
                }
                storage[key] = value;
            },
            removeItem: (key) => delete storage[key],
            clear: () => Object.keys(storage).forEach(key => delete storage[key]),
            get length() { return Object.keys(storage).length; },
            key: (index) => Object.keys(storage)[index] || null
        };
    }



    async waitForApplicationReady() {
        // Wait for DOM to be ready (similar to E2E runner)
        await this.waitForDOMReady();
        
        // Wait for application modules to initialize
        const maxAttempts = 50; // 5 seconds max
        for (let i = 0; i < maxAttempts; i++) {
            // Check if key application objects are available
            if (this.window.STO_DATA && 
                this.window.stoStorage && 
                this.window.stoUI && 
                this.window.stoCommands &&
                this.window.app) {
                
                if (this.options.verbose) {
                    console.log('✓ Application modules loaded and ready');
                }
                
                // Give app a moment to fully initialize
                await this.sleep(100);
                return;
            }
            
            await this.sleep(100); // Wait 100ms
        }
        
        // If we get here, log what's available for debugging
        const available = {
            STO_DATA: !!this.window.STO_DATA,
            stoStorage: !!this.window.stoStorage,
            stoUI: !!this.window.stoUI,
            stoCommands: !!this.window.stoCommands,
            app: !!this.window.app
        };
        
        if (this.options.verbose) {
            console.log('⚠ Application not fully ready, available modules:', available);
        }
    }

    async waitForDOMReady() {
        return new Promise((resolve) => {
            if (this.document.readyState === 'complete') {
                resolve();
            } else {
                this.document.addEventListener('DOMContentLoaded', resolve);
                // Fallback timeout
                setTimeout(resolve, 1000);
            }
        });
    }

    exposeTestFramework() {
        if (this.window && this.window.testFramework) {
            global.testFramework = this.window.testFramework;
            global.describe = this.window.describe;
            global.it = this.window.it;
            global.xit = this.window.xit;
            global.beforeEach = this.window.beforeEach;
            global.afterEach = this.window.afterEach;
            global.beforeAll = this.window.beforeAll;
            global.afterAll = this.window.afterAll;
            global.expect = this.window.expect;
            global.Mock = this.window.Mock;
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    bridgeWindowToGlobal() {
        // Copy all application modules from window to global context for tests
        const moduleNames = [
            'STO_DATA', 'STO_COMMANDS', 'STO_KEY_LAYOUTS', 'STO_DEFAULT_SETTINGS',
            'STO_SAMPLE_PROFILES', 'STO_SAMPLE_ALIASES', 'STO_TRAY_CONFIG',
            'COMMAND_CATEGORIES', 'KEY_CATEGORIES', 'DEFAULT_PROFILE_SETTINGS',
            'stoStorage', 'stoUI', 'stoCommands', 'stoKeybinds', 'stoProfiles',
            'stoAliases', 'stoExport', 'app', 'getCommandsByCategory'
        ];

        moduleNames.forEach(name => {
            if (this.window[name] !== undefined) {
                global[name] = this.window[name];
                global.window[name] = this.window[name]; // Also ensure it's on global.window
                
                if (this.options.verbose) {
                    console.log(`✓ Bridged ${name} to global context`);
                }
            } else if (this.options.verbose) {
                console.log(`⚠ ${name} not found in window context`);
            }
        });

        // Create compatibility aliases for tests
        if (this.window.stoStorage) {
            global.storageManager = this.window.stoStorage;
            global.window.storageManager = this.window.stoStorage;
            global.StorageManager = this.window.stoStorage; // Some tests expect this capitalization
            global.window.StorageManager = this.window.stoStorage;
        }

        if (this.window.stoCommands) {
            global.commandManager = this.window.stoCommands;
            global.window.commandManager = this.window.stoCommands;
        }

        if (this.window.stoKeybinds) {
            global.keybindManager = this.window.stoKeybinds;
            global.window.keybindManager = this.window.stoKeybinds;
        }

        if (this.window.stoProfiles) {
            global.profileManager = this.window.stoProfiles;
            global.window.profileManager = this.window.stoProfiles;
        }

        if (this.window.stoAliases) {
            global.aliasManager = this.window.stoAliases;
            global.window.aliasManager = this.window.stoAliases;
        }

        if (this.window.stoExport) {
            global.exportManager = this.window.stoExport;
            global.window.exportManager = this.window.stoExport;
        }

        if (this.options.verbose) {
            console.log('✓ Completed bridging window context to global context');
        }
    }



    async loadTestFramework() {
        try {
            const frameworkPath = path.join(__dirname, 'framework/test-framework.js');
            const content = fs.readFileSync(frameworkPath, 'utf8');
            
            // Execute test framework directly in global context
            eval(content);
            
            // Wait for framework to initialize
            await this.sleep(100);
            
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

        for (const file of suiteFiles) {
            try {
                const filePath = path.join(__dirname, 'suites', file);
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf8');
                    
                    // Execute test suites in global context like E2E runner
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


}

// Run if called directly
if (require.main === module) {
    const runner = new CLITestRunner();
    runner.run();
}

module.exports = CLITestRunner; 