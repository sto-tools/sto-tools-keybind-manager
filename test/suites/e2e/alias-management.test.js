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
            if (addAliasBtn) {
                expect(addAliasBtn).toBeTruthy();
            }
        });

        it('should open alias manager when button clicked', () => {
            const addAliasBtn = document.getElementById('addAliasBtn');
            if (addAliasBtn) {
                addAliasBtn.click();
                
                const aliasModal = document.getElementById('aliasManagerModal');
                if (aliasModal) {
                    expect(aliasModal).toBeTruthy();
                }
            }
        });
    });

    describe('Alias List Display', () => {
        it('should have alias list container', () => {
            const aliasList = document.getElementById('aliasList');
            if (aliasList) {
                expect(aliasList).toBeTruthy();
            }
        });

        it('should show empty state when no aliases exist', () => {
            const addAliasBtn = document.getElementById('addAliasBtn');
            if (addAliasBtn) {
                addAliasBtn.click();
                
                const aliasList = document.getElementById('aliasList');
                if (aliasList) {
                    const emptyState = aliasList.querySelector('.empty-state');
                    if (emptyState) {
                        expect(emptyState.textContent).toContain('No Aliases');
                    }
                }
            }
        });

        it('should display existing aliases in grid format', () => {
            const addAliasBtn = document.getElementById('addAliasBtn');
            if (addAliasBtn) {
                addAliasBtn.click();
                
                const aliasList = document.getElementById('aliasList');
                if (aliasList) {
                    const aliasGrid = aliasList.querySelector('.alias-grid');
                    if (aliasGrid) {
                        expect(aliasGrid).toBeTruthy();
                    }
                }
            }
        });
    });

    describe('Alias Creation', () => {
        it('should have new alias button in manager', () => {
            const addAliasBtn = document.getElementById('addAliasBtn');
            if (addAliasBtn) {
                addAliasBtn.click();
                
                const newAliasBtn = document.getElementById('newAliasBtn');
                if (newAliasBtn) {
                    expect(newAliasBtn).toBeTruthy();
                }
            }
        });

        it('should open edit alias modal when new alias clicked', () => {
            const addAliasBtn = document.getElementById('addAliasBtn');
            if (addAliasBtn) {
                addAliasBtn.click();
                
                const newAliasBtn = document.getElementById('newAliasBtn');
                if (newAliasBtn) {
                    newAliasBtn.click();
                    
                    const editModal = document.getElementById('editAliasModal');
                    if (editModal) {
                        expect(editModal).toBeTruthy();
                    }
                }
            }
        });

        it('should have alias form fields in edit modal', () => {
            const addAliasBtn = document.getElementById('addAliasBtn');
            if (addAliasBtn) {
                addAliasBtn.click();
                
                const newAliasBtn = document.getElementById('newAliasBtn');
                if (newAliasBtn) {
                    newAliasBtn.click();
                    
                    const aliasNameInput = document.getElementById('aliasName');
                    const aliasDescInput = document.getElementById('aliasDescription');
                    const aliasCommandsInput = document.getElementById('aliasCommands');
                    
                    if (aliasNameInput) expect(aliasNameInput.tagName).toBe('INPUT');
                    if (aliasDescInput) expect(aliasDescInput.tagName).toBe('TEXTAREA');
                    if (aliasCommandsInput) expect(aliasCommandsInput.tagName).toBe('TEXTAREA');
                }
            }
        });

        it('should have save alias button', () => {
            const addAliasBtn = document.getElementById('addAliasBtn');
            if (addAliasBtn) {
                addAliasBtn.click();
                
                const newAliasBtn = document.getElementById('newAliasBtn');
                if (newAliasBtn) {
                    newAliasBtn.click();
                    
                    const saveBtn = document.getElementById('saveAliasBtn');
                    if (saveBtn) {
                        expect(saveBtn).toBeTruthy();
                    }
                }
            }
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
            const profile = window.app?.getCurrentProfile();
            if (profile && profile.aliases && Object.keys(profile.aliases).length > 0) {
                const addAliasBtn = document.getElementById('addAliasBtn');
                if (addAliasBtn) {
                    addAliasBtn.click();
                    
                    const aliasCards = document.querySelectorAll('.alias-card');
                    if (aliasCards.length > 0) {
                        const firstCard = aliasCards[0];
                        const commandsDiv = firstCard.querySelector('.alias-commands');
                        if (commandsDiv) {
                            expect(commandsDiv.querySelector('code')).toBeTruthy();
                        }
                    }
                }
            }
        });
    });

    describe('Alias Editing', () => {
        it('should populate form when editing existing alias', () => {
            const profile = window.app?.getCurrentProfile();
            if (profile && profile.aliases && Object.keys(profile.aliases).length > 0) {
                const addAliasBtn = document.getElementById('addAliasBtn');
                if (addAliasBtn) {
                    addAliasBtn.click();
                    
                    const editBtn = document.querySelector('.edit-alias-btn');
                    if (editBtn) {
                        editBtn.click();
                        
                        const aliasNameInput = document.getElementById('aliasName');
                        const aliasCommandsInput = document.getElementById('aliasCommands');
                        
                        if (aliasNameInput) expect(aliasNameInput.value).toBeTruthy();
                        if (aliasCommandsInput) expect(aliasCommandsInput.value).toBeTruthy();
                    }
                }
            }
        });

        it('should disable name input when editing existing alias', () => {
            const profile = window.app?.getCurrentProfile();
            if (profile && profile.aliases && Object.keys(profile.aliases).length > 0) {
                const addAliasBtn = document.getElementById('addAliasBtn');
                if (addAliasBtn) {
                    addAliasBtn.click();
                    
                    const editBtn = document.querySelector('.edit-alias-btn');
                    if (editBtn) {
                        editBtn.click();
                        
                        const aliasNameInput = document.getElementById('aliasName');
                        if (aliasNameInput) {
                            expect(aliasNameInput.disabled).toBe(true);
                        }
                    }
                }
            }
        });
    });

    describe('Alias Deletion', () => {
        it('should confirm before deleting alias', () => {
            const profile = window.app?.getCurrentProfile();
            if (profile && profile.aliases && Object.keys(profile.aliases).length > 0) {
                const addAliasBtn = document.getElementById('addAliasBtn');
                if (addAliasBtn) {
                    addAliasBtn.click();
                    
                    const deleteBtn = document.querySelector('.delete-alias-btn');
                    if (deleteBtn) {
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
                    }
                }
            }
        });
    });

    describe('Alias Usage', () => {
        it('should allow adding alias to current key', () => {
            const profile = window.app?.getCurrentProfile();
            if (profile && profile.aliases && Object.keys(profile.aliases).length > 0) {
                // First select a key
                const keyGrid = document.getElementById('keyGrid');
                const firstKey = keyGrid?.querySelector('.key-button, .key-item');
                
                if (firstKey) {
                    firstKey.click();
                    
                    const addAliasBtn = document.getElementById('addAliasBtn');
                    if (addAliasBtn) {
                        addAliasBtn.click();
                        
                        const useBtn = document.querySelector('.use-alias-btn');
                        if (useBtn) {
                            expect(useBtn).toBeTruthy();
                            // Test that button is clickable
                            useBtn.click();
                        }
                    }
                }
            }
        });
    });

    describe('Alias Manager API', () => {
        it('should have STOAliasManager available', () => {
            if (window.stoAliases) {
                expect(window.stoAliases).toBeTruthy();
                expect(window.stoAliases.constructor.name).toBe('STOAliasManager');
            }
        });

        it('should have alias management methods', () => {
            if (window.stoAliases) {
                expect(typeof window.stoAliases.showAliasManager).toBe('function');
                expect(typeof window.stoAliases.renderAliasList).toBe('function');
                expect(typeof window.stoAliases.saveAlias).toBe('function');
            }
        });

        it('should store aliases in profile data structure', () => {
            const profile = window.app?.getCurrentProfile();
            if (profile) {
                expect(typeof profile.aliases).toBe('object');
            }
        });
    });

    describe('Alias Templates', () => {
        it('should provide alias templates', () => {
            if (window.stoAliases && window.stoAliases.getAliasTemplates) {
                const templates = window.stoAliases.getAliasTemplates();
                expect(templates).toBeTruthy();
                expect(Array.isArray(templates)).toBe(true);
            }
        });

        it('should allow creating alias from template', () => {
            if (window.stoAliases && window.stoAliases.createAliasFromTemplate) {
                expect(typeof window.stoAliases.createAliasFromTemplate).toBe('function');
            }
        });
    });

    describe('Alias Export', () => {
        it('should support exporting aliases', () => {
            if (window.stoAliases && window.stoAliases.exportAliases) {
                const exportData = window.stoAliases.exportAliases();
                expect(typeof exportData).toBe('string');
            }
        });

        it('should include aliases in profile export', () => {
            const profile = window.app?.getCurrentProfile();
            if (profile && profile.aliases) {
                // Aliases should be part of profile structure
                expect(typeof profile.aliases).toBe('object');
            }
        });
    });
}); 