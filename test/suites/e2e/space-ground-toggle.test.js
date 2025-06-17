/**
 * E2E Tests for Space/Ground Toggle Functionality
 * Tests the ability to switch between space and ground builds within profiles
 */

describe('Space/Ground Toggle - E2E', () => {
    beforeAll(async () => {
        // Wait for app to be fully initialized
        await new Promise(resolve => {
            const checkApp = () => {
                if (window.app && window.app.currentEnvironment !== undefined) {
                    resolve();
                } else {
                    setTimeout(checkApp, 100);
                }
            };
            checkApp();
        });
    });

    beforeEach(async () => {
        // Reset to clean state
        if (window.app && window.app.resetApplication) {
            window.app.resetApplication();
        }
        
        // Force reset to space mode for consistent tests
        if (window.app) {
            window.app.currentEnvironment = 'space';
            
            // Update the profile's current environment as well
            const profile = window.stoStorage.getProfile(window.app.currentProfile);
            if (profile) {
                profile.currentEnvironment = 'space';
                window.stoStorage.saveProfile(window.app.currentProfile, profile);
            }
            
            // Update UI buttons to reflect space mode
            window.app.updateModeButtons();
            
            // Wait for any async operations to complete
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    });

    describe('UI Toggle Elements', () => {
        it('should have space and ground mode buttons', () => {
            const spaceBtn = document.querySelector('[data-mode="space"]');
            const groundBtn = document.querySelector('[data-mode="ground"]');
            
            expect(spaceBtn).toBeTruthy();
            expect(groundBtn).toBeTruthy();
            expect(spaceBtn.textContent).toContain('Space');
            expect(groundBtn.textContent).toContain('Ground');
        });

        it('should have one mode active initially', () => {
            const spaceBtn = document.querySelector('[data-mode="space"]');
            const groundBtn = document.querySelector('[data-mode="ground"]');
            
            const hasActiveMode = spaceBtn.classList.contains('active') || groundBtn.classList.contains('active');
            expect(hasActiveMode).toBe(true);
        });

        it('should show space mode as default', () => {
            const spaceBtn = document.querySelector('[data-mode="space"]');
            expect(spaceBtn.classList.contains('active')).toBe(true);
        });
    });

    describe('Mode Switching', () => {
        it('should switch active state when clicking mode buttons', async () => {
            const spaceBtn = document.querySelector('[data-mode="space"]');
            const groundBtn = document.querySelector('[data-mode="ground"]');
            
            // Initial state should be space
            expect(spaceBtn.classList.contains('active')).toBe(true);
            expect(groundBtn.classList.contains('active')).toBe(false);
            
            // Dispatch proper click event
            const clickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            groundBtn.dispatchEvent(clickEvent);
            
            // Give time for the change to process
            await new Promise(resolve => setTimeout(resolve, 100));
            
            expect(spaceBtn.classList.contains('active')).toBe(false);
            expect(groundBtn.classList.contains('active')).toBe(true);
        });

        it('should update app environment when switching modes', async () => {
            const spaceBtn = document.querySelector('[data-mode="space"]');
            const groundBtn = document.querySelector('[data-mode="ground"]');
            
            if (window.app) {
                // First, ensure we're in a known state by clicking space
                const spaceClickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                spaceBtn.dispatchEvent(spaceClickEvent);
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Now we should be in space mode
                expect(window.app.currentEnvironment).toBe('space');
                
                // Now click ground button to test the switch
                const groundClickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                groundBtn.dispatchEvent(groundClickEvent);
                
                // Give time for the change to process
                await new Promise(resolve => setTimeout(resolve, 100));
                
                expect(window.app.currentEnvironment).toBe('ground');
            }
        });

        it('should show toast notification when switching modes', async () => {
            const spaceBtn = document.querySelector('[data-mode="space"]');
            const groundBtn = document.querySelector('[data-mode="ground"]');
            
            // Track toast messages
            let toastShown = false;
            let toastMessage = '';
            if (window.stoUI && typeof window.stoUI.showToast === 'function') {
                const originalShowToast = window.stoUI.showToast;
                window.stoUI.showToast = (message, type) => {
                    toastMessage = message;
                    if (message.includes('ground') || message.includes('mode')) {
                        toastShown = true;
                    }
                    return originalShowToast.call(window.stoUI, message, type);
                };
                
                // First, ensure we're in space mode
                const spaceClickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                spaceBtn.dispatchEvent(spaceClickEvent);
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Now we should be in space mode
                expect(window.app.currentEnvironment).toBe('space');
                
                // Now click ground button to test the toast
                const groundClickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                groundBtn.dispatchEvent(groundClickEvent);
                
                await new Promise(resolve => setTimeout(resolve, 100));
                
                expect(toastShown).toBe(true);
                // Restore original method
                window.stoUI.showToast = originalShowToast;
            }
        });
    });

    describe('Command Library Filtering', () => {
        it('should filter commands based on current environment', async () => {
            const spaceBtn = document.querySelector('[data-mode="space"]');
            const groundBtn = document.querySelector('[data-mode="ground"]');
            
            // Ensure we have command library items
            const commandItems = document.querySelectorAll('.command-item[data-command]');
            if (commandItems.length > 0) {
                // Switch to space mode
                const spaceClickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                spaceBtn.dispatchEvent(spaceClickEvent);
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Check if space-specific commands are visible
                const spaceCommands = Array.from(commandItems).filter(item => {
                    const commandId = item.dataset.command;
                    return commandId && (commandId.includes('fire') || commandId.includes('shields'));
                });
                
                spaceCommands.forEach(cmd => {
                    expect(cmd.style.display).not.toBe('none');
                });
                
                // Switch to ground mode
                const groundClickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                groundBtn.dispatchEvent(groundClickEvent);
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Check that space-specific commands are hidden
                spaceCommands.forEach(cmd => {
                    // Commands with environment restrictions should be filtered
                    if (cmd.dataset.command === 'fire_all' || cmd.dataset.command.includes('shield')) {
                        expect(cmd.style.display).toBe('none');
                    }
                });
            }
        });

        it('should show general commands in both modes', async () => {
            const spaceBtn = document.querySelector('[data-mode="space"]');
            const groundBtn = document.querySelector('[data-mode="ground"]');
            
            const commandItems = document.querySelectorAll('.command-item[data-command]');
            if (commandItems.length > 0) {
                // Find general commands (those without environment restrictions)
                const generalCommands = Array.from(commandItems).filter(item => {
                    const commandId = item.dataset.command;
                    return commandId && commandId.includes('target'); // targeting commands are generally universal
                });
                
                if (generalCommands.length > 0) {
                    // Check visibility in space mode
                    const spaceClickEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    spaceBtn.dispatchEvent(spaceClickEvent);
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    generalCommands.forEach(cmd => {
                        expect(cmd.style.display).not.toBe('none');
                    });
                    
                    // Check visibility in ground mode
                    const groundClickEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    groundBtn.dispatchEvent(groundClickEvent);
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    generalCommands.forEach(cmd => {
                        expect(cmd.style.display).not.toBe('none');
                    });
                }
            }
        });

        it('should hide categories with no visible commands', async () => {
            const groundBtn = document.querySelector('[data-mode="ground"]');
            
            // Switch to ground mode
            const groundClickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            groundBtn.dispatchEvent(groundClickEvent);
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const categories = document.querySelectorAll('.category');
            categories.forEach(category => {
                const visibleCommands = category.querySelectorAll('.command-item:not([style*="display: none"])');
                if (visibleCommands.length === 0) {
                    expect(category.style.display).toBe('none');
                } else {
                    expect(category.style.display).not.toBe('none');
                }
            });
        });
    });

    describe('Separate Build Management', () => {
        it('should allow adding different commands to same key in different environments', async () => {
            if (!window.app) return;
            
            const spaceBtn = document.querySelector('[data-mode="space"]');
            const groundBtn = document.querySelector('[data-mode="ground"]');
            
            // Create a clean test profile to avoid interference from other tests
            const testProfileId = 'test_build_management_profile';
            const cleanProfile = {
                name: 'Test Build Management',
                currentEnvironment: 'space',
                builds: {
                    space: { keys: {}, aliases: {} },
                    ground: { keys: {}, aliases: {} }
                }
            };
            
            // Save and switch to the test profile
            window.stoStorage.saveProfile(testProfileId, cleanProfile);
            window.app.switchProfile(testProfileId);
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Ensure we start in space mode
            const spaceClickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            spaceBtn.dispatchEvent(spaceClickEvent);
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Add a space command
            window.app.selectKey('Space');
            const spaceCommand = {
                command: 'FireAll',
                type: 'combat',
                icon: '🔥',
                text: 'Fire All Weapons'
            };
            window.app.addCommand('Space', spaceCommand);
            
            // Switch to ground mode (this should save the current build)
            const groundClickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            groundBtn.dispatchEvent(groundClickEvent);
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Add a ground command to the same key
            window.app.selectKey('Space');
            const groundCommand = {
                command: 'Target_Enemy_Near',
                type: 'targeting',
                icon: '🎯',
                text: 'Target Enemy'
            };
            window.app.addCommand('Space', groundCommand);
            
            // Now verify that the environments have different commands
            // Switch back to space and check
            spaceBtn.dispatchEvent(spaceClickEvent);
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const spaceProfile = window.app.getCurrentProfile();
            expect(spaceProfile.keys.Space).toBeDefined();
            expect(spaceProfile.keys.Space.some(cmd => cmd.command === 'FireAll')).toBe(true);
            expect(spaceProfile.keys.Space.some(cmd => cmd.command === 'Target_Enemy_Near')).toBe(false);
            
            // Switch to ground and check
            groundBtn.dispatchEvent(groundClickEvent);
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const groundProfile = window.app.getCurrentProfile();
            expect(groundProfile.keys.Space).toBeDefined();
            expect(groundProfile.keys.Space.some(cmd => cmd.command === 'Target_Enemy_Near')).toBe(true);
            expect(groundProfile.keys.Space.some(cmd => cmd.command === 'FireAll')).toBe(false);
            
            // Clean up - delete the test profile
            window.stoStorage.deleteProfile(testProfileId);
        });

        it('should maintain separate command chains when switching environments', async () => {
            if (!window.app) return;
            
            // Create a profile with predefined builds
            const testProfile = {
                name: 'Test Profile',
                currentEnvironment: 'space',
                builds: {
                    space: {
                        keys: {
                            'F1': [
                                { command: 'FireAll', type: 'combat', id: 'space1', text: 'Fire All', icon: '🔥' },
                                { command: '+power_exec Distribute_Shields', type: 'power', id: 'space2', text: 'Distribute Shields', icon: '🛡️' }
                            ]
                        },
                        aliases: {}
                    },
                    ground: {
                        keys: {
                            'F1': [
                                { command: 'Target_Enemy_Near', type: 'targeting', id: 'ground1', text: 'Target Enemy', icon: '🎯' },
                                { command: 'autoForward', type: 'movement', id: 'ground2', text: 'Auto Forward', icon: '🏃' }
                            ]
                        },
                        aliases: {}
                    }
                }
            };
            
            // Mock storage to return our test profile
            const originalGetProfile = window.stoStorage.getProfile;
            window.stoStorage.getProfile = () => testProfile;
            
            const spaceBtn = document.querySelector('[data-mode="space"]');
            const groundBtn = document.querySelector('[data-mode="ground"]');
            
            // Switch to space mode and verify commands
            const spaceClickEvent2 = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            spaceBtn.dispatchEvent(spaceClickEvent2);
            await new Promise(resolve => setTimeout(resolve, 100));
            
            window.app.selectKey('F1');
            let currentProfile = window.app.getCurrentProfile();
            if (currentProfile && currentProfile.keys.F1) {
                expect(currentProfile.keys.F1.some(cmd => cmd.command === 'FireAll')).toBe(true);
                expect(currentProfile.keys.F1.some(cmd => cmd.command === 'Target_Enemy_Near')).toBe(false);
            }
            
            // Switch to ground mode and verify different commands
            const groundClickEvent2 = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            groundBtn.dispatchEvent(groundClickEvent2);
            await new Promise(resolve => setTimeout(resolve, 100));
            
            window.app.selectKey('F1');
            currentProfile = window.app.getCurrentProfile();
            if (currentProfile && currentProfile.keys.F1) {
                expect(currentProfile.keys.F1.some(cmd => cmd.command === 'Target_Enemy_Near')).toBe(true);
                expect(currentProfile.keys.F1.some(cmd => cmd.command === 'FireAll')).toBe(false);
            }
            
            // Restore original method
            window.stoStorage.getProfile = originalGetProfile;
        });
    });

    describe('Export Functionality', () => {
        it('should include environment in export filename and content', async () => {
            if (!window.app) return;
            
            const groundBtn = document.querySelector('[data-mode="ground"]');
            let exportContent = '';
            let downloadCalled = false;
            
            // Mock Blob and URL.createObjectURL
            const originalCreateObjectURL = URL.createObjectURL;
            const originalBlob = window.Blob;
            
            URL.createObjectURL = () => 'mock-url';
            window.Blob = function(content, options) {
                exportContent = content[0];
                return { content, options };
            };
            
            // Mock createElement and click
            const originalCreateElement = document.createElement;
            document.createElement = (tagName) => {
                if (tagName === 'a') {
                    return {
                        href: '',
                        download: '',
                        click: () => { downloadCalled = true; }
                    };
                }
                return originalCreateElement.call(document, tagName);
            };
            
            // Switch to ground mode
            const groundClickEvent3 = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            groundBtn.dispatchEvent(groundClickEvent3);
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Trigger export
            window.app.exportKeybinds();
            
            expect(downloadCalled).toBe(true);
            expect(exportContent).toContain('ground mode');
            
            // Restore original methods
            URL.createObjectURL = originalCreateObjectURL;
            window.Blob = originalBlob;
            document.createElement = originalCreateElement;
        });

        it('should show environment-specific toast message on export', async () => {
            if (!window.app) return;
            
            const spaceBtn = document.querySelector('[data-mode="space"]');
            let toastMessage = '';
            
            // Mock toast functionality
            if (window.stoUI && typeof window.stoUI.showToast === 'function') {
                const originalShowToast = window.stoUI.showToast;
                window.stoUI.showToast = (message, type) => {
                    toastMessage = message;
                    return originalShowToast.call(window.stoUI, message, type);
                };
                
                // Switch to space mode
                const spaceClickEvent3 = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                spaceBtn.dispatchEvent(spaceClickEvent3);
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Trigger export (this will call the mocked toast)
                window.app.exportKeybinds();
                
                expect(toastMessage).toContain('space keybinds exported');
                
                // Restore original method
                window.stoUI.showToast = originalShowToast;
            }
        });
    });

    describe('Profile Persistence', () => {
        it('should save current environment in profile when switching modes', async () => {
            if (!window.app) return;
            
            const groundBtn = document.querySelector('[data-mode="ground"]');
            let savedProfile = null;
            
            // Mock storage save
            if (window.stoStorage) {
                const originalSaveProfile = window.stoStorage.saveProfile;
                window.stoStorage.saveProfile = (id, profile) => {
                    savedProfile = { ...profile };
                    return originalSaveProfile.call(window.stoStorage, id, profile);
                };
                
                // Switch to ground mode
                const groundClickEvent4 = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                groundBtn.dispatchEvent(groundClickEvent4);
                await new Promise(resolve => setTimeout(resolve, 100));
                
                if (savedProfile) {
                    expect(savedProfile.currentEnvironment).toBe('ground');
                }
                
                // Restore original method
                window.stoStorage.saveProfile = originalSaveProfile;
            }
        });

        it('should restore correct environment when switching profiles', async () => {
            if (!window.app || !window.stoStorage) return;
            
            // Create mock profiles with different environments
            const spaceProfile = {
                name: 'Space Profile',
                currentEnvironment: 'space',
                builds: { 
                    space: { keys: {}, aliases: {} }, 
                    ground: { keys: {}, aliases: {} } 
                }
            };
            
            const groundProfile = {
                name: 'Ground Profile', 
                currentEnvironment: 'ground',
                builds: { 
                    space: { keys: {}, aliases: {} }, 
                    ground: { keys: {}, aliases: {} } 
                }
            };
            
            const originalGetProfile = window.stoStorage.getProfile;
            window.stoStorage.getProfile = (id) => {
                if (id === 'space_profile') return spaceProfile;
                if (id === 'ground_profile') return groundProfile;
                return originalGetProfile.call(window.stoStorage, id);
            };
            
            // Switch to space profile
            window.app.switchProfile('space_profile');
            expect(window.app.currentEnvironment).toBe('space');
            
            // Switch to ground profile
            window.app.switchProfile('ground_profile');
            expect(window.app.currentEnvironment).toBe('ground');
            
            // Restore original method
            window.stoStorage.getProfile = originalGetProfile;
        });
    });

    describe('Data Structure Migration', () => {
        it('should automatically migrate old profile format to new builds structure', async () => {
            if (!window.app) return;
            
            // First ensure we're in space mode
            const spaceBtn = document.querySelector('[data-mode="space"]');
            if (spaceBtn) {
                const spaceClickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                spaceBtn.dispatchEvent(spaceClickEvent);
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // Now we should be in space mode
            expect(window.app.currentEnvironment).toBe('space');
            
            // Create an old format profile and save it to storage with a known ID
            const testProfileId = 'test_migration_profile_' + Date.now();
            const oldProfile = {
                name: 'Old Format Profile',
                mode: 'space',
                keys: {
                    'Space': [{ command: 'FireAll', type: 'combat', id: 'old1' }]
                },
                aliases: {
                    'attack': { commands: 'FireAll', description: 'Attack sequence' }
                }
            };
            
            // Save the old profile to storage
            window.stoStorage.saveProfile(testProfileId, oldProfile);
            
            // Set the app's current profile to our test profile so getCurrentBuild can save properly
            const originalCurrentProfile = window.app.currentProfile;
            window.app.currentProfile = testProfileId;
            
            // Test migration by calling getCurrentBuild
            const retrievedProfile = window.stoStorage.getProfile(testProfileId);
            const currentBuild = window.app.getCurrentBuild(retrievedProfile);
            
            // Verify migration occurred in the returned build
            expect(currentBuild).toBeDefined();
            expect(currentBuild.keys).toBeDefined();
            expect(currentBuild.mode).toBeDefined();
            
            // Verify that the old profile keys were migrated correctly
            expect(currentBuild.keys.Space).toBeDefined();
            expect(currentBuild.keys.Space).toEqual(oldProfile.keys.Space);
            
            // The current environment should be set correctly
            expect(currentBuild.mode).toBe('space');
            
            // Verify that the profile in storage was actually migrated
            const migratedProfile = window.stoStorage.getProfile(testProfileId);
            expect(migratedProfile.builds).toBeDefined();
            expect(migratedProfile.builds.space).toBeDefined();
            expect(migratedProfile.builds.ground).toBeDefined();
            expect(migratedProfile.builds.space.keys.Space).toEqual(oldProfile.keys.Space);
            
            // Restore original state and clean up
            window.app.currentProfile = originalCurrentProfile;
            window.stoStorage.deleteProfile(testProfileId);
        });
    });
});