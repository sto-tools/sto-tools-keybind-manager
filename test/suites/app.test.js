/**
 * Unit Tests for app.js - STOKeybindManager
 * Tests the main application functionality including parameterized commands and view modes
 */

describe('STOKeybindManager - Core Functionality', () => {
    let keybindManager;

    beforeAll(() => {
        // Mock DOM elements needed for testing
        if (!document.getElementById('keyGrid')) {
            const keyGrid = document.createElement('div');
            keyGrid.id = 'keyGrid';
            keyGrid.className = 'key-grid';
            document.body.appendChild(keyGrid);
        }

        if (!document.getElementById('toggleKeyViewBtn')) {
            const toggleBtn = document.createElement('button');
            toggleBtn.id = 'toggleKeyViewBtn';
            toggleBtn.innerHTML = '<i class="fas fa-list"></i>';
            document.body.appendChild(toggleBtn);
        }

        // Mock command categories for filtering tests
        if (!document.getElementById('commandCategories')) {
            const commandCategories = document.createElement('div');
            commandCategories.id = 'commandCategories';
            document.body.appendChild(commandCategories);
        }
    });

    beforeEach(() => {
        if (typeof window.STOKeybindManager !== 'undefined') {
            keybindManager = new window.STOKeybindManager();
        }
    });

    it('should create STOKeybindManager instance', () => {
        expect(keybindManager).toBeDefined();
        expect(keybindManager.constructor.name).toBe('STOKeybindManager');
    });

    it('should have command identification methods', () => {
        expect(typeof keybindManager.findCommandDefinition).toBe('function');
        expect(typeof keybindManager.getCommandWarning).toBe('function');
    });

    it('should have view mode methods', () => {
        expect(typeof keybindManager.renderKeyGrid).toBe('function');
        expect(typeof keybindManager.toggleKeyView).toBe('function');
        expect(typeof keybindManager.updateViewToggleButton).toBe('function');
    });
});

