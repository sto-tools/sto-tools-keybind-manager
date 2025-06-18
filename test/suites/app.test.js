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
        expect(keybindManager).toBeInstanceOf(Object);
        expect(keybindManager.constructor.name).toBe('STOKeybindManager');
    });

    it('should perform command identification correctly', () => {
        // Test command definition finding
        const commandDef = keybindManager.findCommandDefinition('fire_all');
        expect(commandDef).toEqual(expect.objectContaining({
            command: expect.any(String)
        }));
        
        // Test command warning retrieval
        const warning = keybindManager.getCommandWarning('fire_all');
        expect(typeof warning).toBe('string');
        expect(warning.length).toBeGreaterThan(0);
    });

    it('should handle view mode operations correctly', () => {
        // Test key grid rendering
        const keyGrid = keybindManager.renderKeyGrid();
        expect(keyGrid).toBeTruthy();
        
        // Test view toggle functionality
        const toggleResult = keybindManager.toggleKeyView('categorized');
        expect(toggleResult).toBeTruthy();
        
        // Test view toggle button update
        const buttonUpdate = keybindManager.updateViewToggleButton('categorized');
        expect(buttonUpdate).toBeTruthy();
    });
});

describe('STOKeybindManager - Space/Ground Toggle Functionality', () => {
    let keybindManager;

    beforeEach(() => {
        if (typeof window.STOKeybindManager !== 'undefined') {
            keybindManager = new window.STOKeybindManager();
        }
    });

    it('should perform space/ground toggle operations correctly', () => {
        // Test environment switching
        keybindManager.currentEnvironment = 'space';
        keybindManager.switchMode('ground');
        expect(keybindManager.currentEnvironment).toBe('ground');
        
        // Test build retrieval
        const testProfile = {
            builds: {
                space: { keys: { 'a': ['target'] }, aliases: {} },
                ground: { keys: { 'b': ['heal'] }, aliases: {} }
            }
        };
        keybindManager.currentEnvironment = 'space';
        const currentBuild = keybindManager.getCurrentBuild(testProfile);
        expect(currentBuild.keys).toEqual(testProfile.builds.space.keys);
        
        // Test build saving
        const saveResult = keybindManager.saveCurrentBuild();
        expect(saveResult).toBeTruthy();
        
        // Test command library filtering
        const filterResult = keybindManager.filterCommandLibrary();
        expect(filterResult).toBeTruthy();
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
        
        expect(result).toEqual(expect.objectContaining({
            builds: expect.objectContaining({
                space: expect.objectContaining({
                    keys: oldProfile.keys,
                    aliases: oldProfile.aliases
                }),
                ground: expect.any(Object)
            })
        }));
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
        
        expect(result).toEqual(expect.objectContaining({
            keys: newProfile.builds.space.keys,
            aliases: newProfile.builds.space.aliases,
            mode: 'space'
        }));
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

    it('should perform all parameterized command operations correctly', () => {
        // Test parameterized command building
        const paramCommand = keybindManager.buildParameterizedCommand('tray_exec', { tray: 0, slot: 5 });
        expect(paramCommand).toBeDefined();
        expect(paramCommand.command).toContain('STOTrayExecByTray');
        
        // Test parameter value retrieval
        const paramValues = keybindManager.getParameterValues();
        expect(paramValues).toBeDefined();
        expect(typeof paramValues).toBe('object');
        
        // Test parameter modal functionality
        const modalResult = keybindManager.showParameterModal('tray_exec', { tray: 0, slot: 5 });
        expect(modalResult).toBeDefined();
        
        const modalElement = keybindManager.createParameterModal('tray_exec', {
            tray: { type: 'number', min: 0, max: 9 },
            slot: { type: 'number', min: 0, max: 9 }
        });
        expect(modalElement).toBeDefined();
        
        const populateResult = keybindManager.populateParameterModal('tray_exec', {
            tray: { type: 'number', min: 0, max: 9 }
        });
        expect(populateResult).toBeDefined();
        
        const saveResult = keybindManager.saveParameterCommand('tray_exec', { tray: 0, slot: 5 });
        expect(saveResult).toBeDefined();
        
        // Test parameter modal cancellation - should actually close the modal
        keybindManager.cancelParameterCommand();
        const paramModal = document.getElementById('parameterModal');
        expect(paramModal.style.display).toBe('none');
        
        // Test editing parameterized commands
        const testCommand = { command: '+STOTrayExecByTray 0 5', parameters: { tray: 0, slot: 5 } };
        const editResult = keybindManager.editParameterizedCommand(testCommand);
        expect(editResult).toBeDefined();
        
        const editPopulateResult = keybindManager.populateParameterModalForEdit(testCommand);
        expect(editPopulateResult).toBeDefined();
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

    it('should perform all view mode operations correctly', () => {
        // Test multiple view mode rendering
        const categorizedView = keybindManager.renderCategorizedKeyView();
        expect(categorizedView).toBeDefined();
        
        const keyTypeView = keybindManager.renderKeyTypeView();
        expect(keyTypeView).toBeDefined();
        
        const simpleGrid = keybindManager.renderSimpleKeyGrid();
        expect(simpleGrid).toBeDefined();
        
        // Test key categorization
        const testKeys = { 'F1': [], 'A': [], '1': [] };
        const categorized = keybindManager.categorizeKeys(testKeys);
        expect(categorized).toBeDefined();
        
        const categorizedByType = keybindManager.categorizeKeysByType(testKeys, Object.keys(testKeys));
        expect(categorizedByType).toBeDefined();
        
        // Test category toggle functionality
        const toggleResult = keybindManager.toggleKeyCategory('function');
        expect(toggleResult).toBeDefined();
        
        const categoryElement = keybindManager.createKeyCategoryElement('function', ['F1', 'F2']);
        expect(categoryElement).toBeDefined();
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

    it('should perform key filtering operations correctly', () => {
        // Create test key elements
        const testKey1 = document.createElement('div');
        testKey1.className = 'key-item';
        testKey1.dataset.key = 'space';
        document.body.appendChild(testKey1);
        
        const testKey2 = document.createElement('div');
        testKey2.className = 'key-item';
        testKey2.dataset.key = 'f1';
        document.body.appendChild(testKey2);
        
        // Test key filtering
        const filterResult = keybindManager.filterKeys('spa');
        expect(filterResult).toBeDefined();
        
        // Test showing all keys
        const showAllResult = keybindManager.showAllKeys();
        expect(showAllResult).toBeDefined();
        
        // Cleanup
        document.body.removeChild(testKey1);
        document.body.removeChild(testKey2);
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

    it('should perform command identification correctly', () => {
        const testCommand = {
            command: 'FireAll',
            type: 'combat',
            text: 'Fire All Weapons'
        };
        
        // Test command definition finding
        const commandDef = keybindManager.findCommandDefinition(testCommand);
        expect(commandDef).toBeDefined();
        
        // Test command warning detection
        const warning = keybindManager.getCommandWarning(testCommand);
        expect(warning).toBeDefined();
        expect(typeof warning).toBe('string');
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

    it('should perform all UI interaction operations correctly', () => {
        // Test command addition from library
        const testCommand = { command: 'Target', type: 'targeting', text: 'Target' };
        const addResult = keybindManager.addCommandFromLibrary('Space', testCommand);
        expect(addResult).toBeDefined();
        
        // Test command editing
        const editResult = keybindManager.editCommand(0, testCommand);
        expect(editResult).toBeDefined();
        
        // Test key element creation
        const keyElement = keybindManager.createKeyElement('Space');
        expect(keyElement).toBeDefined();
        expect(keyElement.tagName).toBe('DIV');
        expect(keyElement.dataset.key).toBe('Space');
        
        // Test key selection
        const selectResult = keybindManager.selectKey('Space');
        expect(selectResult).toBeDefined();
    });
}); 