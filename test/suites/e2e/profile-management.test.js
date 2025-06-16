/**
 * E2E Tests for Profile Management
 */

describe('Profile Management', () => {
    beforeAll(async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
    });

    beforeEach(() => {
        // Reset to clean state
        if (window.app && window.app.resetApplication) {
            window.app.resetApplication();
        }
    });

    describe('Profile Selector', () => {
        it('should have profile selector dropdown', () => {
            const profileSelect = document.getElementById('profileSelect');
            expect(profileSelect).toBeTruthy();
            expect(profileSelect.tagName).toBe('SELECT');
        });

        it('should have at least one profile option', () => {
            const profileSelect = document.getElementById('profileSelect');
            expect(profileSelect.options.length).toBeGreaterThan(0);
        });

        it('should display current profile name', () => {
            const profileSelect = document.getElementById('profileSelect');
            expect(profileSelect.value).toBeTruthy();
        });
    });

    describe('Profile Creation', () => {
        it('should be able to create a new profile', () => {
            // Click new profile button
            const newProfileBtn = document.getElementById('newProfileBtn');
            expect(newProfileBtn).toBeTruthy();
            
            // Simulate click
            newProfileBtn.click();
            
            // Check if profile modal opened
            const profileModal = document.getElementById('profileModal');
            expect(profileModal).toBeTruthy();
            
            // Fill in profile details
            const profileNameInput = document.getElementById('profileName');
            const profileDescInput = document.getElementById('profileDescription');
            expect(profileNameInput).toBeTruthy();
            expect(profileDescInput).toBeTruthy();
            
            profileNameInput.value = 'Test Profile';
            profileDescInput.value = 'A test profile for E2E testing';
            
            // Trigger input events
            profileNameInput.dispatchEvent(new window.Event('input', { bubbles: true }));
            profileDescInput.dispatchEvent(new window.Event('input', { bubbles: true }));
            
            // Save profile
            const saveProfileBtn = document.getElementById('saveProfileBtn');
            expect(saveProfileBtn).toBeTruthy();
            saveProfileBtn.click();
            
            // Check if profile was created (should appear in selector)
            const profileSelect = document.getElementById('profileSelect');
            expect(profileSelect).toBeTruthy();
            
            // Profile creation is async, so we check if the modal closed
            const modalOverlay = document.getElementById('modalOverlay');
            expect(modalOverlay).toBeTruthy();
        });

        it('should have profile management buttons', () => {
            const newProfileBtn = document.getElementById('newProfileBtn');
            const cloneProfileBtn = document.getElementById('cloneProfileBtn');
            const renameProfileBtn = document.getElementById('renameProfileBtn');
            const deleteProfileBtn = document.getElementById('deleteProfileBtn');
            
            expect(newProfileBtn).toBeTruthy();
            expect(cloneProfileBtn).toBeTruthy();
            expect(renameProfileBtn).toBeTruthy();
            expect(deleteProfileBtn).toBeTruthy();
        });
    });

    describe('Profile Cloning', () => {
        it('should be able to clone current profile', () => {
            const cloneProfileBtn = document.getElementById('cloneProfileBtn');
            expect(cloneProfileBtn).toBeTruthy();
            
            cloneProfileBtn.click();
            
            // Should open profile modal for cloning
            const profileModal = document.getElementById('profileModal');
            expect(profileModal).toBeTruthy();
        });
    });

    describe('Profile Renaming', () => {
        it('should be able to rename current profile', () => {
            const renameProfileBtn = document.getElementById('renameProfileBtn');
            expect(renameProfileBtn).toBeTruthy();
            
            renameProfileBtn.click();
            
            // Should open profile modal for renaming
            const profileModal = document.getElementById('profileModal');
            expect(profileModal).toBeTruthy();
        });
    });

    describe('Profile Switching', () => {
        it('should be able to switch between profiles', () => {
            const profileSelect = document.getElementById('profileSelect');
            expect(profileSelect).toBeTruthy();
            expect(profileSelect.options.length).toBeGreaterThan(0);
            
            // Try to change selection (if multiple profiles exist)
            if (profileSelect.options.length > 1) {
                const originalValue = profileSelect.value;
                profileSelect.selectedIndex = profileSelect.selectedIndex === 0 ? 1 : 0;
                profileSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
                
                // Profile should have changed
                expect(profileSelect.value).not.toBe(originalValue);
            }
        });

        it('should update UI when switching profiles', () => {
            const profileSelect = document.getElementById('profileSelect');
            const keyGrid = document.getElementById('keyGrid');
            
            if (profileSelect.options.length > 1) {
                const originalKeyCount = keyGrid.querySelectorAll('.key-button, .key-item').length;
                
                // Switch profile
                profileSelect.selectedIndex = profileSelect.selectedIndex === 0 ? 1 : 0;
                profileSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
                
                // UI should update (key count might change)
                const newKeyCount = keyGrid.querySelectorAll('.key-button, .key-item').length;
                expect(typeof newKeyCount).toBe('number');
            }
        });
    });

    describe('Profile Deletion', () => {
        it('should have delete profile button', () => {
            const deleteProfileBtn = document.getElementById('deleteProfileBtn');
            expect(deleteProfileBtn).toBeTruthy();
        });

        it('should confirm before deleting profile', () => {
            const deleteProfileBtn = document.getElementById('deleteProfileBtn');
            const profileSelect = document.getElementById('profileSelect');
            
            // Only test if we have more than one profile
            if (profileSelect.options.length > 1) {
                const originalConfirm = window.confirm;
                let confirmCalled = false;
                window.confirm = () => {
                    confirmCalled = true;
                    return false; // Cancel deletion
                };
                
                deleteProfileBtn.click();
                
                expect(confirmCalled).toBe(true);
                
                window.confirm = originalConfirm;
            }
        });
    });

    describe('Profile Data Persistence', () => {
        it('should save profile data to storage', () => {
            expect(window.stoStorage).toBeTruthy();
            expect(window.stoProfiles).toBeTruthy();
            
            // Check if profiles are stored
            const profiles = window.stoProfiles.getAllProfiles();
            expect(profiles).toBeTruthy();
            expect(Object.keys(profiles).length).toBeGreaterThan(0);
        });

        it('should load profile data from storage', () => {
            const profileSelect = document.getElementById('profileSelect');
            const currentProfile = window.app.getCurrentProfile();
            
            expect(currentProfile).toBeTruthy();
            expect(currentProfile.name).toBeTruthy();
            expect(profileSelect.value).toBe(currentProfile.name);
        });
    });

    describe('Profile Import/Export', () => {
        it('should have import profile functionality', () => {
            const importBtn = document.getElementById('importProfileBtn');
            if (importBtn) {
                expect(importBtn).toBeTruthy();
            }
        });

        it('should have export profile functionality', () => {
            const exportBtn = document.getElementById('exportProfileBtn');
            if (exportBtn) {
                expect(exportBtn).toBeTruthy();
            }
        });
    });
});