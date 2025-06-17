#!/usr/bin/env node

/**
 * End-to-End Test Runner for STO Tools Keybind Manager Web Application
 * Tests the actual web interface functionality by loading the HTML page
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { spawn } = require('child_process');
const http = require('http');

class E2ETestRunner {
    constructor() {
        this.options = {
            verbose: false,
            timeout: 30000,
            reporter: 'default',
            filter: null,
            stopOnFailure: false
        };
        
        this.results = {
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            suites: [],
            duration: 0
        };
        
        this.startTime = null;
        this.dom = null;
        this.window = null;
        this.document = null;
        this.webServer = null;
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
                case '--timeout':
                    this.options.timeout = parseInt(args[++i]) || 30000;
                    break;
                case '--reporter':
                    this.options.reporter = args[++i] || 'default';
                    break;
                case '--filter':
                    this.options.filter = args[++i];
                    break;
                case '--stop-on-failure':
                    this.options.stopOnFailure = true;
                    break;
                case '--help':
                case '-h':
                    this.showHelp();
                    process.exit(0);
                    break;
                default:
                    if (arg.startsWith('--')) {
                        console.error(`Unknown option: ${arg}`);
                        process.exit(1);
                    }
            }
        }
    }

    showHelp() {
        console.log(`
STO Tools Keybind Manager E2E Test Runner

Usage: node e2e-runner.js [options]

Options:
  --verbose, -v          Show verbose output
  --timeout <ms>         Test timeout in milliseconds (default: 30000)
  --reporter <type>      Reporter type: default, json, junit, tap
  --filter <pattern>     Run only tests matching pattern
  --stop-on-failure      Stop on first test failure
  --help, -h             Show this help message

Examples:
  node e2e-runner.js --verbose
  node e2e-runner.js --filter "Profile Management"
  node e2e-runner.js --reporter json --timeout 60000
        `);
    }

    async startWebServer() {
        return new Promise((resolve, reject) => {
            if (this.options.verbose) {
                console.log('🌐 Starting Python web server on port 3000...');
            }
            
            const webRoot = path.join(__dirname, '..', 'src');
            const server = spawn('python', ['-m', 'http.server', '3000'], {
                cwd: webRoot,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let serverReady = false;

            server.stdout.on('data', (data) => {
                const output = data.toString();
                if (this.options.verbose) {
                    console.log('Server:', output.trim());
                }
                if (output.includes('Serving HTTP') || output.includes('3000')) {
                    if (!serverReady) {
                        serverReady = true;
                        if (this.options.verbose) {
                            console.log('✓ Web server started successfully');
                        }
                        resolve(server);
                    }
                }
            });

            server.stderr.on('data', (data) => {
                console.error('Server error:', data.toString());
            });

            server.on('error', (error) => {
                console.error('Failed to start server:', error.message);
                reject(error);
            });

            // Fallback timeout
            setTimeout(() => {
                if (!serverReady) {
                    if (this.options.verbose) {
                        console.log('✓ Web server assumed ready (timeout)');
                    }
                    resolve(server);
                }
            }, 3000);
        });
    }

    async stopWebServer() {
        if (this.webServer) {
            if (this.options.verbose) {
                console.log('🛑 Stopping web server...');
            }
            this.webServer.kill('SIGTERM');
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (!this.webServer.killed) {
                this.webServer.kill('SIGKILL');
            }
            if (this.options.verbose) {
                console.log('✓ Web server stopped');
            }
        }
    }

    async waitForServer(url, maxAttempts = 10) {
        for (let i = 0; i < maxAttempts; i++) {
            try {
                await new Promise((resolve, reject) => {
                    const req = http.get(url, (res) => {
                        if (res.statusCode === 200) {
                            if (this.options.verbose) {
                                console.log('✓ Server is responding');
                            }
                            resolve(true);
                        } else {
                            reject(new Error(`Server returned ${res.statusCode}`));
                        }
                    });
                    
                    req.on('error', reject);
                    req.setTimeout(2000, () => {
                        req.destroy();
                        reject(new Error('Request timeout'));
                    });
                });
                
                return true;
            } catch (error) {
                // Server not ready yet
            }
            
            if (this.options.verbose) {
                console.log(`Waiting for server... (${i + 1}/${maxAttempts})`);
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        if (this.options.verbose) {
            console.log('⚠ Server may not be fully ready, proceeding anyway...');
        }
        return false;
    }

    async setupEnvironment() {
        if (this.options.verbose) {
            console.log('Setting up E2E test environment...');
        }

        try {
            // Start web server
            this.webServer = await this.startWebServer();
            
            // Wait for server to be ready
            if (this.options.verbose) {
                console.log('⏳ Waiting for server to be ready...');
            }
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const serverReady = await this.waitForServer('http://localhost:3000/', 15);
            if (!serverReady && this.options.verbose) {
                console.log('⚠ Server may not be fully ready, but proceeding...');
            }

            // Load the page from the server
            if (this.options.verbose) {
                console.log('📡 Loading page from web server...');
            }

            // Create JSDOM environment by loading from the actual server
            this.dom = await JSDOM.fromURL('http://localhost:3000/', {
                resources: 'usable',
                runScripts: 'dangerously',
                pretendToBeVisual: true,
                beforeParse(window) {
                    // Mock browser APIs that might not be available in JSDOM
                    window.alert = (msg) => console.log('ALERT:', msg);
                    window.confirm = (msg) => {
                        console.log('CONFIRM:', msg);
                        return true; // Default to yes for tests
                    };
                    window.prompt = (msg, defaultValue) => {
                        console.log('PROMPT:', msg);
                        return defaultValue || 'test';
                    };
                    
                    // Mock file APIs
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
                    
                    // Mock MouseEvent constructor for proper event dispatching
                    if (!window.MouseEvent) {
                        window.MouseEvent = class MockMouseEvent extends window.Event {
                            constructor(type, options = {}) {
                                super(type, options);
                                this.bubbles = options.bubbles || false;
                                this.cancelable = options.cancelable || false;
                                this.view = options.view || window;
                                this.detail = options.detail || 0;
                                this.screenX = options.screenX || 0;
                                this.screenY = options.screenY || 0;
                                this.clientX = options.clientX || 0;
                                this.clientY = options.clientY || 0;
                                this.ctrlKey = options.ctrlKey || false;
                                this.shiftKey = options.shiftKey || false;
                                this.altKey = options.altKey || false;
                                this.metaKey = options.metaKey || false;
                                this.button = options.button || 0;
                                this.buttons = options.buttons || 0;
                                this.relatedTarget = options.relatedTarget || null;
                            }
                        };
                    }
                }
            });

            this.window = this.dom.window;
            this.document = this.window.document;
            global.window = this.window;
            global.document = this.document;
            global.localStorage = this.window.localStorage;
            
            // Ensure MouseEvent is available globally for tests
            if (!global.MouseEvent && this.window.MouseEvent) {
                global.MouseEvent = this.window.MouseEvent;
            }

            if (this.options.verbose) {
                console.log('✓ JSDOM environment created from server');
            }

            // Wait for scripts to load
            if (this.options.verbose) {
                console.log('⏳ Waiting for scripts to load...');
            }
            await new Promise(resolve => setTimeout(resolve, 8000)); // Wait 8 seconds for scripts

            // Wait for DOM to be ready
            await this.waitForDOMReady();

            if (this.options.verbose) {
                console.log('✓ E2E environment setup complete');
            }

        } catch (error) {
            console.error('✗ Failed to setup E2E environment:', error.message);
            if (this.options.verbose) {
                console.error(error.stack);
            }
            await this.stopWebServer();
            process.exit(1);
        }
    }

    // Application modules are now loaded via the web server, no need for manual loading

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

    async loadTestFramework() {
        try {
            const frameworkPath = path.join(__dirname, 'framework/test-framework.js');
            const content = fs.readFileSync(frameworkPath, 'utf8');
            
            // Execute in window context
            const script = this.document.createElement('script');
            script.textContent = content;
            this.document.head.appendChild(script);
            
            // Wait for framework to initialize
            await this.sleep(100);
            
            // Make test framework available globally
            global.testFramework = this.window.testFramework;
            global.describe = this.window.describe;
            global.it = this.window.it;
            global.beforeAll = this.window.beforeAll;
            global.beforeEach = this.window.beforeEach;
            global.afterEach = this.window.afterEach;
            global.afterAll = this.window.afterAll;
            global.expect = this.window.expect;

            if (this.options.verbose) {
                console.log('✓ Loaded E2E test framework');
            }
        } catch (error) {
            console.error('✗ Failed to load E2E test framework:', error.message);
            if (this.options.verbose) {
                console.error(error.stack);
            }
            process.exit(1);
        }
    }

    async loadTestSuites() {
        const suiteFiles = [
            'e2e/ui-elements.test.js',
            'e2e/profile-management.test.js',
            'e2e/key-binding.test.js',
            'e2e/command-library.test.js',
            'e2e/alias-management.test.js',
            'e2e/export-import.test.js',
            'e2e/sample-bind-files.test.js',
            'e2e/user-workflows.test.js',
            'e2e/space-ground-toggle.test.js'
        ];

        for (const file of suiteFiles) {
            try {
                const filePath = path.join(__dirname, 'suites', file);
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf8');
                    
                    // Execute test suites in global context
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
                setTimeout(() => reject(new Error('E2E test timeout')), this.options.timeout);
            });

            // Run tests with timeout
            const testPromise = testFramework.runAll(runOptions);
            this.results = await Promise.race([testPromise, timeoutPromise]);
            
            this.results.duration = Date.now() - this.startTime;
            
        } catch (error) {
            console.error('E2E test execution failed:', error.message);
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
        report += '  STO Tools Keybind Manager E2E Test Results\n';
        report += '='.repeat(60) + '\n\n';
        
        // Summary
        report += `Tests:       ${total}\n`;
        report += `Passed:      ${passed} (${total > 0 ? ((passed/total)*100).toFixed(1) : 0}%)\n`;
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
        return JSON.stringify(this.results, null, 2);
    }

    generateJUnitReport() {
        // JUnit XML format implementation
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += `<testsuites tests="${this.results.total}" failures="${this.results.failed}" time="${this.results.duration / 1000}">\n`;
        
        this.results.suites.forEach(suite => {
            xml += `  <testsuite name="${this.escapeXML(suite.name)}" tests="${suite.total}" failures="${suite.failed}" time="${suite.duration / 1000}">\n`;
            
            const testFramework = global.testFramework;
            const suiteObj = testFramework.getSuites().find(s => s.name === suite.name);
            if (suiteObj) {
                suiteObj.tests.forEach(test => {
                    xml += `    <testcase name="${this.escapeXML(test.name)}" time="${test.duration / 1000}">\n`;
                    if (test.status === 'failed') {
                        xml += `      <failure message="${this.escapeXML(test.error.message)}">${this.escapeXML(test.error.stack || '')}</failure>\n`;
                    }
                    xml += `    </testcase>\n`;
                });
            }
            
            xml += `  </testsuite>\n`;
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
                tap += `${status} ${testNumber} - ${suite.name} > ${test.name}\n`;
                if (test.status === 'failed') {
                    tap += `  ---\n`;
                    tap += `  message: ${test.error.message}\n`;
                    tap += `  severity: fail\n`;
                    tap += `  ...\n`;
                }
                testNumber++;
            });
        });
        
        return tap;
    }

    escapeXML(str) {
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
        if (this.options.reporter !== 'default') {
            const extension = this.options.reporter === 'json' ? 'json' : 
                             this.options.reporter === 'junit' ? 'xml' : 'tap';
            const filename = `e2e-test-results.${extension}`;
            const filepath = path.join(__dirname, 'results', filename);
            
            // Ensure results directory exists
            const resultsDir = path.dirname(filepath);
            if (!fs.existsSync(resultsDir)) {
                fs.mkdirSync(resultsDir, { recursive: true });
            }
            
            fs.writeFileSync(filepath, report);
            console.log(`Report saved to: ${filepath}`);
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async run() {
        try {
            this.parseArgs();
            
            console.log('🌐 Starting STO Tools Keybind Manager E2E Tests...\n');
            
            await this.setupEnvironment();
            await this.loadTestFramework();
            await this.loadTestSuites();
            
            if (this.options.verbose) {
                console.log('Running E2E tests...\n');
            }
            
            await this.runTests();
            
            const report = this.generateReport();
            console.log(report);
            
            await this.saveReport(report);
            
            // Cleanup
            await this.stopWebServer();
            
            // Exit with appropriate code
            process.exit(this.results.failed > 0 ? 1 : 0);
            
        } catch (error) {
            console.error('E2E test runner failed:', error.message);
            if (this.options.verbose) {
                console.error(error.stack);
            }
            
            // Cleanup on error
            await this.stopWebServer();
            process.exit(1);
        }
    }
}

// Run if called directly
if (require.main === module) {
    const runner = new E2ETestRunner();
    runner.run();
}

module.exports = E2ETestRunner; 