/**
 * Test Runner - Manages test execution and UI updates
 */

class TestRunner {
    constructor() {
        this.framework = window.testFramework;
        this.isRunning = false;
        this.currentTest = null;
        
        this.initializeUI();
        this.bindEvents();
    }

    initializeUI() {
        this.elements = {
            runAllTests: document.getElementById('runAllTests'),
            runUnitTests: document.getElementById('runUnitTests'),
            runIntegrationTests: document.getElementById('runIntegrationTests'),
            clearResults: document.getElementById('clearResults'),
            stopOnFailure: document.getElementById('stopOnFailure'),
            progressFill: document.getElementById('progressFill'),
            totalTests: document.getElementById('totalTests'),
            passedTests: document.getElementById('passedTests'),
            failedTests: document.getElementById('failedTests'),
            skippedTests: document.getElementById('skippedTests'),
            testResults: document.getElementById('testResults'),
            consoleOutput: document.getElementById('consoleOutput')
        };

        this.updateStats();
        this.renderSuites();
    }

    bindEvents() {
        this.elements.runAllTests.addEventListener('click', () => this.runAllTests());
        this.elements.runUnitTests.addEventListener('click', () => this.runUnitTests());
        this.elements.runIntegrationTests.addEventListener('click', () => this.runIntegrationTests());
        this.elements.clearResults.addEventListener('click', () => this.clearResults());
        
        // Suite header click handlers will be bound when suites are rendered
    }

    async runAllTests() {
        if (this.isRunning) return;
        
        this.setRunning(true);
        this.clearConsole();
        this.log('Starting all tests...', 'info');
        
        try {
            const options = {
                stopOnFailure: this.elements.stopOnFailure.checked
            };
            
            await this.framework.runAll(options);
            const results = this.framework.getResults();
            this.log(`All tests completed! ${results.passed}/${results.total} passed (${((results.passed/results.total)*100).toFixed(1)}%)`, 'success');
            
        } catch (error) {
            this.log(`Test execution failed: ${error.message}`, 'error');
        }
        
        this.setRunning(false);
        this.updateUI();
    }

    async runUnitTests() {
        if (this.isRunning) return;
        
        this.setRunning(true);
        this.clearConsole();
        this.log('Starting unit tests...', 'info');
        
        try {
            const options = {
                stopOnFailure: this.elements.stopOnFailure.checked,
                filter: 'unit'
            };
            
            // Run suites that don't contain 'integration' in their name
            const suiteNames = Array.from(this.framework.suites.keys())
                .filter(name => !name.toLowerCase().includes('integration'));
            
            for (const suiteName of suiteNames) {
                await this.framework.runSuite(suiteName);
                this.updateUI();
            }
            
            this.log('Unit tests completed!', 'success');
            
        } catch (error) {
            this.log(`Unit test execution failed: ${error.message}`, 'error');
        }
        
        this.setRunning(false);
        this.updateUI();
    }

    async runIntegrationTests() {
        if (this.isRunning) return;
        
        this.setRunning(true);
        this.clearConsole();
        this.log('Starting integration tests...', 'info');
        
        try {
            const options = {
                stopOnFailure: this.elements.stopOnFailure.checked
            };
            
            // Run only integration test suites
            const suiteNames = Array.from(this.framework.suites.keys())
                .filter(name => name.toLowerCase().includes('integration'));
            
            for (const suiteName of suiteNames) {
                await this.framework.runSuite(suiteName);
                this.updateUI();
            }
            
            this.log('Integration tests completed!', 'success');
            
        } catch (error) {
            this.log(`Integration test execution failed: ${error.message}`, 'error');
        }
        
        this.setRunning(false);
        this.updateUI();
    }

    clearResults() {
        this.framework.resetResults();
        this.updateUI();
        this.clearConsole();
        this.log('Test results cleared', 'info');
    }