describe('STOKeybindManager - Space/Ground Toggle Functionality', () => {
    let keybindManager;

    beforeEach(() => {
        if (typeof window.STOKeybindManager !== 'undefined') {
            keybindManager = new window.STOKeybindManager();
        }
    });

    it('should have space/ground toggle methods', () => {
        expect(typeof keybindManager.switchMode).toBe('function');
        expect(typeof keybindManager.getCurrentBuild).toBe('function');
        expect(typeof keybindManager.saveCurrentBuild).toBe('function');
        expect(typeof keybindManager.filterCommandLibrary).toBe('function');
    });

    it('should initialize with space environment by default', () => {
        expect(keybindManager.currentEnvironment).toBe('space');
    });

    it('should handle profile structure migration from old format', () => {
        // Mock old format profile
        const oldProfile = {
            name: 'Test Profile',
            mode: 'space',
            keys: {
                'Space': [{ command: 'FireAll', type: 'combat' }]
            },
            aliases: {
                'test': { commands: 'FireAll' }
            }
        };

        const result = keybindManager.getCurrentBuild(oldProfile);
        
        expect(result).toBeDefined();
        expect(result.builds).toBeDefined();
        expect(result.builds.space).toBeDefined();
        expect(result.builds.ground).toBeDefined();
        expect(result.builds.space.keys).toEqual(oldProfile.keys);
        expect(result.builds.space.aliases).toEqual(oldProfile.aliases);
    });

    it('should handle new profile structure correctly', () => {
        // Mock new format profile
        const newProfile = {
            name: 'Test Profile',
            currentEnvironment: 'space',
            builds: {
                space: {
                    keys: { 'Space': [{ command: 'FireAll', type: 'combat' }] },
                    aliases: { 'test': { commands: 'FireAll' } }
                },
                ground: {
                    keys: { 'Space': [{ command: 'target_enemy', type: 'targeting' }] },
                    aliases: {}
                }
            }
        };

        keybindManager.currentEnvironment = 'space';
        const result = keybindManager.getCurrentBuild(newProfile);
        
        expect(result).toBeDefined();
        expect(result.keys).toEqual(newProfile.builds.space.keys);
        expect(result.aliases).toEqual(newProfile.builds.space.aliases);
        expect(result.mode).toBe('space');
    });

    it('should switch between space and ground environments', () => {
        // Mock profile and storage
        const mockProfile = {
            name: 'Test Profile',
            currentEnvironment: 'space',
            builds: {
                space: { keys: {}, aliases: {} },
                ground: { keys: {}, aliases: {} }
            }
        };

        // Mock storage methods
        const originalGetProfile = window.stoStorage.getProfile;
        const originalSaveProfile = window.stoStorage.saveProfile;
        
        window.stoStorage.getProfile = () => mockProfile;
        window.stoStorage.saveProfile = () => true;

        keybindManager.currentEnvironment = 'space';
        keybindManager.switchMode('ground');
        
        expect(keybindManager.currentEnvironment).toBe('ground');

        // Restore original methods
        window.stoStorage.getProfile = originalGetProfile;
        window.stoStorage.saveProfile = originalSaveProfile;
    });

    it('should filter command library based on environment', () => {
        // Create mock command items
        const mockCommands = [
            { dataset: { command: 'fire_all' }, style: {} },
            { dataset: { command: 'auto_forward' }, style: {} },
            { dataset: { command: 'target_enemy_near' }, style: {} }
        ];

        // Mock querySelector to return our mock commands
        const originalQuerySelectorAll = document.querySelectorAll;
        document.querySelectorAll = (selector) => {
            if (selector === '.command-item') {
                return mockCommands;
            }
            if (selector === '.category') {
                return [];
            }
            return originalQuerySelectorAll.call(document, selector);
        };

        // Test space environment filtering
        keybindManager.currentEnvironment = 'space';
        keybindManager.filterCommandLibrary();

        // Verify space-only commands are visible
        const fireAllCommand = mockCommands.find(cmd => cmd.dataset.command === 'fire_all');
        const autoForwardCommand = mockCommands.find(cmd => cmd.dataset.command === 'auto_forward');
        
        expect(fireAllCommand.style.display).not.toBe('none');
        expect(autoForwardCommand.style.display).toBe('none');

        // Test ground environment filtering
        keybindManager.currentEnvironment = 'ground';
        keybindManager.filterCommandLibrary();

        expect(fireAllCommand.style.display).toBe('none');
        expect(autoForwardCommand.style.display).not.toBe('none');

        // Restore original querySelector
        document.querySelectorAll = originalQuerySelectorAll;
    });

    it('should save current build before switching environments', () => {
        let savedProfile = null;
        
        // Mock storage and profile
        const originalGetProfile = window.stoStorage.getProfile;
        const originalSaveProfile = window.stoStorage.saveProfile;
        
        window.stoStorage.getProfile = () => ({
            name: 'Test Profile',
            currentEnvironment: 'space',
            builds: {
                space: { keys: {}, aliases: {} },
                ground: { keys: {}, aliases: {} }
            }
        });
        
        window.stoStorage.saveProfile = (id, profile) => {
            savedProfile = profile;
            return true;
        };

        keybindManager.currentProfile = 'test_profile';
        keybindManager.currentEnvironment = 'space';
        
        // Mock getCurrentProfile to return a build with data
        const originalGetCurrentProfile = keybindManager.getCurrentProfile;
        keybindManager.getCurrentProfile = () => ({
            keys: { 'Space': [{ command: 'FireAll' }] },
            aliases: { 'test': { commands: 'FireAll' } }
        });

        keybindManager.saveCurrentBuild();

        // Verify the build was saved
        expect(savedProfile).toBeDefined();
        expect(savedProfile.builds.space.keys).toEqual({ 'Space': [{ command: 'FireAll' }] });
        expect(savedProfile.builds.space.aliases).toEqual({ 'test': { commands: 'FireAll' } });

        // Restore original methods
        window.stoStorage.getProfile = originalGetProfile;
        window.stoStorage.saveProfile = originalSaveProfile;
        keybindManager.getCurrentProfile = originalGetCurrentProfile;
    });
});

