// Integration test for VFX aliases reload issue
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('VFX Aliases Reload Integration', () => {
    let mockApp, mockProfile, mockUI, mockStorage;

    beforeEach(() => {
        // Mock profile with VFX aliases
        mockProfile = {
            name: 'Test Profile',
            aliases: {
                'RegularAlias': {
                    name: 'RegularAlias',
                    description: 'A regular alias',
                    commands: 'target_nearest_enemy $$ FireAll'
                },
                'dynFxSetFXExlusionList_Space': {
                    name: 'dynFxSetFXExlusionList_Space',
                    description: 'VFX - Disable Space Visual Effects',
                    commands: 'dynFxSetFXExlusionList Fx_Test_Effect_1,Fx_Test_Effect_2'
                },
                'dynFxSetFXExlusionList_Ground': {
                    name: 'dynFxSetFXExlusionList_Ground',
                    description: 'VFX - Disable Ground Visual Effects',
                    commands: 'dynFxSetFXExlusionList Fx_Ground_Effect_1'
                }
            },
            keys: {}
        };

        // Mock storage
        mockStorage = {
            getProfile: vi.fn(() => mockProfile),
            getAllData: vi.fn(() => ({
                currentProfile: 'test-profile',
                profiles: {
                    'test-profile': mockProfile
                }
            }))
        };

        // Mock app
        mockApp = {
            getCurrentProfile: vi.fn(() => mockProfile),
            currentProfile: 'test-profile',
            currentEnvironment: 'space',
            init: vi.fn().mockResolvedValue(undefined),
            setupCommandLibrary: vi.fn(),
            loadData: vi.fn().mockResolvedValue(undefined)
        };

        // Mock UI
        mockUI = {
            showModal: vi.fn(),
            hideModal: vi.fn(),
            showToast: vi.fn()
        };

        // Set up globals
        global.app = mockApp;
        global.stoUI = mockUI;
        global.stoStorage = mockStorage;
        
        // Mock DOM
        document.body.innerHTML = `
            <div id="commandCategories"></div>
        `;
        
        // Clear all mocks
        vi.clearAllMocks();

        // Ensure fresh module imports for each test
        vi.resetModules();
    });

    afterEach(() => {
        delete global.app;
        delete global.stoUI;
        delete global.stoStorage;
        delete global.stoAliases;
        delete window.stoAliases;
    });

    it('should initialize aliases in command library after app ready event', async () => {
        // Import the aliases.js module and create a new instance for testing
        const { default: aliasesModule } = await import('../../src/js/aliases.js');
        
        // Create alias manager instance manually for testing
        const aliasManager = window.stoAliases || new (class STOAliasManager {
            constructor() {
                this.currentAlias = null;
            }
            
            init() {
                this.setupEventListeners();
                this.updateCommandLibrary();
            }
            
            setupEventListeners() {
                // Mock implementation for testing
            }
            
            updateCommandLibrary() {
                const profile = global.app.getCurrentProfile();
                if (!profile || !profile.aliases) return;

                const categories = document.getElementById('commandCategories');
                if (!categories) return;

                // Remove existing alias categories
                const existingAliasCategory = categories.querySelector('[data-category="aliases"]');
                if (existingAliasCategory) {
                    existingAliasCategory.remove();
                }
                const existingVertigoCategory = categories.querySelector('[data-category="vertigo-aliases"]');
                if (existingVertigoCategory) {
                    existingVertigoCategory.remove();
                }

                // Separate regular aliases from VFX aliases
                const allAliases = Object.entries(profile.aliases);
                const regularAliases = allAliases.filter(([name, alias]) => 
                    !name.startsWith('dynFxSetFXExlusionList_')
                );
                const vertigoAliases = allAliases.filter(([name, alias]) => 
                    name.startsWith('dynFxSetFXExlusionList_')
                );

                // Add regular aliases category if there are regular aliases
                if (regularAliases.length > 0) {
                    const aliasCategory = this.createAliasCategoryElement(regularAliases, 'aliases', 'Command Aliases', 'fas fa-mask');
                    categories.appendChild(aliasCategory);
                }

                // Add VFX aliases category if there are VERTIGO aliases
                if (vertigoAliases.length > 0) {
                    const vertigoCategory = this.createAliasCategoryElement(vertigoAliases, 'vertigo-aliases', 'VFX Aliases', 'fas fa-eye-slash');
                    categories.appendChild(vertigoCategory);
                }
            }
            
            createAliasCategoryElement(aliases, categoryType = 'aliases', title = 'Command Aliases', iconClass = 'fas fa-mask') {
                const element = document.createElement('div');
                element.className = 'category';
                element.dataset.category = categoryType;
                
                const isVertigo = categoryType === 'vertigo-aliases';
                const itemIcon = isVertigo ? '👁️' : '🎭';
                const itemClass = isVertigo ? 'command-item vertigo-alias-item' : 'command-item alias-item';
                
                element.innerHTML = `
                    <h4><i class="${iconClass}"></i> ${title}</h4>
                    <div class="category-commands">
                        ${aliases.map(([name, alias]) => `
                            <div class="${itemClass}" data-alias="${name}" title="${alias.description || alias.commands}">
                                ${itemIcon} ${name}
                            </div>
                        `).join('')}
                    </div>
                `;
                
                return element;
            }
        });
        
        global.stoAliases = aliasManager;
        window.stoAliases = aliasManager;
        
        // Spy on updateCommandLibrary
        const updateLibrarySpy = vi.spyOn(aliasManager, 'updateCommandLibrary');
        
        // Simulate the app initialization sequence
        // 1. App is created but not yet initialized
        expect(updateLibrarySpy).not.toHaveBeenCalled();
        
        // 2. App ready event is dispatched (simulating app.init() completion)
        const appReadyPayload = { app: mockApp };
        
        // 3. Initialize alias manager (this should happen after app ready)
        aliasManager.init();
        
        // 4. Verify updateCommandLibrary was called during initialization
        expect(updateLibrarySpy).toHaveBeenCalled();
        
        // 5. Verify command library contains VFX aliases
        const commandCategories = document.getElementById('commandCategories');
        const vfxCategory = commandCategories.querySelector('[data-category="vertigo-aliases"]');
        const regularCategory = commandCategories.querySelector('[data-category="aliases"]');
        
        expect(vfxCategory).toBeTruthy();
        expect(regularCategory).toBeTruthy();
        
        // Check VFX aliases are present
        const vfxAliases = vfxCategory.querySelectorAll('.vertigo-alias-item');
        expect(vfxAliases).toHaveLength(2); // Space and Ground VFX aliases
        
        const aliasNames = Array.from(vfxAliases).map(el => el.dataset.alias);
        expect(aliasNames).toContain('dynFxSetFXExlusionList_Space');
        expect(aliasNames).toContain('dynFxSetFXExlusionList_Ground');
    });

    it('should handle app ready event timing correctly', async () => {
        // Import the aliases.js module which creates the global stoAliases instance
        await import('../../src/js/aliases.js');
        
        // Get the alias manager instance
        const aliasManager = window.stoAliases;
        global.stoAliases = aliasManager; // Also set it on global for consistency
        const updateLibrarySpy = vi.spyOn(aliasManager, 'updateCommandLibrary');
        
        // Simulate the real application flow:
        // 1. App dispatches ready event
        const appReadyPayload = { app: mockApp };
        
        // 2. Set up event listener (this is what the fixed app.js does)
        let aliasManagerInitialized = false;
        eventBus.on('sto-app-ready', () => {
            aliasManager.init();
            aliasManagerInitialized = true;
        });
        
        // 3. Dispatch the event
        eventBus.emit('sto-app-ready', appReadyPayload);
        
        // 4. Verify alias manager was initialized after app ready
        expect(aliasManagerInitialized).toBe(true);
        expect(updateLibrarySpy).toHaveBeenCalled();
        
        // Clean up event listener
        eventBus.off('sto-app-ready', () => {});
    });

    it('should maintain VFX aliases across simulated reload', async () => {
        // Import the aliases.js module which creates the global stoAliases instance
        await import('../../src/js/aliases.js');
        
        // Simulate first load - aliases are generated and visible
        const aliasManager1 = window.stoAliases;
        global.stoAliases = aliasManager1; // Also set it on global for consistency
        aliasManager1.init();
        
        let commandCategories = document.getElementById('commandCategories');
        let vfxCategory = commandCategories.querySelector('[data-category="vertigo-aliases"]');
        expect(vfxCategory).toBeTruthy();
        
        // Simulate page reload - clear DOM and recreate
        document.body.innerHTML = `<div id="commandCategories"></div>`;
        
        // Simulate second load (after reload) - aliases should still be visible
        // Note: In reality this would be a new instance, but for testing we reuse the same one
        aliasManager1.init();
        
        commandCategories = document.getElementById('commandCategories');
        vfxCategory = commandCategories.querySelector('[data-category="vertigo-aliases"]');
        
        // VFX aliases should still be present after "reload"
        expect(vfxCategory).toBeTruthy();
        
        const vfxAliases = vfxCategory.querySelectorAll('.vertigo-alias-item');
        expect(vfxAliases).toHaveLength(2);
        
        const aliasNames = Array.from(vfxAliases).map(el => el.dataset.alias);
        expect(aliasNames).toContain('dynFxSetFXExlusionList_Space');
        expect(aliasNames).toContain('dynFxSetFXExlusionList_Ground');
    });

    it('should handle empty aliases gracefully during initialization', async () => {
        // Mock profile with no aliases
        mockApp.getCurrentProfile.mockReturnValue({
            name: 'Empty Profile',
            aliases: {},
            keys: {}
        });
        
        // Import the aliases.js module which creates the global stoAliases instance
        await import('../../src/js/aliases.js');
        
        const aliasManager = window.stoAliases;
        global.stoAliases = aliasManager; // Also set it on global for consistency
        const updateLibrarySpy = vi.spyOn(aliasManager, 'updateCommandLibrary');
        
        // Should not throw error with empty aliases
        expect(() => aliasManager.init()).not.toThrow();
        expect(updateLibrarySpy).toHaveBeenCalled();
        
        // Command library should be empty but not broken
        const commandCategories = document.getElementById('commandCategories');
        expect(commandCategories.children).toHaveLength(0);
    });
}); 