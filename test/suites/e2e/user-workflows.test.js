/**
 * E2E Tests for User Workflows
 * Comprehensive tests covering all major user interactions and workflows
 */

describe('User Workflows', () => {
    beforeAll(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
    });

    beforeEach(() => {
        // Reset to clean state if possible
        if (window.app && window.app.resetApplication) {
            window.app.resetApplication();
        }
    });

    describe('Key Management Workflows', () => {
        it('should complete full key addition workflow', async () => {
            // Open add key modal
            const addKeyBtn = document.getElementById('addKeyBtn');
            expect(addKeyBtn).toBeTruthy();
            addKeyBtn.click();

            // Fill in key name
            const keyNameInput = document.getElementById('newKeyName');
            expect(keyNameInput).toBeTruthy();
            keyNameInput.value = 'F12';
            keyNameInput.dispatchEvent(new window.Event('input', { bubbles: true }));

            // Confirm addition
            const confirmBtn = document.getElementById('confirmAddKeyBtn');
            expect(confirmBtn).toBeTruthy();
            confirmBtn.click();

            // Wait for key to be added
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify key appears in grid
            const keyElement = document.querySelector('[data-key="F12"]');
            expect(keyElement).toBeTruthy();
        });

        it('should use key suggestions', () => {
            const addKeyBtn = document.getElementById('addKeyBtn');
            addKeyBtn.click();

            // Clear any existing value
            const keyNameInput = document.getElementById('newKeyName');
            keyNameInput.value = '';

            // Click a key suggestion
            const suggestion = document.querySelector('.key-suggestion[data-key="F6"]');
            expect(suggestion).toBeTruthy();
            suggestion.click();

            // Verify input is populated
            expect(keyNameInput.value).toBe('F6');
        });
    });

    describe('Command Building Workflows', () => {
        it('should build custom command', async () => {
            // First add a key
            const addKeyBtn = document.getElementById('addKeyBtn');
            addKeyBtn.click();
            
            const keyNameInput = document.getElementById('newKeyName');
            keyNameInput.value = 'TestKey';
            keyNameInput.dispatchEvent(new window.Event('input', { bubbles: true }));
            
            const confirmBtn = document.getElementById('confirmAddKeyBtn');
            confirmBtn.click();

            // Wait and select key
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const keyElement = document.querySelector('[data-key="TestKey"]');
            if (keyElement) {
                keyElement.click();
                
                // Open command modal
                const addCommandBtn = document.getElementById('addCommandBtn');
                expect(addCommandBtn).toBeTruthy();
                addCommandBtn.click();
                
                // Select custom command type
                const commandType = document.getElementById('commandType');
                expect(commandType).toBeTruthy();
                commandType.value = 'custom';
                commandType.dispatchEvent(new window.Event('change', { bubbles: true }));
                
                // Should show command builder
                const builder = document.getElementById('commandBuilder');
                expect(builder).toBeTruthy();
            }
        });
    });

    describe('Import/Export Workflows', () => {
        it('should access export functionality', () => {
            const exportBtn = document.getElementById('exportKeybindsBtn');
            expect(exportBtn).toBeTruthy();
            exportBtn.click();
        });

        it('should access save project', () => {
            const saveBtn = document.getElementById('saveProjectBtn');
            expect(saveBtn).toBeTruthy();
            saveBtn.click();
        });
    });

    describe('Settings and Configuration Workflows', () => {
        it('should open about modal', () => {
            const settingsBtn = document.getElementById('settingsBtn');
            settingsBtn.click();
            
            const aboutBtn = document.getElementById('aboutBtn');
            expect(aboutBtn).toBeTruthy();
            aboutBtn.click();
            
            const aboutModal = document.getElementById('aboutModal');
            expect(aboutModal).toBeTruthy();
        });
    });

    describe('UI Interaction Workflows', () => {
        it('should filter keys', () => {
            const filterInput = document.getElementById('keyFilter');
            expect(filterInput).toBeTruthy();
            
            filterInput.value = 'F';
            filterInput.dispatchEvent(new window.Event('input', { bubbles: true }));
            
            // Clear filter
            filterInput.value = '';
            filterInput.dispatchEvent(new window.Event('input', { bubbles: true }));
        });

        it('should search commands', () => {
            const searchInput = document.getElementById('commandSearch');
            expect(searchInput).toBeTruthy();
            
            searchInput.value = 'target';
            searchInput.dispatchEvent(new window.Event('input', { bubbles: true }));
            
            // Clear search
            searchInput.value = '';
            searchInput.dispatchEvent(new window.Event('input', { bubbles: true }));
        });
    });
}); 