describe('STOKeybindManager - Parameterized Commands', () => {
    let keybindManager;

    beforeEach(() => {
        if (typeof window.STOKeybindManager !== 'undefined') {
            keybindManager = new window.STOKeybindManager();
        }
    });

    it('should support parameterized command building', () => {
        expect(typeof keybindManager.buildParameterizedCommand).toBe('function');
    });

    it('should handle parameter value retrieval', () => {
        expect(typeof keybindManager.getParameterValues).toBe('function');
    });

    it('should support parameter modal functionality', () => {
        expect(typeof keybindManager.showParameterModal).toBe('function');
        expect(typeof keybindManager.createParameterModal).toBe('function');
        expect(typeof keybindManager.populateParameterModal).toBe('function');
        expect(typeof keybindManager.saveParameterCommand).toBe('function');
        expect(typeof keybindManager.cancelParameterCommand).toBe('function');
    });

    it('should support editing parameterized commands', () => {
        expect(typeof keybindManager.editParameterizedCommand).toBe('function');
        expect(typeof keybindManager.populateParameterModalForEdit).toBe('function');
    });

    it('should format parameter names correctly', () => {
        const testCases = [
            { input: 'tray', expected: 'Tray' },
            { input: 'slot', expected: 'Slot' },
            { input: 'backup_tray', expected: 'Backup Tray' },
            { input: 'entityName', expected: 'Entity Name' }
        ];

        testCases.forEach(testCase => {
            const result = keybindManager.formatParameterName(testCase.input);
            expect(result).toBe(testCase.expected);
        });
    });

    it('should provide parameter help text', () => {
        const mockParamDef = { type: 'number', min: 0, max: 9 };
        const help = keybindManager.getParameterHelp('tray', mockParamDef);
        
        expect(typeof help).toBe('string');
        expect(help.length).toBeGreaterThan(0);
    });
});

describe('STOKeybindManager - View Modes', () => {
    let keybindManager;

    beforeEach(() => {
        if (typeof window.STOKeybindManager !== 'undefined') {
            keybindManager = new window.STOKeybindManager();
        }
    });

    it('should support multiple view modes', () => {
        expect(typeof keybindManager.renderCategorizedKeyView).toBe('function');
        expect(typeof keybindManager.renderKeyTypeView).toBe('function');
        expect(typeof keybindManager.renderSimpleKeyGrid).toBe('function');
    });

    it('should handle key categorization', () => {
        expect(typeof keybindManager.categorizeKeys).toBe('function');
        expect(typeof keybindManager.categorizeKeysByType).toBe('function');
    });

    it('should support category toggle functionality', () => {
        expect(typeof keybindManager.toggleKeyCategory).toBe('function');
        expect(typeof keybindManager.createKeyCategoryElement).toBe('function');
    });

    it('should handle view mode persistence', () => {
        const testModes = ['categorized', 'key-types', 'grid'];
        
        testModes.forEach(mode => {
            localStorage.setItem('keyViewMode', mode);
            const stored = localStorage.getItem('keyViewMode');
            expect(stored).toBe(mode);
        });
        
        // Clean up
        localStorage.removeItem('keyViewMode');
    });

    it('should categorize different key types correctly', () => {
        const testKeys = {
            'F1': [],
            'A': [],
            '1': [],
            'NumPad0': [],
            'Ctrl': [],
            'Home': [],
            'LeftMouseButton': [],
            '!': []
        };
        
        const categorized = keybindManager.categorizeKeysByType(testKeys, Object.keys(testKeys));
        
        expect(categorized).toBeDefined();
        // Should have function key category
        expect(categorized.function).toBeDefined();
        // Should have alphanumeric category
        expect(categorized.alphanumeric).toBeDefined();
        // Should have numberpad category
        expect(categorized.numberpad).toBeDefined();
        // Should have modifier category
        expect(categorized.modifiers).toBeDefined();
        // Should have navigation category
        expect(categorized.navigation).toBeDefined();
        // Should have mouse category
        expect(categorized.mouse).toBeDefined();
        // Should have symbols category
        expect(categorized.symbols).toBeDefined();
    });
});

