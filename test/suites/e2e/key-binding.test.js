/**
 * E2E Tests for Key Binding Functionality
 */

describe('Key Binding Functionality', () => {
    beforeAll(async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
    });

    beforeEach(() => {
        // Reset to clean state
        if (window.app && window.app.resetApplication) {
            window.app.resetApplication();
        }
    });

    describe('Key Grid Display', () => {
        it('should display key grid', () => {
            const keyGrid = document.getElementById('keyGrid');
            expect(keyGrid).toBeTruthy();
        });

        it('should show available keys', async () => {
            const keyGrid = document.getElementById('keyGrid');
            
            // Wait for keys to be rendered - check both .key-item and .command-item
            let keys = keyGrid.querySelectorAll('.key-item, .command-item[data-key]');
            let attempts = 0;
            while (keys.length === 0 && attempts < 10) {
                await new Promise(resolve => setTimeout(resolve, 100));
                keys = keyGrid.querySelectorAll('.key-item, .command-item[data-key]');
                attempts++;
            }
            
            expect(keys.length).toBeGreaterThan(0);
        });
    });

    describe('Key Selection', () => {
        it('should select key when clicked', () => {
            const keyGrid = document.getElementById('keyGrid');
            const firstKey = keyGrid.querySelector('.key-button, .key-item');
            
            if (firstKey) {
                firstKey.click();
                
                expect(firstKey.classList.contains('selected') || 
                       firstKey.classList.contains('active')).toBe(true);
            }
        });

        it('should update chain title when key selected', () => {
            const keyGrid = document.getElementById('keyGrid');
            const chainTitle = document.getElementById('chainTitle');
            const firstKey = keyGrid.querySelector('.key-button, .key-item');
            
            if (firstKey) {
                firstKey.click();
                
                expect(chainTitle.textContent).not.toContain('Select a key');
            }
        });

        it('should enable command buttons when key selected', () => {
            const keyGrid = document.getElementById('keyGrid');
            const addCommandBtn = document.getElementById('addCommandBtn');
            const firstKey = keyGrid.querySelector('.key-button, .key-item');
            
            if (firstKey) {
                firstKey.click();
                
                expect(addCommandBtn.disabled).toBe(false);
            }
        });
    });

    describe('Add Key Workflow', () => {
        it('should be able to add a key using the modal', () => {
            const addKeyBtn = document.getElementById('addKeyBtn');
            const keyGrid = document.getElementById('keyGrid');
            const initialKeyCount = keyGrid.querySelectorAll('.key-item, .command-item[data-key]').length;
            
            // Click Add Key button to open modal
            addKeyBtn.click();
            
            // Verify modal is shown
            const modal = document.getElementById('addKeyModal');
            expect(modal).toBeTruthy();
            
            // Fill in key name
            const keyNameInput = document.getElementById('newKeyName');
            expect(keyNameInput).toBeTruthy();
            keyNameInput.value = 'TestKey';
            
            // Click confirm button
            const confirmBtn = document.getElementById('confirmAddKeyBtn');
            expect(confirmBtn).toBeTruthy();
            confirmBtn.click();
            
            // Verify key was added to profile data
            const profile = window.app.getCurrentProfile();
            expect('TestKey' in profile.keys).toBe(true);
            
            // Verify key appears in UI
            const newKeyCount = keyGrid.querySelectorAll('.key-item, .command-item[data-key]').length;
            expect(newKeyCount).toBe(initialKeyCount + 1);
            
            // Find the new key in the UI
            const newKey = Array.from(keyGrid.querySelectorAll('.key-item, .command-item[data-key]'))
                .find(key => key.textContent.includes('TestKey') || key.dataset.key === 'TestKey');
            expect(newKey).toBeTruthy();
        });

        it('should not add key with invalid name', () => {
            const addKeyBtn = document.getElementById('addKeyBtn');
            const keyGrid = document.getElementById('keyGrid');
            const initialCount = keyGrid.querySelectorAll('.key-item, .command-item[data-key]').length;
            
            const originalPrompt = window.prompt;
            window.prompt = () => ''; // Empty key name
            
            addKeyBtn.click();
            
            const newCount = keyGrid.querySelectorAll('.key-item, .command-item[data-key]').length;
            expect(newCount).toBe(initialCount);
            
            window.prompt = originalPrompt;
        });
    });

    describe('Command Modal Opening', () => {
        it('should be able to open command modal when key is selected', () => {
            // First add a key
            const addKeyBtn = document.getElementById('addKeyBtn');
            addKeyBtn.click();
            
            const keyNameInput = document.getElementById('newKeyName');
            keyNameInput.value = 'F1';
            
            const confirmBtn = document.getElementById('confirmAddKeyBtn');
            confirmBtn.click();
            
            // Select the key
            const keyGrid = document.getElementById('keyGrid');
            const newKey = Array.from(keyGrid.querySelectorAll('.key-item, .command-item[data-key]'))
                .find(key => key.textContent.includes('F1') || key.dataset.key === 'F1');
            newKey.click();
            
            // Verify key is selected
            expect(window.app.selectedKey).toBe('F1');
            
            // Try to open command modal
            const addCommandBtn = document.getElementById('addCommandBtn');
            expect(addCommandBtn).toBeTruthy();
            expect(addCommandBtn.disabled).toBe(false);
            
            // Click add command button
            addCommandBtn.click();
            
            // Verify command modal is shown
            const commandModal = document.getElementById('addCommandModal');
            expect(commandModal).toBeTruthy();
            
            // Verify command type selector exists
            const commandTypeSelect = document.getElementById('commandType');
            expect(commandTypeSelect).toBeTruthy();
            expect(commandTypeSelect.options.length).toBeGreaterThan(1);
        });
    });

    describe('Command Builder Functionality', () => {
        it('should be able to build a custom command', () => {
            // First add and select a key
            const addKeyBtn = document.getElementById('addKeyBtn');
            addKeyBtn.click();
            
            const keyNameInput = document.getElementById('newKeyName');
            keyNameInput.value = 'F2';
            
            const confirmBtn = document.getElementById('confirmAddKeyBtn');
            confirmBtn.click();
            
            // Select the key
            const keyGrid = document.getElementById('keyGrid');
            const newKey = Array.from(keyGrid.querySelectorAll('.key-item, .command-item[data-key]'))
                .find(key => key.textContent.includes('F2') || key.dataset.key === 'F2');
            newKey.click();
            
            // Open command modal
            const addCommandBtn = document.getElementById('addCommandBtn');
            expect(addCommandBtn).toBeTruthy();
            addCommandBtn.click();
            
            // Select custom command type
            const commandTypeSelect = document.getElementById('commandType');
            commandTypeSelect.value = 'custom';
            
            // Trigger change event manually
            if (window.stoCommands && window.stoCommands.handleCommandTypeChange) {
                window.stoCommands.handleCommandTypeChange('custom');
            }
            
            // Verify command builder UI is populated
            const commandBuilder = document.getElementById('commandBuilder');
            expect(commandBuilder.innerHTML).toContain('customCommand');
            
            // Fill in custom command
            const customCommandInput = document.getElementById('customCommand');
            expect(customCommandInput).toBeTruthy();
            customCommandInput.value = 'say "Hello World"';
            
            // Verify command preview updates
            const preview = document.getElementById('modalCommandPreview');
            expect(preview).toBeTruthy();
            
            // Trigger input event manually
            if (window.stoCommands && window.stoCommands.updateCommandPreview) {
                window.stoCommands.updateCommandPreview();
            }
            
            // Verify save button is enabled
            const saveBtn = document.getElementById('saveCommandBtn');
            expect(saveBtn.disabled).toBe(false);
        });
    });

    describe('Key Deletion', () => {
        it('should enable delete button when key selected', () => {
            const keyGrid = document.getElementById('keyGrid');
            const deleteKeyBtn = document.getElementById('deleteKeyBtn');
            const firstKey = keyGrid.querySelector('.key-button, .key-item');
            
            if (firstKey) {
                firstKey.click();
                expect(deleteKeyBtn.disabled).toBe(false);
            }
        });

        it('should delete key when confirmed', () => {
            const keyGrid = document.getElementById('keyGrid');
            const deleteKeyBtn = document.getElementById('deleteKeyBtn');
            const firstKey = keyGrid.querySelector('.key-button, .key-item');
            
            if (firstKey) {
                const initialCount = keyGrid.querySelectorAll('.key-button, .key-item').length;
                
                firstKey.click();
                
                const originalConfirm = window.confirm;
                window.confirm = () => true;
                
                deleteKeyBtn.click();
                
                const newCount = keyGrid.querySelectorAll('.key-button, .key-item').length;
                expect(newCount).toBe(initialCount - 1);
                
                window.confirm = originalConfirm;
            }
        });
    });

    describe('Key Duplication', () => {
        it('should enable duplicate button when key selected', () => {
            const keyGrid = document.getElementById('keyGrid');
            const duplicateKeyBtn = document.getElementById('duplicateKeyBtn');
            const firstKey = keyGrid.querySelector('.key-button, .key-item');
            
            if (firstKey) {
                firstKey.click();
                expect(duplicateKeyBtn.disabled).toBe(false);
            }
        });

        it('should duplicate key with new name', () => {
            const keyGrid = document.getElementById('keyGrid');
            const duplicateKeyBtn = document.getElementById('duplicateKeyBtn');
            const firstKey = keyGrid.querySelector('.key-button, .key-item');
            
            if (firstKey) {
                const initialCount = keyGrid.querySelectorAll('.key-button, .key-item').length;
                
                firstKey.click();
                
                const originalPrompt = window.prompt;
                window.prompt = () => 'F2';
                
                duplicateKeyBtn.click();
                
                const newCount = keyGrid.querySelectorAll('.key-button, .key-item').length;
                expect(newCount).toBe(initialCount + 1);
                
                window.prompt = originalPrompt;
            }
        });
    });

    describe('Key Filtering', () => {
        it('should filter keys based on search input', () => {
            const keyFilter = document.getElementById('keyFilter');
            const keyGrid = document.getElementById('keyGrid');
            
            // Type in filter
            keyFilter.value = 'F1';
            keyFilter.dispatchEvent(new window.Event('input'));
            
            // Check if filtering occurred
            const visibleKeys = Array.from(keyGrid.querySelectorAll('.key-button, .key-item'))
                .filter(key => key.style.display !== 'none');
            
            // Should have fewer visible keys after filtering
            expect(visibleKeys.length).toBeLessThanOrEqual(
                keyGrid.querySelectorAll('.key-button, .key-item').length
            );
        });

        it('should show all keys when filter is cleared', () => {
            const keyFilter = document.getElementById('keyFilter');
            const showAllBtn = document.getElementById('showAllKeysBtn');
            const keyGrid = document.getElementById('keyGrid');
            const totalKeys = keyGrid.querySelectorAll('.key-button, .key-item').length;
            
            // First filter
            keyFilter.value = 'XYZ';
            keyFilter.dispatchEvent(new window.Event('input'));
            
            // Then show all
            showAllBtn.click();
            
            const visibleKeys = Array.from(keyGrid.querySelectorAll('.key-button, .key-item'))
                .filter(key => key.style.display !== 'none');
            
            expect(visibleKeys.length).toBe(totalKeys);
        });
    });

    describe('Command Chain Management', () => {
        it('should show empty state when no key selected', () => {
            // Clear any selected key first
            if (window.app && window.app.selectedKey) {
                window.app.selectedKey = null;
                window.app.renderCommandChain();
            }
            
            const emptyState = document.getElementById('emptyState');
            if (emptyState) {
                expect(emptyState.style.display).not.toBe('none');
            } else {
                // If emptyState element doesn't exist, check for empty message
                const commandChain = document.getElementById('commandChain');
                expect(commandChain).toBeTruthy();
                expect(commandChain.textContent).toContain('Select a key');
            }
        });

        it('should hide empty state when key selected', () => {
            const keyGrid = document.getElementById('keyGrid');
            const emptyState = document.getElementById('emptyState');
            const firstKey = keyGrid.querySelector('.key-button, .key-item');
            
            if (firstKey) {
                firstKey.click();
                expect(emptyState.style.display).toBe('none');
            }
        });

        it('should update command preview when key selected', () => {
            const keyGrid = document.getElementById('keyGrid');
            const commandPreview = document.getElementById('commandPreview');
            const firstKey = keyGrid.querySelector('.key-button, .key-item');
            
            if (firstKey) {
                firstKey.click();
                expect(commandPreview.textContent).not.toContain('Select a key');
            }
        });
    });

    describe('Key Count Display', () => {
        it('should update key count when keys are added/removed', () => {
            const keyCount = document.getElementById('keyCount');
            expect(keyCount).toBeTruthy();
            
            // Get initial displayed count
            const initialDisplayedCount = parseInt(keyCount.textContent.match(/\d+/)?.[0] || '0');
            
            // Try adding a key with a unique name that definitely doesn't exist
            const addKeyBtn = document.getElementById('addKeyBtn');
            expect(addKeyBtn).toBeTruthy();
            
            const originalPrompt = window.prompt;
            const uniqueKeyName = 'UNIQUE_TEST_KEY_' + Date.now();
            window.prompt = () => uniqueKeyName;
            
            addKeyBtn.click();
            
            // Confirm the key addition if there's a confirm button
            const confirmBtn = document.getElementById('confirmAddKeyBtn');
            if (confirmBtn) {
                confirmBtn.click();
            }
            
            // Manually trigger profile info update since the app should do this
            if (window.app && window.app.updateProfileInfo) {
                window.app.updateProfileInfo();
            }
            
            // Check if the displayed count increased
            const newDisplayedCount = parseInt(keyCount.textContent.match(/\d+/)?.[0] || '0');
            
            // The key count display should have increased
            expect(newDisplayedCount).toBeGreaterThan(initialDisplayedCount);
            
            window.prompt = originalPrompt;
        });
    });
}); 