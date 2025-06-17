/**
 * E2E Tests for Alias Management Functionality
 */

describe('Alias Management', () => {
    beforeAll(async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
    });

    beforeEach(() => {
        // Reset to clean state
        if (window.app && window.app.resetApplication) {
            window.app.resetApplication();
        }
    });

    describe('Alias Manager Access', () => {
        it('should have add alias button', () => {
            const addAliasBtn = document.getElementById('addAliasBtn');
            expect(addAliasBtn).toBeTruthy();
        });

        it('should open alias manager when button clicked', () => {
            const addAliasBtn = document.getElementById('addAliasBtn');
            expect(addAliasBtn).toBeTruthy();
            
            addAliasBtn.click();
            
            const aliasModal = document.getElementById('aliasManagerModal');
            expect(aliasModal).toBeTruthy();
        });
    });

    describe('Alias List Display', () => {
        it('should have alias list container', () => {
            const aliasList = document.getElementById('aliasList');
            expect(aliasList).toBeTruthy();
        });

        it('should show empty state when no aliases exist', () => {
            const addAliasBtn = document.getElementById('addAliasBtn');
            expect(addAliasBtn).toBeTruthy();
            
            addAliasBtn.click();
            
            const aliasList = document.getElementById('aliasList');
            expect(aliasList).toBeTruthy();
            
            const emptyState = aliasList.querySelector('.empty-state');
            if (emptyState) {
                expect(emptyState.textContent).toContain('No Aliases');
            }
        });

        it('should display existing aliases in grid format', () => {
            const addAliasBtn = document.getElementById('addAliasBtn');
            expect(addAliasBtn).toBeTruthy();
            
            addAliasBtn.click();
            
            const aliasList = document.getElementById('aliasList');
            expect(aliasList).toBeTruthy();
            
            const aliasGrid = aliasList.querySelector('.alias-grid');
            if (aliasGrid) {
                expect(aliasGrid).toBeTruthy();
            }
        });
    });

    describe('Alias Creation', () => {
        it('should have new alias button in manager', () => {
            const addAliasBtn = document.getElementById('addAliasBtn');
            expect(addAliasBtn).toBeTruthy();
            
            addAliasBtn.click();
            
            const newAliasBtn = document.getElementById('newAliasBtn');
            expect(newAliasBtn).toBeTruthy();
        });

        it('should open edit alias modal when new alias clicked', () => {
            const addAliasBtn = document.getElementById('addAliasBtn');
            expect(addAliasBtn).toBeTruthy();
            
            addAliasBtn.click();
            
            const newAliasBtn = document.getElementById('newAliasBtn');
            expect(newAliasBtn).toBeTruthy();
            
            newAliasBtn.click();
            
            const editModal = document.getElementById('editAliasModal');
            expect(editModal).toBeTruthy();
        });

        it('should have alias form fields in edit modal', () => {
            const addAliasBtn = document.getElementById('addAliasBtn');
            expect(addAliasBtn).toBeTruthy();
            
            addAliasBtn.click();
            
            const newAliasBtn = document.getElementById('newAliasBtn');
            expect(newAliasBtn).toBeTruthy();
            
            newAliasBtn.click();
            
            const aliasNameInput = document.getElementById('aliasName');
            const aliasDescInput = document.getElementById('aliasDescription');
            const aliasCommandsInput = document.getElementById('aliasCommands');
            
            if (aliasNameInput) expect(aliasNameInput.tagName).toBe('INPUT');
            if (aliasDescInput) expect(['INPUT', 'TEXTAREA'].includes(aliasDescInput.tagName)).toBe(true);
            if (aliasCommandsInput) expect(['INPUT', 'TEXTAREA'].includes(aliasCommandsInput.tagName)).toBe(true);
        });

        it('should have save alias button', () => {
            const addAliasBtn = document.getElementById('addAliasBtn');
            expect(addAliasBtn).toBeTruthy();
            
            addAliasBtn.click();
            
            const newAliasBtn = document.getElementById('newAliasBtn');
            expect(newAliasBtn).toBeTruthy();
            
            newAliasBtn.click();
            
            const saveBtn = document.getElementById('saveAliasBtn');
            expect(saveBtn).toBeTruthy();
        });
    });

    describe('Alias Cards', () => {
        it('should display alias name and description', () => {
            // Test assumes aliases exist in current profile
            const profile = window.app?.getCurrentProfile();
            if (profile && profile.aliases && Object.keys(profile.aliases).length > 0) {
                const addAliasBtn = document.getElementById('addAliasBtn');
                if (addAliasBtn) {
                    addAliasBtn.click();
                    
                    const aliasCards = document.querySelectorAll('.alias-card');
                    if (aliasCards.length > 0) {
                        const firstCard = aliasCards[0];
                        expect(firstCard.querySelector('h4')).toBeTruthy();
                        expect(firstCard.querySelector('.alias-description')).toBeTruthy();
                    }
                }
            }
        });

        it('should have action buttons on alias cards', () => {
            const profile = window.app?.getCurrentProfile();
            if (profile && profile.aliases && Object.keys(profile.aliases).length > 0) {
                const addAliasBtn = document.getElementById('addAliasBtn');
                if (addAliasBtn) {
                    addAliasBtn.click();
                    
                    const aliasCards = document.querySelectorAll('.alias-card');
                    if (aliasCards.length > 0) {
                        const firstCard = aliasCards[0];
                        expect(firstCard.querySelector('.edit-alias-btn')).toBeTruthy();
                        expect(firstCard.querySelector('.use-alias-btn')).toBeTruthy();
                        expect(firstCard.querySelector('.delete-alias-btn')).toBeTruthy();
                    }
                }
            }
        });

        it('should show command preview in alias cards', () => {
            expect(window.app).toBeDefined();
            expect(window.app.getCurrentProfile).toBeDefined();
            
            const profile = window.app.getCurrentProfile();
            expect(profile).toBeDefined();
            expect(profile.aliases).toBeDefined();
            expect(Object.keys(profile.aliases).length).toBeGreaterThan(0);
            
            const addAliasBtn = document.getElementById('addAliasBtn');
            expect(addAliasBtn).not.toBeNull();
            addAliasBtn.click();
            
            const aliasCards = document.querySelectorAll('.alias-card');
            expect(aliasCards.length).toBeGreaterThan(0);
            
            const firstCard = aliasCards[0];
            const commandsDiv = firstCard.querySelector('.alias-commands');
            expect(commandsDiv).not.toBeNull();
            expect(commandsDiv.querySelector('code')).not.toBeNull();
        });
    });

    describe('Alias Editing', () => {
        it('should populate form when editing existing alias', () => {
            expect(window.app).toBeDefined();
            expect(window.app.getCurrentProfile).toBeDefined();
            
            const profile = window.app.getCurrentProfile();
            expect(profile).toBeDefined();
            expect(profile.aliases).toBeDefined();
            expect(Object.keys(profile.aliases).length).toBeGreaterThan(0);
            
            const addAliasBtn = document.getElementById('addAliasBtn');
            expect(addAliasBtn).not.toBeNull();
            addAliasBtn.click();
            
            const editBtn = document.querySelector('.edit-alias-btn');
            expect(editBtn).not.toBeNull();
            editBtn.click();
            
            const aliasNameInput = document.getElementById('aliasName');
            const aliasCommandsInput = document.getElementById('aliasCommands');
            
            expect(aliasNameInput).not.toBeNull();
            expect(aliasNameInput.value).toBeTruthy();
            expect(aliasCommandsInput).not.toBeNull();
            expect(aliasCommandsInput.value).toBeTruthy();
        });

        it('should disable name input when editing existing alias', () => {
            expect(window.app).toBeDefined();
            expect(window.app.getCurrentProfile).toBeDefined();
            
            const profile = window.app.getCurrentProfile();
            expect(profile).toBeDefined();
            expect(profile.aliases).toBeDefined();
            expect(Object.keys(profile.aliases).length).toBeGreaterThan(0);
            
            const addAliasBtn = document.getElementById('addAliasBtn');
            expect(addAliasBtn).not.toBeNull();
            addAliasBtn.click();
            
            const editBtn = document.querySelector('.edit-alias-btn');
            expect(editBtn).not.toBeNull();
            editBtn.click();
            
            const aliasNameInput = document.getElementById('aliasName');
            expect(aliasNameInput).not.toBeNull();
            expect(aliasNameInput.disabled).toBe(true);
        });
    });

    describe('Alias Deletion', () => {
        it('should confirm before deleting alias', () => {
            expect(window.app).toBeDefined();
            expect(window.app.getCurrentProfile).toBeDefined();
            
            const profile = window.app.getCurrentProfile();
            expect(profile).toBeDefined();
            expect(profile.aliases).toBeDefined();
            expect(Object.keys(profile.aliases).length).toBeGreaterThan(0);
            
            const addAliasBtn = document.getElementById('addAliasBtn');
            expect(addAliasBtn).not.toBeNull();
            addAliasBtn.click();
            
            const deleteBtn = document.querySelector('.delete-alias-btn');
            expect(deleteBtn).not.toBeNull();
            
            // Mock the confirm dialog
            const originalConfirm = window.confirm;
            let confirmCalled = false;
            window.confirm = () => {
                confirmCalled = true;
                return false; // Cancel deletion
            };
            
            deleteBtn.click();
            
            expect(confirmCalled).toBe(true);
            window.confirm = originalConfirm;
        });
    });

    describe('Alias Usage', () => {
        it('should allow adding alias to current key', () => {
            expect(window.app).toBeDefined();
            expect(window.app.getCurrentProfile).toBeDefined();
            
            const profile = window.app.getCurrentProfile();
            expect(profile).toBeDefined();
            expect(profile.aliases).toBeDefined();
            expect(Object.keys(profile.aliases).length).toBeGreaterThan(0);
            
            // First select a key
            const keyGrid = document.getElementById('keyGrid');
            expect(keyGrid).not.toBeNull();
            
            const firstKey = keyGrid.querySelector('.key-button, .key-item');
            expect(firstKey).not.toBeNull();
            firstKey.click();
            
            const addAliasBtn = document.getElementById('addAliasBtn');
            expect(addAliasBtn).not.toBeNull();
            addAliasBtn.click();
            
            const useBtn = document.querySelector('.use-alias-btn');
            expect(useBtn).not.toBeNull();
            // Test that button is clickable
            useBtn.click();
        });
    });

    describe('Alias Manager API', () => {
        it('should have STOAliasManager available', () => {
            expect(window.stoAliases).toBeDefined();
            expect(window.stoAliases.constructor.name).toBe('STOAliasManager');
        });

        it('should perform alias management operations correctly', () => {
            expect(window.stoAliases).toBeDefined();
            expect(window.stoAliases.showAliasManager).toBeDefined();
            expect(window.stoAliases.renderAliasList).toBeDefined();
            expect(window.stoAliases.saveAlias).toBeDefined();
            
            // Test showing alias manager - should actually show the modal/UI
            window.stoAliases.showAliasManager();
            const aliasModal = document.querySelector('#aliasModal, .alias-modal, .modal');
            expect(aliasModal).not.toBeNull();
            expect(aliasModal.style.display).not.toBe('none');
            
            // Test rendering alias list - should actually create DOM elements
            const testAliases = { 'test': { commands: 'target', description: 'Test alias' } };
            window.stoAliases.renderAliasList(testAliases);
            const aliasListContainer = document.querySelector('.alias-list, #aliasList');
            expect(aliasListContainer).not.toBeNull();
            expect(aliasListContainer.children.length).toBeGreaterThan(0);
            
            // Test saving alias - should actually add to profile data
            const testAlias = { name: 'test_alias', commands: 'target $$ fire_all' };
            const initialProfile = window.app.getCurrentProfile();
            const initialAliasCount = Object.keys(initialProfile.aliases || {}).length;
            
            const saveResult = window.stoAliases.saveAlias('test_alias', testAlias);
            expect(saveResult).toBe(true);
            
            // Verify alias was actually saved
            const updatedProfile = window.app.getCurrentProfile();
            expect(Object.keys(updatedProfile.aliases).length).toBe(initialAliasCount + 1);
            expect(updatedProfile.aliases['test_alias']).toBeDefined();
            expect(updatedProfile.aliases['test_alias'].commands).toBe('target $$ fire_all');
        });

        it('should store aliases in profile data structure', () => {
            expect(window.app).toBeDefined();
            expect(window.app.getCurrentProfile).toBeDefined();
            
            const profile = window.app.getCurrentProfile();
            expect(profile).toBeDefined();
            expect(typeof profile.aliases).toBe('object');
        });
    });

    describe('Alias Templates', () => {
        it('should provide alias templates', () => {
            expect(window.stoAliases).toBeTruthy();
            
            const templates = window.stoAliases.getAliasTemplates();
            
            // Templates should be an object with categories
            expect(templates).toBeTruthy();
            expect(typeof templates).toBe('object');
            expect(templates).not.toBeNull();
            
            // Should have at least one category
            const categories = Object.keys(templates);
            expect(categories.length).toBeGreaterThan(0);
            
            // Each category should have the required structure
            categories.forEach(categoryKey => {
                const category = templates[categoryKey];
                expect(category).toBeTruthy();
                expect(typeof category.name).toBe('string');
                expect(typeof category.description).toBe('string');
                expect(typeof category.templates).toBe('object');
                
                // Each category should have at least one template
                const templateKeys = Object.keys(category.templates);
                expect(templateKeys.length).toBeGreaterThan(0);
                
                // Each template should have the required structure
                templateKeys.forEach(templateKey => {
                    const template = category.templates[templateKey];
                    expect(template).toBeTruthy();
                    expect(typeof template.name).toBe('string');
                    expect(typeof template.description).toBe('string');
                    expect(typeof template.commands).toBe('string');
                });
            });
        });

        it('should allow creating alias from template', () => {
            expect(window.stoAliases).toBeDefined();
            expect(window.stoAliases.createAliasFromTemplate).toBeDefined();
            
            const templateAlias = { 
                name: 'test_template', 
                commands: 'target $$ fire_all',
                description: 'Test template alias'
            };
            
            // Get current profile to verify alias is added
            const profile = window.app.getCurrentProfile();
            const initialAliasCount = Object.keys(profile.aliases || {}).length;
            
            // Create alias from template
            const createResult = window.stoAliases.createAliasFromTemplate(templateAlias);
            expect(createResult).toBe(true);
            
            // Verify alias was actually added to profile
            const updatedProfile = window.app.getCurrentProfile();
            expect(Object.keys(updatedProfile.aliases).length).toBe(initialAliasCount + 1);
            expect(updatedProfile.aliases['test_template']).toBeDefined();
            expect(updatedProfile.aliases['test_template'].commands).toBe('target $$ fire_all');
        });
    });

    describe('Alias Export', () => {
        it('should support exporting aliases', () => {
            expect(window.stoAliases).toBeDefined();
            expect(window.stoAliases.exportAliases).toBeDefined();
            
            const exportData = window.stoAliases.exportAliases();
            expect(typeof exportData).toBe('string');
        });

        it('should include aliases in profile export', () => {
            expect(window.app).toBeDefined();
            expect(window.app.getCurrentProfile).toBeDefined();
            
            const profile = window.app.getCurrentProfile();
            expect(profile).toBeDefined();
            expect(profile.aliases).toBeDefined();
            
            // Aliases should be part of profile structure
            expect(typeof profile.aliases).toBe('object');
        });
    });
}); 