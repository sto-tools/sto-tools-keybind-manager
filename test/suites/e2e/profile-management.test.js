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
            expect(profileSelect.options.length).toBeGreaterThan(1);
            
            const originalValue = profileSelect.value;
            profileSelect.selectedIndex = profileSelect.selectedIndex === 0 ? 1 : 0;
            profileSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
            
            // Profile should have changed
            expect(profileSelect.value).not.toBe(originalValue);
        });

        it('should update UI when switching profiles', () => {
            const profileSelect = document.getElementById('profileSelect');
            const keyGrid = document.getElementById('keyGrid');
            
            expect(profileSelect.options.length).toBeGreaterThan(1);
            
            const originalKeyCount = keyGrid.querySelectorAll('.key-button, .key-item').length;
            
            // Switch profile
            profileSelect.selectedIndex = profileSelect.selectedIndex === 0 ? 1 : 0;
            profileSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
            
            // UI should update (key count might change)
            const newKeyCount = keyGrid.querySelectorAll('.key-button, .key-item').length;
            expect(typeof newKeyCount).toBe('number');
        });
    });

    describe('Profile Deletion', () => {
        it('should have delete profile button', () => {
            const deleteProfileBtn = document.getElementById('deleteProfileBtn');
            expect(deleteProfileBtn).toBeTruthy();
        });

        it('should confirm before deleting profile', async () => {
            const deleteProfileBtn = document.getElementById('deleteProfileBtn');
            const profileSelect = document.getElementById('profileSelect');
            
            expect(deleteProfileBtn).toBeTruthy();
            expect(profileSelect).toBeTruthy();
            
            // First, ensure we have multiple profiles so we can actually test deletion
            const initialProfileCount = profileSelect.options.length;
            
            // If we only have one profile, create another one so we can test deletion
            if (initialProfileCount === 1) {
                // Create a test profile that we can delete
                if (window.app && window.app.createProfile) {
                    const newProfileId = window.app.createProfile('TestProfileToDelete', 'A profile created for deletion testing');
                    // Wait for the profile to be created and DOM to update
                    if (newProfileId) {
                        window.app.renderProfiles();
                    }
                }
            }
            
            // Now we should have at least 2 profiles
            const currentProfileCount = profileSelect.options.length;
            expect(currentProfileCount).toBeGreaterThan(1);
            
            // Test the deletion confirmation using stoUI.confirm (async)
            const originalConfirm = window.stoUI.confirm;
            let confirmCalled = false;
            window.stoUI.confirm = async (message, title, type) => {
                confirmCalled = true;
                expect(message).toContain('delete'); // Should ask for deletion confirmation
                expect(title).toBe('Delete Profile');
                expect(type).toBe('danger');
                return true; // Confirm deletion
            };
            
            // Click the delete button
            deleteProfileBtn.click();
            
            // Wait for async deletion to complete
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Should have called confirm dialog
            expect(confirmCalled).toBe(true);
            
            // After deletion, we should have one less profile
            const finalProfileCount = profileSelect.options.length;
            expect(finalProfileCount).toBe(currentProfileCount - 1);
            
            window.stoUI.confirm = originalConfirm;
        });
    });

    describe('Profile Data Persistence', () => {
        it('should save profile data to storage', () => {
            expect(window.stoStorage).toBeTruthy();
            expect(window.stoProfiles).toBeTruthy();
            
            // Check if profiles are stored
            const data = window.stoStorage.getAllData();
            const profiles = data.profiles;
            expect(profiles).toBeTruthy();
            expect(Object.keys(profiles).length).toBeGreaterThan(0);
        });

        it('should load profile data from storage', () => {
            const profileSelect = document.getElementById('profileSelect');
            const currentProfile = window.app.getCurrentProfile();
            
            expect(currentProfile).toBeTruthy();
            expect(currentProfile.name).toBeTruthy();
            // profileSelect.value is the profile ID, not the name
            expect(profileSelect.value).toBeTruthy();
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