    setRunning(running) {
        this.isRunning = running;
        
        // Disable/enable buttons
        this.elements.runAllTests.disabled = running;
        this.elements.runUnitTests.disabled = running;
        this.elements.runIntegrationTests.disabled = running;
        this.elements.clearResults.disabled = running;
        
        if (running) {
            this.elements.runAllTests.textContent = 'Running...';
        } else {
            this.elements.runAllTests.textContent = 'Run All Tests';
        }
    }

    updateUI() {
        this.updateStats();
        this.updateProgress();
        this.renderSuites();
    }

    updateStats() {
        const results = this.framework.getResults();
        
        this.elements.totalTests.textContent = results.total;
        this.elements.passedTests.textContent = results.passed;
        this.elements.failedTests.textContent = results.failed;
        this.elements.skippedTests.textContent = results.skipped;
    }

    updateProgress() {
        const results = this.framework.getResults();
        const progress = results.total > 0 ? 
            ((results.passed + results.failed + results.skipped) / results.total) * 100 : 0;
        
        this.elements.progressFill.style.width = `${progress}%`;
    }

    renderSuites() {
        const suites = this.framework.getSuites();
        const container = this.elements.testResults;
        
        container.innerHTML = '';
        
        if (suites.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No test suites found</p>';
            return;
        }
        
        suites.forEach(suite => {
            const suiteElement = this.createSuiteElement(suite);
            container.appendChild(suiteElement);
        });
    }

    createSuiteElement(suite) {
        const suiteDiv = document.createElement('div');
        suiteDiv.className = 'test-suite';
        
        // Suite header
        const header = document.createElement('div');
        header.className = 'suite-header';
        header.innerHTML = `
            <div class="suite-title">${suite.name}</div>
            <div class="suite-status">
                <span class="status-badge ${suite.status}">${suite.status}</span>
                <span>${suite.results.passed}/${suite.results.total} passed</span>
            </div>
        `;
        
        // Suite tests container
        const testsDiv = document.createElement('div');
        testsDiv.className = 'suite-tests';
        
        suite.tests.forEach(test => {
            const testElement = this.createTestElement(test);
            testsDiv.appendChild(testElement);
        });
        
        // Toggle suite visibility
        header.addEventListener('click', () => {
            testsDiv.classList.toggle('expanded');
        });
        
        suiteDiv.appendChild(header);
        suiteDiv.appendChild(testsDiv);
        
        return suiteDiv;
    }

    createTestElement(test) {
        const testDiv = document.createElement('div');
        testDiv.className = 'test-case';
        
        const statusIcon = this.getStatusIcon(test.status);
        const duration = test.duration ? `${test.duration}ms` : '';
        
        testDiv.innerHTML = `
            <div class="test-name">${test.name}</div>
            <div class="test-status">
                <div class="test-icon ${test.status}">${statusIcon}</div>
                <div class="test-duration">${duration}</div>
            </div>
        `;
        
        // Add error details if test failed
        if (test.status === 'failed' && test.error) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'test-error';
            errorDiv.textContent = test.error.message;
            testDiv.appendChild(errorDiv);
        }
        
        return testDiv;
    }

    getStatusIcon(status) {
        switch (status) {
            case 'passed': return '✓';
            case 'failed': return '✗';
            case 'skipped': return '⊘';
            case 'running': return '⟳';
            default: return '○';
        }
    }

    log(message, type = 'info') {
        const console = this.elements.consoleOutput;
        console.style.display = 'block';
        
        const line = document.createElement('div');
        line.className = `console-line ${type}`;
        line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        
        console.appendChild(line);
        console.scrollTop = console.scrollHeight;
    }

    clearConsole() {
        this.elements.consoleOutput.innerHTML = '';
        this.elements.consoleOutput.style.display = 'none';
    }
}

// Initialize test runner when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.testRunner = new TestRunner();
    
    // Auto-expand first suite for better UX
    setTimeout(() => {
        const firstSuite = document.querySelector('.suite-tests');
        if (firstSuite) {
            firstSuite.classList.add('expanded');
        }
    }, 100);
}); 