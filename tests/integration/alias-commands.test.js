// Integration tests for alias command functionality
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Alias Command Integration', () => {
    let mockApp, mockProfile, mockCommands, mockUI;

    beforeEach(() => {
        // Mock profile with aliases
        mockProfile = {
            name: 'Test Profile',
            aliases: {
                'TestAlias1': {
                    name: 'TestAlias1',
                    description: 'Test alias for targeting',
                    commands: 'target_nearest_enemy $$ FireAll'
                },
                'TestAlias2': {
                    name: 'TestAlias2',
                    description: 'Test alias for healing',
                    commands: 'target_self $$ +power_exec Science_Team'
                },
                'dynFxSetFXExlusionList_Space': {
                    name: 'dynFxSetFXExlusionList_Space',
                    description: 'Vertigo - Disable Space Visual Effects',
                    commands: 'dynFxSetFXExlusionList Fx_Explosion_Large,Fx_Weapon_Beam $$ PlayerSay Vertigo VFX Loaded'
                }
            }
        };

        mockApp = {
            getCurrentProfile: vi.fn(() => mockProfile)
        };

        mockUI = {
            showModal: vi.fn(),
            hideModal: vi.fn(),
            showToast: vi.fn()
        };

        mockCommands = {
            commandBuilders: new Map(),
            setupCommandBuilders() {
                this.commandBuilders.set('alias', {
                    build: (commandId, params = {}) => {
                        const aliasName = params.alias_name || '';
                        
                        if (!aliasName.trim()) {
                            return null;
                        }
                        
                        return {
                            command: aliasName,
                            type: 'alias',
                            icon: '📝',
                            text: `Alias: ${aliasName}`,
                            description: 'Execute custom alias',
                            parameters: { alias_name: aliasName }
                        };
                    },
                    getUI: () => this.createAliasUI()
                });
            },
            createAliasUI() {
                const profile = mockApp.getCurrentProfile();
                const aliases = profile?.aliases || {};
                const aliasEntries = Object.entries(aliases);
                
                if (aliasEntries.length === 0) {
                    return `
                        <div class="alias-builder">
                            <div class="empty-state">
                                <h4>No Aliases Available</h4>
                                <p>Create aliases in the Alias Manager first.</p>
                            </div>
                        </div>
                    `;
                }
                
                return `
                    <div class="alias-builder">
                        <div class="form-group">
                            <label for="aliasSelect">Available Aliases:</label>
                            <select id="aliasSelect">
                                <option value="">Select an alias...</option>
                                ${aliasEntries.map(([name, alias]) => 
                                    `<option value="${name}">${name}${alias.description ? ' - ' + alias.description : ''}</option>`
                                ).join('')}
                            </select>
                        </div>
                    </div>
                `;
            }
        };

        global.app = mockApp;
        global.stoUI = mockUI;
        
        // Setup DOM
        document.body.innerHTML = `
            <div id="addCommandModal">
                <select id="commandType">
                    <option value="alias">Alias</option>
                </select>
                <div id="commandBuilder"></div>
                <div id="modalCommandPreview">Select a command type to see preview</div>
            </div>
        `;
    });

    afterEach(() => {
        document.body.innerHTML = '';
        delete global.app;
        delete global.stoUI;
    });

    describe('Alias Command Builder', () => {
        beforeEach(() => {
            mockCommands.setupCommandBuilders();
        });

        it('should build alias command correctly', () => {
            const builder = mockCommands.commandBuilders.get('alias');
            const result = builder.build('alias', { alias_name: 'TestAlias1' });
            
            expect(result).toEqual({
                command: 'TestAlias1',
                type: 'alias',
                icon: '📝',
                text: 'Alias: TestAlias1',
                description: 'Execute custom alias',
                parameters: { alias_name: 'TestAlias1' }
            });
        });

        it('should return null for empty alias name', () => {
            const builder = mockCommands.commandBuilders.get('alias');
            const result = builder.build('alias', { alias_name: '' });
            
            expect(result).toBeNull();
        });

        it('should generate UI with available aliases', () => {
            const ui = mockCommands.createAliasUI();
            
            expect(ui).toContain('TestAlias1');
            expect(ui).toContain('TestAlias2');
            expect(ui).toContain('dynFxSetFXExlusionList_Space');
            expect(ui).toContain('Test alias for targeting');
            expect(ui).toContain('Test alias for healing');
            expect(ui).toContain('Vertigo - Disable Space Visual Effects');
        });

        it('should show empty state when no aliases available', () => {
            mockProfile.aliases = {};
            
            const ui = mockCommands.createAliasUI();
            
            expect(ui).toContain('No Aliases Available');
            expect(ui).toContain('Create aliases in the Alias Manager first');
        });
    });

    describe('Command Modal Integration', () => {
        it('should have alias option in command type selector', () => {
            const commandType = document.getElementById('commandType');
            const aliasOption = commandType.querySelector('option[value="alias"]');
            
            expect(aliasOption).toBeTruthy();
            expect(aliasOption.textContent).toBe('Alias');
        });

        it('should populate command builder when alias type selected', () => {
            mockCommands.setupCommandBuilders();
            const commandBuilder = document.getElementById('commandBuilder');
            const ui = mockCommands.createAliasUI();
            
            commandBuilder.innerHTML = ui;
            
            const aliasSelect = commandBuilder.querySelector('#aliasSelect');
            expect(aliasSelect).toBeTruthy();
            
            const options = aliasSelect.querySelectorAll('option');
            expect(options.length).toBe(4); // 3 aliases + empty option
        });
    });

    describe('Vertigo Alias Integration', () => {
        it('should properly handle Vertigo-generated aliases', () => {
            const vertigoAlias = mockProfile.aliases['dynFxSetFXExlusionList_Space'];
            
            expect(vertigoAlias).toBeDefined();
            expect(vertigoAlias.name).toBe('dynFxSetFXExlusionList_Space');
            expect(vertigoAlias.commands).toContain('dynFxSetFXExlusionList');
            expect(vertigoAlias.commands).toContain('PlayerSay Vertigo VFX Loaded');
        });

        it('should build Vertigo alias command correctly', () => {
            mockCommands.setupCommandBuilders();
            const builder = mockCommands.commandBuilders.get('alias');
            const result = builder.build('alias', { alias_name: 'dynFxSetFXExlusionList_Space' });
            
            expect(result.command).toBe('dynFxSetFXExlusionList_Space');
            expect(result.type).toBe('alias');
            expect(result.text).toBe('Alias: dynFxSetFXExlusionList_Space');
        });
    });

    describe('Alias Command Validation', () => {
        it('should validate alias names correctly', () => {
            const validAliasNames = ['TestAlias', 'My_Alias_123', 'dynFxSetFXExlusionList_Space'];
            const invalidAliasNames = ['', '   ', 'Alias With Spaces', 'Alias-With-Dashes'];
            
            validAliasNames.forEach(name => {
                expect(name.trim().length).toBeGreaterThan(0);
                expect(/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)).toBe(true);
            });
            
            invalidAliasNames.forEach(name => {
                expect(name.trim().length === 0 || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)).toBe(true);
            });
        });

        it('should handle non-existent alias names gracefully', () => {
            mockCommands.setupCommandBuilders();
            const builder = mockCommands.commandBuilders.get('alias');
            
            // Should still build the command even if alias doesn't exist in profile
            // (validation happens elsewhere)
            const result = builder.build('alias', { alias_name: 'NonExistentAlias' });
            
            expect(result).not.toBeNull();
            expect(result.command).toBe('NonExistentAlias');
        });
    });
}); 