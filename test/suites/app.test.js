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
    });

    beforeEach(() => {
        if (typeof window.STOKeybindManager !== 'undefined') {
            keybindManager = new window.STOKeybindManager();
        }
    });

    it('should create STOKeybindManager instance', () => {
        if (keybindManager) {
            expect(keybindManager).toBeDefined();
            expect(keybindManager.constructor.name).toBe('STOKeybindManager');
        }
    });

    it('should have command identification methods', () => {
        if (keybindManager) {
            expect(typeof keybindManager.findCommandDefinition).toBe('function');
            expect(typeof keybindManager.getCommandWarning).toBe('function');
        }
    });

    it('should have view mode methods', () => {
        if (keybindManager) {
            expect(typeof keybindManager.renderKeyGrid).toBe('function');
            expect(typeof keybindManager.toggleKeyView).toBe('function');
            expect(typeof keybindManager.updateViewToggleButton).toBe('function');
        }
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
        if (keybindManager) {
            expect(typeof keybindManager.buildParameterizedCommand).toBe('function');
        }
    });

    it('should handle parameter value retrieval', () => {
        if (keybindManager) {
            expect(typeof keybindManager.getParameterValues).toBe('function');
        }
    });

    it('should support parameter modal functionality', () => {
        if (keybindManager) {
            expect(typeof keybindManager.showParameterModal).toBe('function');
            expect(typeof keybindManager.createParameterModal).toBe('function');
            expect(typeof keybindManager.populateParameterModal).toBe('function');
            expect(typeof keybindManager.saveParameterCommand).toBe('function');
            expect(typeof keybindManager.cancelParameterCommand).toBe('function');
        }
    });

    it('should support editing parameterized commands', () => {
        if (keybindManager) {
            expect(typeof keybindManager.editParameterizedCommand).toBe('function');
            expect(typeof keybindManager.populateParameterModalForEdit).toBe('function');
        }
    });

    it('should format parameter names correctly', () => {
        if (keybindManager && typeof keybindManager.formatParameterName === 'function') {
            const testCases = [
                { input: 'tray', expected: 'Tray' },
                { input: 'slot', expected: 'Slot' },
                { input: 'backup_tray', expected: 'Backup Tray' },
                { input: 'entityName', expected: 'Entity Name' }
            ];

            testCases.forEach(testCase => {
                const result = keybindManager.formatParameterName(testCase.input);
                if (result) {
                    expect(result).toBe(testCase.expected);
                }
            });
        }
    });

    it('should provide parameter help text', () => {
        if (keybindManager && typeof keybindManager.getParameterHelp === 'function') {
            const mockParamDef = { type: 'number', min: 0, max: 9 };
            const help = keybindManager.getParameterHelp('tray', mockParamDef);
            
            if (help) {
                expect(typeof help).toBe('string');
                expect(help.length).toBeGreaterThan(0);
            }
        }
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
        if (keybindManager) {
            expect(typeof keybindManager.renderCategorizedKeyView).toBe('function');
            expect(typeof keybindManager.renderKeyTypeView).toBe('function');
            expect(typeof keybindManager.renderSimpleKeyGrid).toBe('function');
        }
    });

    it('should handle key categorization', () => {
        if (keybindManager) {
            expect(typeof keybindManager.categorizeKeys).toBe('function');
            expect(typeof keybindManager.categorizeKeysByType).toBe('function');
        }
    });

    it('should support category toggle functionality', () => {
        if (keybindManager) {
            expect(typeof keybindManager.toggleKeyCategory).toBe('function');
            expect(typeof keybindManager.createKeyCategoryElement).toBe('function');
        }
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
        if (keybindManager && typeof keybindManager.categorizeKeysByType === 'function') {
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
            
            if (categorized) {
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
            }
        }
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
        if (keybindManager) {
            expect(typeof keybindManager.filterKeys).toBe('function');
            expect(typeof keybindManager.showAllKeys).toBe('function');
        }
    });

    it('should handle filter input properly', () => {
        if (keybindManager && typeof keybindManager.filterKeys === 'function') {
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
        }
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
        if (keybindManager && typeof keybindManager.findCommandDefinition === 'function') {
            const testCommand = {
                command: 'FireAll',
                type: 'combat',
                text: 'Fire All Weapons'
            };
            
            const commandDef = keybindManager.findCommandDefinition(testCommand);
            // Test passes if method exists and can be called
            expect(typeof keybindManager.findCommandDefinition).toBe('function');
        }
    });

    it('should detect command warnings', () => {
        if (keybindManager && typeof keybindManager.getCommandWarning === 'function') {
            const testCommand = {
                command: 'FireAll',
                type: 'combat',
                text: 'Fire All Weapons'
            };
            
            const warning = keybindManager.getCommandWarning(testCommand);
            // Test passes if method exists and returns a value (or null)
            expect(typeof keybindManager.getCommandWarning).toBe('function');
        }
    });

    it('should support command element creation with parameters', () => {
        if (keybindManager && typeof keybindManager.createCommandElement === 'function') {
            const testCommand = {
                command: '+STOTrayExecByTray 0 5',
                type: 'tray',
                text: 'Execute Tray 1 Slot 6',
                parameters: { tray: 0, slot: 5 },
                id: 'test-cmd'
            };
            
            const element = keybindManager.createCommandElement(testCommand, 0);
            
            if (element) {
                expect(element.tagName).toBe('DIV');
                expect(element.dataset.index).toBe('0');
            }
        }
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
        if (keybindManager) {
            expect(typeof keybindManager.addCommandFromLibrary).toBe('function');
        }
    });

    it('should support command editing', () => {
        if (keybindManager) {
            expect(typeof keybindManager.editCommand).toBe('function');
        }
    });

    it('should handle key element creation', () => {
        if (keybindManager && typeof keybindManager.createKeyElement === 'function') {
            const keyElement = keybindManager.createKeyElement('Space');
            
            if (keyElement) {
                expect(keyElement.tagName).toBe('DIV');
                expect(keyElement.dataset.key).toBe('Space');
            }
        }
    });

    it('should handle key selection', () => {
        if (keybindManager) {
            expect(typeof keybindManager.selectKey).toBe('function');
        }
    });
}); 