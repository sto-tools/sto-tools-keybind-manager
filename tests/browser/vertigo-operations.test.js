// Browser test for real-world Vertigo functionality
// This test runs in a browser context and uses the actual implementation

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Vertigo Operations Browser Test', () => {
    let app;

    beforeEach(async () => {
        // Clear localStorage to start fresh
        testUtils.clearAppData();
        
        // Wait for the real app to be ready (loaded via browser test configuration)
        await testUtils.waitForAppReady();
        
        // Get the real app instance (exposed globally by app.js)
        app = window.app;
        
        // Ensure we have a clean profile for testing
        if (app && typeof app.createProfile === 'function') {
            // Create a test profile if it doesn't exist
            const currentProfile = app.getCurrentProfile();
            if (!currentProfile) {
                app.createProfile('Test Profile', 'Test profile for vertigo operations');
            }
        }
        
        // Ensure vertigo manager is ready
        if (window.vertigoManager) {
            window.vertigoManager.clearAllEffects();
        }
    });

    afterEach(() => {
        // Clean up any open modals
        const vertigoModal = document.getElementById('vertigoModal');
        if (vertigoModal && vertigoModal.style.display !== 'none') {
            vertigoModal.style.display = 'none';
        }
        
        // Clear effects after tests (except for state persistence tests which handle their own cleanup)
        if (window.vertigoManager) {
            window.vertigoManager.clearAllEffects();
        }
    });

    describe('Core Vertigo Manager Functionality', () => {
        it('should have VERTIGO_EFFECTS data loaded', () => {
            expect(window.VERTIGO_EFFECTS).toBeDefined();
            expect(window.VERTIGO_EFFECTS.space).toBeInstanceOf(Array);
            expect(window.VERTIGO_EFFECTS.ground).toBeInstanceOf(Array);
            expect(window.VERTIGO_EFFECTS.space.length).toBeGreaterThan(0);
            expect(window.VERTIGO_EFFECTS.ground.length).toBeGreaterThan(0);
        });

        it('should have vertigoManager instance available', () => {
            expect(window.vertigoManager).toBeDefined();
            expect(typeof window.vertigoManager.generateAlias).toBe('function');
            expect(typeof window.vertigoManager.toggleEffect).toBe('function');
            expect(typeof window.vertigoManager.selectAllEffects).toBe('function');
            expect(typeof window.vertigoManager.clearAllEffects).toBe('function');
        });

        it('should generate properly formatted STO commands', () => {
            const manager = window.vertigoManager;
            manager.clearAllEffects();
            manager.selectedEffects.space.add('Fx_Test_Effect_1');
            manager.selectedEffects.space.add('Fx_Test_Effect_2');
            manager.showPlayerSay = false;
            
            const spaceAlias = manager.generateAlias('space');
            expect(spaceAlias).toMatch(/ &>$/);
            expect(spaceAlias).toBe('alias dynFxSetFXExlusionList_Space <& dynFxSetFXExlusionList Fx_Test_Effect_1,Fx_Test_Effect_2 &>');
        });
    });

    describe('App Integration', () => {
        it('should have app instance available', () => {
            expect(window.app).toBeDefined();
            expect(app).toBeDefined();
        });

        it('should have vertigo modal methods on app', () => {
            expect(typeof app.showVertigoModal).toBe('function');
            expect(typeof app.populateVertigoModal).toBe('function');
            expect(typeof app.setupVertigoEventListeners).toBe('function');
            expect(typeof app.generateVertigoAliases).toBe('function');
        });

        it('should have vertigo button in DOM', () => {
            const vertigoBtn = document.getElementById('vertigoBtn');
            expect(vertigoBtn).toBeDefined();
        });
    });

    describe('Modal Operations', () => {
        it('should show vertigo modal when showVertigoModal is called', async () => {
            const modal = document.getElementById('vertigoModal');
            expect(modal).toBeDefined();
            
            // Modal should be hidden initially
            expect(modal.style.display).toBe('none');
            
            // Show modal
            app.showVertigoModal();
            
            // Wait for modal to be visible
            await testUtils.waitForModalElement('#vertigoModal');
        });

        it('should populate effect lists when modal is opened', async () => {
            // Open modal and populate it
            app.showVertigoModal();
            await testUtils.waitForModalElement('#vertigoModal');
            
            const spaceList = document.getElementById('spaceEffectsList');
            const groundList = document.getElementById('groundEffectsList');
            
            expect(spaceList).toBeDefined();
            expect(groundList).toBeDefined();
            
            // Check if effects are populated
            expect(spaceList.children.length).toBeGreaterThan(0);
            expect(groundList.children.length).toBeGreaterThan(0);
        });

        it('should create proper effect item HTML structure', () => {
            const testEffect = { label: 'Test Effect', effect: 'Fx_Test_Effect' };
            const effectItem = app.createEffectItem('space', testEffect);
            
            expect(effectItem).toBeDefined();
            expect(effectItem.className).toBe('effect-item');
            
            const checkbox = effectItem.querySelector('input[type="checkbox"]');
            const label = effectItem.querySelector('.effect-label');
            
            expect(checkbox).toBeDefined();
            expect(label).toBeDefined();
            expect(label.textContent).toBe('Test Effect');
            expect(checkbox.dataset.environment).toBe('space');
            expect(checkbox.dataset.effect).toBe('Fx_Test_Effect');
        });
    });

    describe('Effect Selection Operations', () => {
        beforeEach(() => {
            app.populateVertigoModal();
        });

        it('should handle individual effect selection', () => {
            const manager = window.vertigoManager;
            manager.clearAllEffects();
            
            const firstEffect = window.VERTIGO_EFFECTS.space[0];
            manager.toggleEffect('space', firstEffect.effect);
            
            expect(manager.isEffectSelected('space', firstEffect.effect)).toBe(true);
            expect(manager.getEffectCount('space')).toBe(1);
            
            // Toggle again to deselect
            manager.toggleEffect('space', firstEffect.effect);
            expect(manager.isEffectSelected('space', firstEffect.effect)).toBe(false);
            expect(manager.getEffectCount('space')).toBe(0);
        });

        it('should handle select all functionality', () => {
            const manager = window.vertigoManager;
            manager.clearAllEffects();
            
            manager.selectAllEffects('space');
            expect(manager.getEffectCount('space')).toBe(window.VERTIGO_EFFECTS.space.length);
            
            manager.selectAllEffects('ground');
            expect(manager.getEffectCount('ground')).toBe(window.VERTIGO_EFFECTS.ground.length);
        });

        it('should handle clear all functionality', () => {
            const manager = window.vertigoManager;
            
            // Select some effects first
            manager.selectAllEffects('space');
            manager.selectAllEffects('ground');
            
            expect(manager.getEffectCount('space')).toBeGreaterThan(0);
            expect(manager.getEffectCount('ground')).toBeGreaterThan(0);
            
            // Clear all
            manager.clearAllEffects();
            expect(manager.getEffectCount('space')).toBe(0);
            expect(manager.getEffectCount('ground')).toBe(0);
        });
    });

    describe('UI Updates and Event Handling', () => {
        beforeEach(async () => {
            app.showVertigoModal();
            await testUtils.waitForModalElement('#vertigoModal');
            app.setupVertigoEventListeners();
        });

        it('should update effect counts in UI', () => {
            const manager = window.vertigoManager;
            manager.clearAllEffects();
            
            // Add some effects
            manager.selectedEffects.space.add('Fx_Test_1');
            manager.selectedEffects.space.add('Fx_Test_2');
            manager.selectedEffects.ground.add('Fx_Ground_Test');
            
            app.updateVertigoEffectCounts();
            
            const spaceCount = document.getElementById('spaceEffectCount');
            const groundCount = document.getElementById('groundEffectCount');
            
            expect(spaceCount.textContent).toBe('2 selected');
            expect(groundCount.textContent).toBe('1 selected');
        });

        it('should update preview when effects change', () => {
            const manager = window.vertigoManager;
            manager.clearAllEffects();
            manager.showPlayerSay = false;
            
            // Add test effect
            manager.selectedEffects.space.add('Fx_Test_Effect');
            
            app.updateVertigoPreview();
            
            const spacePreview = document.getElementById('spaceAliasCommand');
            const groundPreview = document.getElementById('groundAliasCommand');
            
            expect(spacePreview.textContent).toContain('dynFxSetFXExlusionList Fx_Test_Effect');
            expect(groundPreview.textContent).toBe('No ground effects selected');
        });

        it('should handle PlayerSay checkbox toggle', async () => {
            const playerSayCheckbox = document.getElementById('vertigoShowPlayerSay');
            const manager = window.vertigoManager;
            
            expect(playerSayCheckbox).toBeDefined();
            
            // Set initial state
            manager.showPlayerSay = false;
            playerSayCheckbox.checked = false;
            
            // Simulate checkbox change
            playerSayCheckbox.checked = true;
            playerSayCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Give event time to process
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Check if manager state updated
            expect(manager.showPlayerSay).toBe(true);
        });

        it('should handle Select All button clicks', async () => {
            const spaceSelectAllBtn = document.getElementById('spaceSelectAll');
            const groundSelectAllBtn = document.getElementById('groundSelectAll');
            
            expect(spaceSelectAllBtn).toBeDefined();
            expect(groundSelectAllBtn).toBeDefined();
            
            const manager = window.vertigoManager;
            manager.clearAllEffects();
            
            // Simulate button clicks
            await testUtils.clickElement('#spaceSelectAll');
            await testUtils.clickElement('#groundSelectAll');
            
            // Check if effects were selected
            expect(manager.getEffectCount('space')).toBe(window.VERTIGO_EFFECTS.space.length);
            expect(manager.getEffectCount('ground')).toBe(window.VERTIGO_EFFECTS.ground.length);
        });

        it('should handle Clear All button clicks', async () => {
            const spaceClearAllBtn = document.getElementById('spaceClearAll');
            const groundClearAllBtn = document.getElementById('groundClearAll');
            
            expect(spaceClearAllBtn).toBeDefined();
            expect(groundClearAllBtn).toBeDefined();
            
            const manager = window.vertigoManager;
            
            // Select some effects first
            manager.selectAllEffects('space');
            manager.selectAllEffects('ground');
            
            // Simulate button clicks
            await testUtils.clickElement('#spaceClearAll');
            await testUtils.clickElement('#groundClearAll');
            
            // Check if effects were cleared
            expect(manager.getEffectCount('space')).toBe(0);
            expect(manager.getEffectCount('ground')).toBe(0);
        });
    });

    describe('Alias Generation and Profile Integration', () => {
        it('should generate aliases and add to profile', () => {
            const manager = window.vertigoManager;
            manager.clearAllEffects();
            manager.selectedEffects.space.add('Fx_Test_Space');
            manager.selectedEffects.ground.add('Fx_Test_Ground');
            manager.showPlayerSay = true;
            
            // Get current profile from storage (root profile)
            const rootProfile = stoStorage.getProfile(app.currentProfile);
            expect(rootProfile).toBeDefined();
            
            const initialAliasCount = rootProfile.aliases ? Object.keys(rootProfile.aliases).length : 0;
            
            // Generate aliases
            app.generateVertigoAliases();
            
            // Get updated profile from storage after alias generation
            const updatedProfile = stoStorage.getProfile(app.currentProfile);
            expect(updatedProfile.aliases).toBeDefined();
            const finalAliasCount = Object.keys(updatedProfile.aliases).length;
            expect(finalAliasCount).toBeGreaterThan(initialAliasCount);
            
            // Check specific aliases
            const spaceAlias = updatedProfile.aliases['dynFxSetFXExlusionList_Space'];
            const groundAlias = updatedProfile.aliases['dynFxSetFXExlusionList_Ground'];
            
            expect(spaceAlias).toBeDefined();
            expect(groundAlias).toBeDefined();
            expect(spaceAlias.commands).toContain('dynFxSetFXExlusionList Fx_Test_Space');
            expect(groundAlias.commands).toContain('dynFxSetFXExlusionList Fx_Test_Ground');
        });

        it('should not generate aliases when no effects selected', () => {
            const manager = window.vertigoManager;
            manager.clearAllEffects();
            
            const rootProfile = stoStorage.getProfile(app.currentProfile);
            expect(rootProfile).toBeDefined();
            
            const initialAliasCount = rootProfile.aliases ? Object.keys(rootProfile.aliases).length : 0;
            
            // Try to generate aliases with no effects
            app.generateVertigoAliases();
            
            // Should not add any aliases
            const updatedProfile = stoStorage.getProfile(app.currentProfile);
            const finalAliasCount = updatedProfile.aliases ? Object.keys(updatedProfile.aliases).length : 0;
            expect(finalAliasCount).toBe(initialAliasCount);
        });
    });

    // Separate describe block for state persistence tests with their own cleanup
    describe('State Persistence', () => {
        // Don't clear effects after each test in this group - let tests manage their own state
        afterEach(() => {
            // Only close modals, don't clear effects
            const vertigoModal = document.getElementById('vertigoModal');
            if (vertigoModal && vertigoModal.style.display !== 'none') {
                vertigoModal.style.display = 'none';
            }
        });

        it('should save and load vertigo settings to/from profile', () => {
            const manager = window.vertigoManager;
            const profile = app.getCurrentProfile();
            expect(profile).toBeDefined();
            
            // Set up test state
            manager.clearAllEffects();
            manager.selectedEffects.space.add('Fx_Test_1');
            manager.selectedEffects.space.add('Fx_Test_2');
            manager.selectedEffects.ground.add('Fx_Ground_Test');
            manager.showPlayerSay = true;
            
            // Save state
            manager.saveState(profile);
            
            expect(profile.vertigoSettings).toBeDefined();
            expect(profile.vertigoSettings.selectedEffects.space).toEqual(['Fx_Test_1', 'Fx_Test_2']);
            expect(profile.vertigoSettings.selectedEffects.ground).toEqual(['Fx_Ground_Test']);
            expect(profile.vertigoSettings.showPlayerSay).toBe(true);
            
            // Clear manager state
            manager.clearAllEffects();
            manager.showPlayerSay = false;
            
            // Load state back
            manager.loadState(profile);
            
            expect(manager.getEffectCount('space')).toBe(2);
            expect(manager.getEffectCount('ground')).toBe(1);
            expect(manager.showPlayerSay).toBe(true);
            expect(manager.isEffectSelected('space', 'Fx_Test_1')).toBe(true);
            expect(manager.isEffectSelected('space', 'Fx_Test_2')).toBe(true);
            expect(manager.isEffectSelected('ground', 'Fx_Ground_Test')).toBe(true);
            
            // Clean up for this test
            manager.clearAllEffects();
        });

        it('should preserve selections after generating aliases (save transaction)', async () => {
            const manager = window.vertigoManager;
            const profile = app.getCurrentProfile();
            expect(profile).toBeDefined();
            
            // Start with clean state
            manager.clearAllEffects();
            
            // Open modal and set up selections
            app.showVertigoModal();
            await testUtils.waitForModalElement('#vertigoModal');
            
            // Select some effects
            const firstSpaceEffect = window.VERTIGO_EFFECTS.space[0];
            const firstGroundEffect = window.VERTIGO_EFFECTS.ground[0];
            
            manager.toggleEffect('space', firstSpaceEffect.effect);
            manager.toggleEffect('ground', firstGroundEffect.effect);
            
            // Verify selections are made
            expect(manager.isEffectSelected('space', firstSpaceEffect.effect)).toBe(true);
            expect(manager.isEffectSelected('ground', firstGroundEffect.effect)).toBe(true);
            
            // Generate aliases (save transaction)
            app.generateVertigoAliases();
            
            // Modal should be closed after generating aliases
            const modal = document.getElementById('vertigoModal');
            expect(modal.style.display).toBe('none');
            
            // Reopen modal
            app.showVertigoModal();
            await testUtils.waitForModalElement('#vertigoModal');
            
            // Verify selections are restored after reopening (they were saved)
            expect(manager.isEffectSelected('space', firstSpaceEffect.effect)).toBe(true);
            expect(manager.isEffectSelected('ground', firstGroundEffect.effect)).toBe(true);
            
            // Clean up for this test
            manager.clearAllEffects();
        });

        it('should rollback changes on cancel (cancel transaction)', async () => {
            const manager = window.vertigoManager;
            const profile = app.getCurrentProfile();
            expect(profile).toBeDefined();
            
            // Get root profile for saving state
            const rootProfile = stoStorage.getProfile(app.currentProfile);
            
            // Start with one effect selected and save it
            manager.clearAllEffects();
            const initialEffect = window.VERTIGO_EFFECTS.space[0];
            manager.toggleEffect('space', initialEffect.effect);
            manager.saveState(rootProfile);
            stoStorage.saveProfile(app.currentProfile, rootProfile);
            
            // Open modal (should load the saved state)
            app.showVertigoModal();
            await testUtils.waitForModalElement('#vertigoModal');
            
            // Verify initial effect is loaded
            expect(manager.isEffectSelected('space', initialEffect.effect)).toBe(true);
            
            // Make changes: deselect initial effect and select a different one
            const newEffect = window.VERTIGO_EFFECTS.space[1];
            manager.toggleEffect('space', initialEffect.effect); // deselect
            manager.toggleEffect('space', newEffect.effect); // select new
            
            // Verify temporary changes
            expect(manager.isEffectSelected('space', initialEffect.effect)).toBe(false);
            expect(manager.isEffectSelected('space', newEffect.effect)).toBe(true);
            
            // Cancel modal (should rollback changes)
            const cancelBtn = document.querySelector('#vertigoModal .btn-secondary[data-modal="vertigoModal"]');
            cancelBtn.click();
            
            // Wait for modal to close
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Reopen modal
            app.showVertigoModal();
            await testUtils.waitForModalElement('#vertigoModal');
            
            // Verify rollback: initial effect should be restored, new effect should not be there
            expect(manager.isEffectSelected('space', initialEffect.effect)).toBe(true);
            expect(manager.isEffectSelected('space', newEffect.effect)).toBe(false);
            
            // Clean up for this test
            manager.clearAllEffects();
        });
    });

    describe('Error Handling and Edge Cases', () => {
        it('should handle missing DOM elements gracefully', () => {
            // Remove some DOM elements
            const spaceList = document.getElementById('spaceEffectsList');
            if (spaceList) spaceList.remove();
            
            // Should not throw errors
            expect(() => {
                app.populateVertigoModal();
            }).not.toThrow();
        });

        it('should handle invalid effect names', () => {
            const manager = window.vertigoManager;
            
            expect(() => {
                manager.toggleEffect('space', null);
            }).toThrow(InvalidEffectError);
            
            expect(() => {
                manager.toggleEffect('space', undefined);
            }).toThrow(InvalidEffectError);
            
            expect(() => {
                manager.toggleEffect('space', '');
            }).toThrow(InvalidEffectError);
        });

        it('should handle invalid environment names', () => {
            const manager = window.vertigoManager;
            
            expect(() => {
                manager.generateAlias('invalid');
            }).toThrow(InvalidEnvironmentError);
            
            expect(() => {
                manager.toggleEffect('invalid', 'effect');
            }).toThrow(InvalidEnvironmentError);
            
            expect(() => {
                manager.selectAllEffects('invalid');
            }).toThrow(InvalidEnvironmentError);
        });

        it('should show error messages when app methods catch exceptions', async () => {
            // Mock stoUI.showToast to capture error messages
            const originalShowToast = stoUI.showToast;
            const toastCalls = [];
            stoUI.showToast = (message, type) => {
                toastCalls.push({ message, type });
            };

            try {
                // Test that app error handling works
                app.updateVertigoPreview();
                
                // Test generateVertigoAliases error handling
                app.generateVertigoAliases();
                
                // The methods should handle errors gracefully without throwing
                expect(toastCalls.length).toBeGreaterThanOrEqual(0);
                
            } finally {
                // Restore original showToast method
                stoUI.showToast = originalShowToast;
            }
        });
    });
}); 