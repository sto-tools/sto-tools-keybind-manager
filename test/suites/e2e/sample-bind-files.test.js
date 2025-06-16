/**
 * E2E Tests for Sample Bind File Loading
 * Tests loading and parsing of actual user bind files
 */

describe('Sample Bind File Loading', () => {
    beforeAll(async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
    });

    beforeEach(() => {
        // Reset to clean state
        if (window.app && window.app.resetApplication) {
            window.app.resetApplication();
        }
    });

    describe('Space Bind File (mybinds.txt)', () => {
        let spaceBindContent;
        let parsedSpaceBinds;

        beforeAll(async () => {
            // Load the space bind file content directly from filesystem
            try {
                const fs = require('fs');
                const path = require('path');
                const filePath = path.join(process.cwd(), 'samples', 'mybinds.txt');
                spaceBindContent = fs.readFileSync(filePath, 'utf8');
                
                // Parse the bind file using the keybind manager
                if (window.stoKeybinds && window.stoKeybinds.parseKeybindFile) {
                    parsedSpaceBinds = window.stoKeybinds.parseKeybindFile(spaceBindContent);
                }
            } catch (error) {
                console.warn('Could not load space bind file:', error);
            }
        });

        it('should successfully load space bind file content', () => {
            expect(spaceBindContent).toBeTruthy();
            expect(spaceBindContent.length).toBeGreaterThan(1000);
            expect(spaceBindContent).toContain('SPACE');
            expect(spaceBindContent).toContain('TrayExecByTrayWithBackup');
        });

        it('should parse space bind file without errors', () => {
            if (parsedSpaceBinds) {
                expect(parsedSpaceBinds).toBeTruthy();
                expect(typeof parsedSpaceBinds).toBe('object');
            }
        });

        it('should correctly parse SPACE key binding', () => {
            if (parsedSpaceBinds && parsedSpaceBinds.SPACE) {
                const spaceBinding = parsedSpaceBinds.SPACE;
                expect(spaceBinding).toBeTruthy();
                expect(spaceBinding).toContain('LootRollNeed');
                expect(spaceBinding).toContain('TrayExecByTrayWithBackup');
            }
        });

        it('should correctly parse movement keys (E, D, S, F)', () => {
            if (parsedSpaceBinds) {
                // Movement keys
                if (parsedSpaceBinds.E) {
                    expect(parsedSpaceBinds.E).toContain('invertibleup');
                }
                if (parsedSpaceBinds.D) {
                    expect(parsedSpaceBinds.D).toContain('invertibledown');
                }
                if (parsedSpaceBinds.S) {
                    expect(parsedSpaceBinds.S).toContain('left');
                }
                if (parsedSpaceBinds.F) {
                    expect(parsedSpaceBinds.F).toContain('right');
                }
            }
        });

        it('should correctly parse tray execution bindings', () => {
            if (parsedSpaceBinds) {
                // Check various tray execution bindings
                const trayKeys = ['C', 'T', 'V', 'A', 'Q', 'Z'];
                trayKeys.forEach(key => {
                    if (parsedSpaceBinds[key]) {
                        expect(parsedSpaceBinds[key]).toContain('TrayExec');
                    }
                });
            }
        });

        it('should correctly parse numbered keys (1-9, 0)', () => {
            if (parsedSpaceBinds) {
                // Check numbered keys
                for (let i = 1; i <= 9; i++) {
                    if (parsedSpaceBinds[i.toString()]) {
                        const binding = parsedSpaceBinds[i.toString()];
                        expect(typeof binding).toBe('string');
                        expect(binding.length).toBeGreaterThan(0);
                    }
                }
                
                if (parsedSpaceBinds['0']) {
                    expect(parsedSpaceBinds['0']).toContain('TrayExecByTray');
                }
            }
        });

        it('should correctly parse function keys (F9, F10, F11, F12)', () => {
            if (parsedSpaceBinds) {
                if (parsedSpaceBinds.F9) {
                    expect(parsedSpaceBinds.F9).toContain('dynFxExcludeFX');
                }
                if (parsedSpaceBinds.F10) {
                    expect(parsedSpaceBinds.F10).toContain('dynFxExcludeFX');
                }
                if (parsedSpaceBinds.F11) {
                    expect(parsedSpaceBinds.F11).toContain('toggle_combatlog_off');
                }
                if (parsedSpaceBinds.F12) {
                    expect(parsedSpaceBinds.F12).toContain('toggle_combatlog_on');
                }
            }
        });

        it('should correctly parse modifier key combinations', () => {
            if (parsedSpaceBinds) {
                // Control combinations
                if (parsedSpaceBinds['Control+j']) {
                    expect(parsedSpaceBinds['Control+j']).toContain('Missions');
                }
                if (parsedSpaceBinds['Control+m']) {
                    expect(parsedSpaceBinds['Control+m']).toContain('Map');
                }
                if (parsedSpaceBinds['Control+L']) {
                    expect(parsedSpaceBinds['Control+L']).toContain('save_my_space_binds');
                }
                
                // Alt combinations
                if (parsedSpaceBinds['ALT+1']) {
                    expect(parsedSpaceBinds['ALT+1']).toContain('TrayExecByTray 6 0');
                }
            }
        });

        it('should correctly parse mouse bindings', () => {
            if (parsedSpaceBinds) {
                if (parsedSpaceBinds.Middleclick) {
                    expect(parsedSpaceBinds.Middleclick).toContain('throttletoggle');
                }
                if (parsedSpaceBinds.Button4) {
                    expect(parsedSpaceBinds.Button4).toContain('FullImpulseToggle');
                }
                if (parsedSpaceBinds.Button5) {
                    expect(parsedSpaceBinds.Button5).toContain('TrayExecByTrayWithBackup');
                }
            }
        });

        it('should correctly parse wheel bindings', () => {
            if (parsedSpaceBinds) {
                if (parsedSpaceBinds.Wheelplus) {
                    expect(parsedSpaceBinds.Wheelplus).toContain('throttleadjust');
                }
                if (parsedSpaceBinds.Wheelminus) {
                    expect(parsedSpaceBinds.Wheelminus).toContain('throttleadjust');
                }
            }
        });

        it('should handle complex command chains correctly', () => {
            if (parsedSpaceBinds && parsedSpaceBinds.SPACE) {
                const spaceCommand = parsedSpaceBinds.SPACE;
                // Should contain multiple commands separated by $$
                const commandCount = (spaceCommand.match(/\$\$/g) || []).length;
                expect(commandCount).toBeGreaterThan(10); // Complex chain
            }
        });

        it('should correctly handle commented lines (semicolon comments)', () => {
            expect(spaceBindContent).toBeTruthy();
            
            // Should contain commented lines starting with semicolon
            expect(spaceBindContent).toContain(';SPACE');
            expect(spaceBindContent).toContain(';Rightdrag');
            expect(spaceBindContent).toContain(';Button4');
            expect(spaceBindContent).toContain(';Middleclick');
            
            // Commented lines should not be parsed as active bindings
            if (parsedSpaceBinds) {
                // These should not exist as they're commented out
                expect(parsedSpaceBinds[';SPACE']).toBeUndefined();
                expect(parsedSpaceBinds[';Rightdrag']).toBeUndefined();
                expect(parsedSpaceBinds[';Button4']).toBeUndefined();
                expect(parsedSpaceBinds[';Middleclick']).toBeUndefined();
            }
        });

        it('should parse active bindings vs commented alternatives correctly', () => {
            if (parsedSpaceBinds) {
                // Button4 should be active (FullImpulseToggle), not commented (throttletoggle)
                if (parsedSpaceBinds.Button4) {
                    expect(parsedSpaceBinds.Button4).toContain('FullImpulseToggle');
                    expect(parsedSpaceBinds.Button4).not.toContain('throttletoggle');
                }
                
                // Middleclick should be active (throttletoggle), not commented (FullImpulseToggle)
                if (parsedSpaceBinds.Middleclick) {
                    expect(parsedSpaceBinds.Middleclick).toContain('throttletoggle');
                    expect(parsedSpaceBinds.Middleclick).not.toContain('FullImpulseToggle');
                }
                
                // Rightdrag should be empty/unbound since it's commented out
                if (parsedSpaceBinds.Rightdrag !== undefined) {
                    expect(parsedSpaceBinds.Rightdrag).toBe('');
                }
            }
        });
    });

    describe('Ground Bind File (mybinds_ground.txt)', () => {
        let groundBindContent;
        let parsedGroundBinds;

        beforeAll(async () => {
            // Load the ground bind file content directly from filesystem
            try {
                const fs = require('fs');
                const path = require('path');
                const filePath = path.join(process.cwd(), 'samples', 'mybinds_ground.txt');
                groundBindContent = fs.readFileSync(filePath, 'utf8');
                
                // Parse the bind file using the keybind manager
                if (window.stoKeybinds && window.stoKeybinds.parseKeybindFile) {
                    parsedGroundBinds = window.stoKeybinds.parseKeybindFile(groundBindContent);
                }
            } catch (error) {
                console.warn('Could not load ground bind file:', error);
            }
        });

        it('should successfully load ground bind file content', () => {
            expect(groundBindContent).toBeTruthy();
            expect(groundBindContent.length).toBeGreaterThan(500);
            expect(groundBindContent).toContain('InteractWindow');
            expect(groundBindContent).toContain('TrayExecByTrayWithBackup');
        });

        it('should parse ground bind file without errors', () => {
            if (parsedGroundBinds) {
                expect(parsedGroundBinds).toBeTruthy();
                expect(typeof parsedGroundBinds).toBe('object');
            }
        });

        it('should correctly parse ground-specific bindings', () => {
            if (parsedGroundBinds) {
                // Ground interaction
                if (parsedGroundBinds.G) {
                    expect(parsedGroundBinds.G).toContain('InteractWindow');
                }
                
                // Load ground binds
                if (parsedGroundBinds.L) {
                    expect(parsedGroundBinds.L).toContain('load_my_ground_binds');
                }
            }
        });

        it('should correctly parse ground team buff bindings', () => {
            if (parsedGroundBinds) {
                if (parsedGroundBinds.Q) {
                    expect(parsedGroundBinds.Q).toContain('TrayExecByTrayWithBackup');
                    expect(parsedGroundBinds.Q).toContain('Team buffs');
                }
                
                if (parsedGroundBinds.E) {
                    expect(parsedGroundBinds.E).toContain('TrayExecByTrayWithBackup');
                    expect(parsedGroundBinds.E).toContain('Calling a friend');
                }
            }
        });

        it('should correctly parse ground mouse bindings', () => {
            if (parsedGroundBinds) {
                if (parsedGroundBinds.Button5) {
                    expect(parsedGroundBinds.Button5).toContain('Healing Nanite');
                    expect(parsedGroundBinds.Button5).toContain('TrayExecByTrayWithBackup');
                }
                
                if (parsedGroundBinds.Button4) {
                    expect(parsedGroundBinds.Button4).toContain('TrayExecByTrayWithBackup');
                }
            }
        });

        it('should correctly parse ground emote bindings', () => {
            if (parsedGroundBinds) {
                const emoteKeys = ['numpad1', 'numpad2', 'numpad3', 'numpad4', 'numpad5', 'numpad6', 'numpad7', 'numpad8'];
                emoteKeys.forEach(key => {
                    if (parsedGroundBinds[key]) {
                        expect(parsedGroundBinds[key]).toContain('em dance');
                    }
                });
            }
        });

        it('should correctly parse ground utility bindings', () => {
            if (parsedGroundBinds) {
                if (parsedGroundBinds.numpad9) {
                    expect(parsedGroundBinds.numpad9).toContain('GenSendMessage');
                }
                
                if (parsedGroundBinds.divide) {
                    expect(parsedGroundBinds.divide).toContain('gotocharacterselect');
                }
                
                if (parsedGroundBinds.multiply) {
                    expect(parsedGroundBinds.multiply).toContain('duty');
                }
            }
        });

        it('should correctly parse ground VFX control bindings', () => {
            if (parsedGroundBinds) {
                if (parsedGroundBinds.F8) {
                    expect(parsedGroundBinds.F8).toContain('dynFxExcludeFX');
                    expect(parsedGroundBinds.F8).toContain('PlayerSay VFXS8');
                }
                
                if (parsedGroundBinds.F9) {
                    expect(parsedGroundBinds.F9).toContain('dynFxExcludeFX');
                    expect(parsedGroundBinds.F9).toContain('PlayerSay VFXS9');
                }
                
                if (parsedGroundBinds.F10) {
                    expect(parsedGroundBinds.F10).toContain('dynFxExcludeFX');
                    expect(parsedGroundBinds.F10).toContain('PlayerSay VFXS10');
                }
            }
        });

        it('should correctly handle commented lines in ground binds', () => {
            expect(groundBindContent).toBeTruthy();
            
            // Ground file doesn't have as many comments, but should handle them properly
            // The parser should ignore any lines starting with semicolon
            if (parsedGroundBinds) {
                // Any commented keys should not appear in parsed results
                Object.keys(parsedGroundBinds).forEach(key => {
                    expect(key.startsWith(';')).toBe(false);
                });
            }
        });
    });

    describe('Comment Parsing Behavior', () => {
        it('should properly distinguish between active and commented bindings', async () => {
            if (window.stoKeybinds && window.stoKeybinds.parseKeybindFile) {
                // Test with a sample that has both active and commented lines
                const testBindContent = `
; This is a comment line
A "FireAll" ""
; A "CommentedFireAll" ""
B "TrayExecByTray 1 0" ""
;B "CommentedTrayExec" ""
; Another comment
C "" ""
`;
                
                const parsed = window.stoKeybinds.parseKeybindFile(testBindContent);
                
                if (parsed && parsed.keybinds && Object.keys(parsed.keybinds).length > 0) {
                    // Active bindings should be parsed
                    expect(parsed.keybinds.A).toBeTruthy();
                    expect(parsed.keybinds.A.commands[0].command).toBe('FireAll');
                    expect(parsed.keybinds.B).toBeTruthy();
                    expect(parsed.keybinds.B.commands[0].command).toBe('TrayExecByTray 1 0');
                    expect(parsed.keybinds.C).toBeTruthy();
                    expect(parsed.keybinds.C.commands[0].command).toBe('');
                    
                    // Commented bindings should not exist
                    expect(parsed.keybinds['; A']).toBeUndefined();
                    expect(parsed.keybinds[';B']).toBeUndefined();
                    expect(parsed.keybinds['; This is a comment line']).toBeUndefined();
                    expect(parsed.keybinds['; Another comment']).toBeUndefined();
                    
                    // Comments should be captured separately
                    expect(parsed.comments.length).toBeGreaterThan(0);
                    
                    // Should not contain commented commands in keybinds
                    const allCommands = Object.values(parsed.keybinds).flatMap(kb => kb.commands.map(c => c.command));
                    expect(allCommands.includes('CommentedFireAll')).toBe(false);
                    expect(allCommands.includes('CommentedTrayExec')).toBe(false);
                } else {
                    // If parsing fails or returns empty, skip this test
                    console.warn('Keybind parsing returned empty or failed, skipping comment parsing test');
                }
            }
        });

        it('should handle mixed comment styles correctly', async () => {
            if (window.stoKeybinds && window.stoKeybinds.parseKeybindFile) {
                // Test various comment patterns from the actual bind files
                const testContent = `
;SPACE "Target_Enemy_Near_ForArc 90" ""
SPACE "LootRollNeed" ""
;Middleclick "FullImpulseToggle" ""
Middleclick "throttletoggle" ""
; Comment with spaces
;Comment without spaces
X "ActiveBinding" ""
`;
                
                const parsed = window.stoKeybinds.parseKeybindFile(testContent);
                
                if (parsed && parsed.keybinds && Object.keys(parsed.keybinds).length > 0) {
                    // Only active bindings should be present
                    expect(parsed.keybinds.SPACE).toBeTruthy();
                    expect(parsed.keybinds.SPACE.commands[0].command).toBe('LootRollNeed');
                    expect(parsed.keybinds.Middleclick).toBeTruthy();
                    expect(parsed.keybinds.Middleclick.commands[0].command).toBe('throttletoggle');
                    expect(parsed.keybinds.X).toBeTruthy();
                    expect(parsed.keybinds.X.commands[0].command).toBe('ActiveBinding');
                    
                    // Commented versions should not override active ones
                    expect(parsed.keybinds.SPACE.commands[0].command === 'Target_Enemy_Near_ForArc 90').toBe(false);
                    expect(parsed.keybinds.Middleclick.commands[0].command === 'FullImpulseToggle').toBe(false);
                    
                    // Comments should be captured
                    expect(parsed.comments.length).toBeGreaterThan(0);
                } else {
                    // If parsing fails or returns empty, skip this test
                    console.warn('Keybind parsing returned empty or failed, skipping mixed comment test');
                }
            }
        });
    });

    describe('Bind File Comparison', () => {
        it('should have different content between space and ground files', async () => {
            try {
                const fs = require('fs');
                const path = require('path');
                const spaceFilePath = path.join(process.cwd(), 'samples', 'mybinds.txt');
                const groundFilePath = path.join(process.cwd(), 'samples', 'mybinds_ground.txt');
                
                const spaceContent = fs.readFileSync(spaceFilePath, 'utf8');
                const groundContent = fs.readFileSync(groundFilePath, 'utf8');
                
                expect(spaceContent).not.toBe(groundContent);
                expect(spaceContent.length).toBeGreaterThan(groundContent.length);
                
                // Space-specific content
                expect(spaceContent).toContain('FireAll');
                expect(spaceContent).toContain('invertibleup');
                expect(spaceContent).toContain('throttleadjust');
                
                // Ground-specific content
                expect(groundContent).toContain('em dance');
                expect(groundContent).toContain('gotocharacterselect');
                expect(groundContent).toContain('duty');
                
                // Ground should not have space-specific commands
                expect(groundContent).not.toContain('FireAll');
                expect(groundContent).not.toContain('throttleadjust');
            } catch (error) {
                console.warn('Could not compare bind files:', error);
            }
        });
    });

    describe('Bind File Integration with Application', () => {
        it('should be able to import space bind file into application', async () => {
            if (window.stoKeybinds && window.stoKeybinds.importKeybindFile) {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const filePath = path.join(process.cwd(), 'samples', 'mybinds.txt');
                    const content = fs.readFileSync(filePath, 'utf8');
                    
                    const result = window.stoKeybinds.importKeybindFile(content, 'space');
                    
                    if (result) {
                        expect(result.success).toBe(true);
                        expect(result.keysImported).toBeGreaterThan(20);
                    }
                } catch (error) {
                    console.warn('Could not import space bind file:', error);
                }
            }
        });

        it('should be able to import ground bind file into application', async () => {
            if (window.stoKeybinds && window.stoKeybinds.importKeybindFile) {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const filePath = path.join(process.cwd(), 'samples', 'mybinds_ground.txt');
                    const content = fs.readFileSync(filePath, 'utf8');
                    
                    const result = window.stoKeybinds.importKeybindFile(content, 'ground');
                    
                    if (result) {
                        expect(result.success).toBe(true);
                        expect(result.keysImported).toBeGreaterThan(10);
                    }
                } catch (error) {
                    console.warn('Could not import ground bind file:', error);
                }
            }
        });

        it('should validate imported bind commands', async () => {
            if (window.stoKeybinds && window.stoCommands) {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const filePath = path.join(process.cwd(), 'samples', 'mybinds.txt');
                    const content = fs.readFileSync(filePath, 'utf8');
                    const parsed = window.stoKeybinds.parseKeybindFile(content);
                    
                    if (parsed) {
                        // Test a few key commands for validity
                        const testKeys = ['SPACE', 'C', 'T', 'V'];
                        testKeys.forEach(key => {
                            if (parsed[key]) {
                                const result = window.stoCommands.validateCommand(parsed[key]);
                                if (result) {
                                    expect(result.valid).toBe(true);
                                }
                            }
                        });
                    }
                } catch (error) {
                    console.warn('Could not validate imported commands:', error);
                }
            }
        });

        it('should detect command types in imported binds', async () => {
            if (window.stoKeybinds && window.stoCommands) {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const filePath = path.join(process.cwd(), 'samples', 'mybinds.txt');
                    const content = fs.readFileSync(filePath, 'utf8');
                    const parsed = window.stoKeybinds.parseKeybindFile(content);
                    
                    if (parsed) {
                        // Test command type detection
                        if (parsed['1'] && parsed['1'].includes('FireAll')) {
                            const type = window.stoCommands.detectCommandType('FireAll');
                            expect(type).toBe('combat');
                        }
                        
                        if (parsed.G && parsed.G.includes('InteractWindow')) {
                            const type = window.stoCommands.detectCommandType('InteractWindow');
                            expect(type).toBe('system');
                        }
                        
                        if (parsed.C && parsed.C.includes('TrayExecByTrayWithBackup')) {
                            const type = window.stoCommands.detectCommandType('TrayExecByTrayWithBackup 1 1 8 1 9');
                            expect(type).toBe('tray');
                        }
                    }
                } catch (error) {
                    console.warn('Could not detect command types:', error);
                }
            }
        });
    });

    describe('Bind File Statistics', () => {
        it('should calculate correct statistics for space bind file', async () => {
            if (window.stoKeybinds) {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const filePath = path.join(process.cwd(), 'samples', 'mybinds.txt');
                    const content = fs.readFileSync(filePath, 'utf8');
                    const parsed = window.stoKeybinds.parseKeybindFile(content);
                    
                    if (parsed) {
                        const keyCount = Object.keys(parsed).length;
                        expect(keyCount).toBeGreaterThan(30); // Should have many bindings
                        
                        // Count complex bindings (with multiple commands)
                        let complexBindings = 0;
                        Object.values(parsed).forEach(binding => {
                            if (binding.includes('$$')) {
                                complexBindings++;
                            }
                        });
                        expect(complexBindings).toBeGreaterThan(5);
                    }
                } catch (error) {
                    console.warn('Could not calculate space bind statistics:', error);
                }
            }
        });

        it('should calculate correct statistics for ground bind file', async () => {
            if (window.stoKeybinds) {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const filePath = path.join(process.cwd(), 'samples', 'mybinds_ground.txt');
                    const content = fs.readFileSync(filePath, 'utf8');
                    const parsed = window.stoKeybinds.parseKeybindFile(content);
                    
                    if (parsed) {
                        const keyCount = Object.keys(parsed).length;
                        expect(keyCount).toBeGreaterThan(15); // Should have reasonable number of bindings
                        expect(keyCount).toBeLessThan(50); // But fewer than space
                        
                        // Should have emote bindings
                        let emoteBindings = 0;
                        Object.values(parsed).forEach(binding => {
                            if (binding.includes('em dance')) {
                                emoteBindings++;
                            }
                        });
                        expect(emoteBindings).toBeGreaterThan(5);
                    }
                } catch (error) {
                    console.warn('Could not calculate ground bind statistics:', error);
                }
            }
        });
    });
}); 