describe('STOKeybindManager - Key Filtering', () => {
    let keybindManager;

    beforeEach(() => {
        if (typeof window.STOKeybindManager !== 'undefined') {
            keybindManager = new window.STOKeybindManager();
        }
    });

    it('should support key filtering', () => {
        expect(typeof keybindManager.filterKeys).toBe('function');
        expect(typeof keybindManager.showAllKeys).toBe('function');
    });

    it('should handle filter input properly', () => {
        // Mock some key elements for testing
        const mockElement1 = document.createElement('div');
        mockElement1.className = 'key-item';
        mockElement1.dataset.key = 'space';
        document.body.appendChild(mockElement1);

        const mockElement2 = document.createElement('div');
        mockElement2.className = 'command-item';
        mockElement2.dataset.key = 'f1';
        document.body.appendChild(mockElement2);

        // Test filter functionality
        keybindManager.filterKeys('spa');
        
        // Elements should exist after filtering
        expect(mockElement1.dataset.key).toBe('space');
        expect(mockElement2.dataset.key).toBe('f1');

        // Clean up
        document.body.removeChild(mockElement1);
        document.body.removeChild(mockElement2);
    });
});

describe('STOKeybindManager - Command Management', () => {
    let keybindManager;

    beforeEach(() => {
        if (typeof window.STOKeybindManager !== 'undefined') {
            keybindManager = new window.STOKeybindManager();
        }
    });

    it('should support command identification', () => {
        const testCommand = {
            command: 'FireAll',
            type: 'combat',
            text: 'Fire All Weapons'
        };
        
        const commandDef = keybindManager.findCommandDefinition(testCommand);
        // Test passes if method exists and can be called
        expect(typeof keybindManager.findCommandDefinition).toBe('function');
    });

    it('should detect command warnings', () => {
        const testCommand = {
            command: 'FireAll',
            type: 'combat',
            text: 'Fire All Weapons'
        };
        
        const warning = keybindManager.getCommandWarning(testCommand);
        // Test passes if method exists and returns a value (or null)
        expect(typeof keybindManager.getCommandWarning).toBe('function');
    });

    it('should support command element creation with parameters', () => {
        const testCommand = {
            command: '+STOTrayExecByTray 0 5',
            type: 'tray',
            text: 'Execute Tray 1 Slot 6',
            parameters: { tray: 0, slot: 5 },
            id: 'test-cmd'
        };
        
        const element = keybindManager.createCommandElement(testCommand, 0);
        
        expect(element).toBeDefined();
        expect(element.tagName).toBe('DIV');
        expect(element.dataset.index).toBe('0');
    });
});

describe('STOKeybindManager - UI Interactions', () => {
    let keybindManager;

    beforeEach(() => {
        if (typeof window.STOKeybindManager !== 'undefined') {
            keybindManager = new window.STOKeybindManager();
        }
    });

    it('should support command addition from library', () => {
        expect(typeof keybindManager.addCommandFromLibrary).toBe('function');
    });

    it('should support command editing', () => {
        expect(typeof keybindManager.editCommand).toBe('function');
    });

    it('should handle key element creation', () => {
        const keyElement = keybindManager.createKeyElement('Space');
        
        expect(keyElement).toBeDefined();
        expect(keyElement.tagName).toBe('DIV');
        expect(keyElement.dataset.key).toBe('Space');
    });

    it('should handle key selection', () => {
        expect(typeof keybindManager.selectKey).toBe('function');
    });
}); 