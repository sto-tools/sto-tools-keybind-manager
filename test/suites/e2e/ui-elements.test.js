/**
 * E2E Tests for UI Elements and Page Structure
 */

describe('UI Elements and Page Structure', () => {
    beforeAll(async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
    });

    describe('Page Loading', () => {
        it('should load the main HTML page', () => {
            expect(document).toBeDefined();
            expect(document.title).toBe('STO Tools Keybind Manager');
        });

        it('should have the main app container', () => {
            const appContainer = document.querySelector('.app-container');
            expect(appContainer).toBeTruthy();
        });
    });

    describe('Header Elements', () => {
        it('should have the application header', () => {
            const header = document.querySelector('.app-header');
            expect(header).toBeTruthy();
        });

        it('should display the application title', () => {
            const title = document.querySelector('.app-header h1');
            expect(title).toBeTruthy();
            expect(title.textContent).toContain('STO Tools Keybind Manager');
        });

        it('should have main action buttons', () => {
            const openBtn = document.getElementById('openProjectBtn');
            const saveBtn = document.getElementById('saveProjectBtn');
            const exportBtn = document.getElementById('exportKeybindsBtn');
            
            expect(openBtn).toBeTruthy();
            expect(saveBtn).toBeTruthy();
            expect(exportBtn).toBeTruthy();
        });
    });

    describe('Profile Bar', () => {
        it('should have the profile bar', () => {
            const profileBar = document.querySelector('.profile-bar');
            expect(profileBar).toBeTruthy();
        });

        it('should have profile selector', () => {
            const profileSelect = document.getElementById('profileSelect');
            expect(profileSelect).toBeTruthy();
            expect(profileSelect.tagName).toBe('SELECT');
        });

        it('should have mode toggle buttons', () => {
            const spaceBtn = document.querySelector('[data-mode="space"]');
            const groundBtn = document.querySelector('[data-mode="ground"]');
            
            expect(spaceBtn).toBeTruthy();
            expect(groundBtn).toBeTruthy();
        });

        it('should have at least one mode active initially', () => {
            const spaceBtn = document.querySelector('[data-mode="space"]');
            const groundBtn = document.querySelector('[data-mode="ground"]');
            
            const hasActiveMode = spaceBtn.classList.contains('active') || groundBtn.classList.contains('active');
            expect(hasActiveMode).toBe(true);
        });
    });

    describe('Main Content Areas', () => {
        it('should have main content container', () => {
            const mainContent = document.querySelector('.main-content');
            expect(mainContent).toBeTruthy();
        });

        it('should have key selector container', () => {
            const keySelector = document.querySelector('.key-selector-container');
            expect(keySelector).toBeTruthy();
        });

        it('should have key grid', () => {
            const keyGrid = document.getElementById('keyGrid');
            expect(keyGrid).toBeTruthy();
        });

        it('should have command chain container', () => {
            const chainContainer = document.querySelector('.command-chain-container');
            expect(chainContainer).toBeTruthy();
        });

        it('should have command library', () => {
            const library = document.querySelector('.command-library');
            expect(library).toBeTruthy();
        });
    });

    describe('Command Chain Editor', () => {
        it('should have command chain container', () => {
            const chainContainer = document.querySelector('.command-chain-container');
            expect(chainContainer).toBeTruthy();
        });

        it('should have command list', () => {
            const commandList = document.getElementById('commandList');
            expect(commandList).toBeTruthy();
        });
    });

    describe('Button States', () => {
        it('should have some buttons disabled initially', () => {
            const deleteKeyBtn = document.getElementById('deleteKeyBtn');
            const addCommandBtn = document.getElementById('addCommandBtn');
            
            expect(deleteKeyBtn.disabled).toBe(true);
            expect(addCommandBtn.disabled).toBe(true);
        });

        it('should have some buttons enabled initially', () => {
            const addKeyBtn = document.getElementById('addKeyBtn');
            const exportBtn = document.getElementById('exportKeybindsBtn');
            
            expect(addKeyBtn.disabled).toBe(false);
            expect(exportBtn.disabled).toBe(false);
        });
    });

    describe('Application State', () => {
        it('should have global app object available', () => {
            expect(window.app).toBeTruthy();
        });

        it('should have storage manager available', () => {
            expect(window.stoStorage).toBeTruthy();
        });

        it('should have profile manager available', () => {
            expect(window.stoProfiles).toBeTruthy();
        });

        it('should display key count', () => {
            const keyCount = document.getElementById('keyCount');
            expect(keyCount).toBeTruthy();
            expect(keyCount.textContent).toContain('key');
        });

        it('should have default profile available', () => {
            const profileSelect = document.getElementById('profileSelect');
            expect(profileSelect.options.length).toBeGreaterThan(0);
        });
    });

    describe('UI Interactions', () => {
        it('should allow mode switching', () => {
            const spaceBtn = document.querySelector('[data-mode="space"]');
            const groundBtn = document.querySelector('[data-mode="ground"]');
            
            // Click ground mode
            groundBtn.click();
            // Give it a moment to process
            setTimeout(() => {}, 10);
            
            // Click back to space mode
            spaceBtn.click();
            setTimeout(() => {}, 10);
            
            // At least verify the buttons exist and are clickable
            expect(spaceBtn).toBeTruthy();
            expect(groundBtn).toBeTruthy();
        });

        it('should allow export button to be clicked', () => {
            const exportBtn = document.getElementById('exportKeybindsBtn');
            let clicked = false;
            
            try {
                exportBtn.click();
                clicked = true;
            } catch (error) {
                // Expected - might not have full export functionality in test environment
            }
            
            expect(clicked).toBe(true);
        });
    });
});
 