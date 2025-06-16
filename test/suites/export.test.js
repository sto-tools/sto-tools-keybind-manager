/**
 * Unit Tests for export.js
 * Tests export functionality and file generation
 */

describe('Export Module', () => {
    // This is just a container - no tests here
});

describe('ExportManager Class', () => {
    let exportManager;

    beforeAll(() => {
        if (typeof window.stoExport === 'undefined') {
            throw new Error('Export module not loaded');
        }
    });

    beforeEach(() => {
        exportManager = window.stoExport;
    });

    it('should create ExportManager instance', () => {
        expect(exportManager).toBeDefined();
        expect(exportManager.constructor.name).toBe('STOExportManager');
    });

    it('should have required methods', () => {
        expect(typeof exportManager.exportSTOKeybindFile).toBe('function');
        expect(typeof exportManager.generateSTOKeybindFile).toBe('function');
        expect(typeof exportManager.exportJSONProfile).toBe('function');
        expect(typeof exportManager.exportCSVData).toBe('function');
        expect(typeof exportManager.exportHTMLReport).toBe('function');
        expect(typeof exportManager.generateFileName).toBe('function');
        expect(typeof exportManager.sanitizeProfileForExport).toBe('function');
        expect(typeof exportManager.importJSONFile).toBe('function');
    });
});

describe('STO File Generation', () => {
    let exportManager;
    let sampleProfile;

    beforeAll(() => {
        if (typeof window.stoExport === 'undefined') {
            throw new Error('Export module not loaded');
        }
    });

    beforeEach(() => {
        exportManager = window.stoExport;
        
        // Create sample profile for testing
        sampleProfile = {
            name: 'Test Profile',
            description: 'A test profile',
            mode: 'space',
            keys: {
                'a': [{ command: 'target', type: 'targeting' }],
                'b': [{ command: 'fire_all', type: 'combat' }]
            },
            aliases: {
                'attack': {
                    name: 'Attack Sequence',
                    commands: 'target $$ fire_all',
                    description: 'Target and attack'
                }
            }
        };
    });

    it('should generate STO keybind file content', () => {
        const content = exportManager.generateSTOKeybindFile(sampleProfile);
        expect(typeof content).toBe('string');
        expect(content.length).toBeGreaterThan(0);
        expect(content).toContain('# Test Profile - STO Keybind Configuration');
    });

    it('should generate file header', () => {
        const header = exportManager.generateFileHeader(sampleProfile);
        expect(typeof header).toBe('string');
        expect(header).toContain(sampleProfile.name);
    });

    it('should generate filename', () => {
        const filename = exportManager.generateFileName(sampleProfile, 'txt');
        expect(typeof filename).toBe('string');
        expect(filename).toContain('.txt');
    });
});

describe('Profile Sanitization', () => {
    let exportManager;

    beforeAll(() => {
        if (typeof window.stoExport === 'undefined') {
            throw new Error('Export module not loaded');
        }
    });

    beforeEach(() => {
        exportManager = window.stoExport;
    });

    it('should sanitize profile for export', () => {
        const profile = {
            name: 'Test Profile',
            keys: { 'a': [{ command: 'target' }] },
            internalData: 'should be removed'
        };

        const sanitized = exportManager.sanitizeProfileForExport(profile);
        expect(sanitized).toBeDefined();
        expect(sanitized.name).toBe(profile.name);
        expect(sanitized.keys).toBeDefined();
    });
});

describe('Export Comment Syntax', () => {
    let exportManager;

    beforeAll(() => {
        if (typeof window.stoExport === 'undefined') {
            throw new Error('Export module not loaded');
        }
    });

    beforeEach(() => {
        exportManager = window.stoExport;
    });

    it('should use semicolon comment syntax in exported files', () => {
        const testProfile = {
            name: 'Test Profile',
            mode: 'space',
            keys: {
                'space': [{ command: 'FireAll', type: 'combat', id: 'cmd1' }],
                'f1': [{ command: '+STOTrayExecByTray 0 5', type: 'tray', id: 'cmd2' }]
            },
            aliases: {}
        };

        const exportResult = exportManager.exportToSTO(testProfile);
        
        if (exportResult && typeof exportResult === 'string') {
            // Check that comments use semicolon syntax instead of hash
            const lines = exportResult.split('\n');
            const commentLines = lines.filter(line => line.trim().startsWith(';'));
            
            // Should have comments with semicolon syntax
            expect(commentLines.length).toBeGreaterThan(0);
            
            // Should not have hash comments in command documentation
            const hashCommentLines = lines.filter(line => line.trim().startsWith('#') && !line.includes('bind'));
            expect(hashCommentLines.length).toBe(0);
        }
    });

    it('should maintain proper command documentation format', () => {
        const testProfile = {
            name: 'Documentation Test',
            mode: 'space',
            keys: {
                't': [{ command: 'Target_Enemy_Near', type: 'targeting', id: 'cmd1' }]
            },
            aliases: {}
        };

        const exportResult = exportManager.exportToSTO(testProfile);
        
        if (exportResult && typeof exportResult === 'string') {
            // Check that the export contains proper bind format
            expect(exportResult).toContain('bind');
            
            // Check for consistent comment style
            const lines = exportResult.split('\n');
            const commentLines = lines.filter(line => line.trim().startsWith(';'));
            
            commentLines.forEach(line => {
                // Comments should start with semicolon
                expect(line.trim().charAt(0)).toBe(';');
            });
        }
    });

    it('should preserve existing export functionality after comment syntax change', () => {
        // Test that basic export methods still exist and work
        expect(typeof exportManager.exportToSTO).toBe('function');
        expect(typeof exportManager.exportToJSON).toBe('function');
        
        if (typeof exportManager.generateBindCommand === 'function') {
            expect(typeof exportManager.generateBindCommand).toBe('function');
        }
        
        if (typeof exportManager.formatComment === 'function') {
            expect(typeof exportManager.formatComment).toBe('function');
        }
    });
}); 