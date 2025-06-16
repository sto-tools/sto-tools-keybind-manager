// STO Tools Keybind Manager - Alias Management
// Handles command alias creation, editing, and management

class STOAliasManager {
    constructor() {
        this.currentAlias = null;
        // Don't initialize immediately - wait for app to be ready
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Alias manager button
        document.getElementById('addAliasBtn')?.addEventListener('click', () => {
            this.showAliasManager();
        });

        // New alias button
        document.getElementById('newAliasBtn')?.addEventListener('click', () => {
            this.showEditAliasModal();
        });

        // Save alias button
        document.getElementById('saveAliasBtn')?.addEventListener('click', () => {
            this.saveAlias();
        });

        // Alias input changes for live preview
        document.addEventListener('input', (e) => {
            if (['aliasName', 'aliasCommands', 'aliasDescription'].includes(e.target.id)) {
                this.updateAliasPreview();
            }
        });
    }

    // Alias Manager Modal
    showAliasManager() {
        this.renderAliasList();
        stoUI.showModal('aliasManagerModal');
    }

    renderAliasList() {
        const container = document.getElementById('aliasList');
        if (!container) return;

        const profile = app.getCurrentProfile();
        if (!profile || !profile.aliases) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-mask"></i>
                    <h4>No Aliases</h4>
                    <p>Create command aliases to simplify complex command sequences.</p>
                </div>
            `;
            return;
        }

        const aliases = Object.entries(profile.aliases);
        
        if (aliases.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-mask"></i>
                    <h4>No Aliases</h4>
                    <p>Create command aliases to simplify complex command sequences.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="alias-grid">
                ${aliases.map(([name, alias]) => this.createAliasCard(name, alias)).join('')}
            </div>
        `;

        // Add event listeners to alias cards
        container.querySelectorAll('.alias-card').forEach(card => {
            const aliasName = card.dataset.alias;
            
            card.querySelector('.edit-alias-btn')?.addEventListener('click', () => {
                this.editAlias(aliasName);
            });
            
            card.querySelector('.delete-alias-btn')?.addEventListener('click', () => {
                this.confirmDeleteAlias(aliasName);
            });
            
            card.querySelector('.use-alias-btn')?.addEventListener('click', () => {
                this.useAlias(aliasName);
            });
        });
    }

    createAliasCard(name, alias) {
        const commandPreview = alias.commands.length > 60 
            ? alias.commands.substring(0, 60) + '...' 
            : alias.commands;

        return `
            <div class="alias-card" data-alias="${name}">
                <div class="alias-header">
                    <h4>${name}</h4>
                    <div class="alias-actions">
                        <button class="btn btn-small-icon edit-alias-btn" title="Edit Alias">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-small-icon use-alias-btn" title="Add to Current Key">
                            <i class="fas fa-plus"></i>
                        </button>
                        <button class="btn btn-small-icon btn-danger delete-alias-btn" title="Delete Alias">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="alias-description">
                    ${alias.description || 'No description'}
                </div>
                <div class="alias-commands">
                    <code>${commandPreview}</code>
                </div>
                <div class="alias-usage">
                    Usage: <code>${name}</code>
                </div>
            </div>
        `;
    }

    // Edit Alias Modal
    showEditAliasModal(aliasName = null) {
        const title = document.getElementById('editAliasTitle');
        const nameInput = document.getElementById('aliasName');
        const descInput = document.getElementById('aliasDescription');
        const commandsInput = document.getElementById('aliasCommands');

        if (aliasName) {
            // Editing existing alias
            const profile = app.getCurrentProfile();
            const alias = profile.aliases[aliasName];
            
            if (title) title.textContent = 'Edit Alias';
            if (nameInput) {
                nameInput.value = aliasName;
                nameInput.disabled = true; // Can't change alias name
            }
            if (descInput) descInput.value = alias.description || '';
            if (commandsInput) commandsInput.value = alias.commands;
            
            this.currentAlias = aliasName;
        } else {
            // Creating new alias
            if (title) title.textContent = 'New Alias';
            if (nameInput) {
                nameInput.value = '';
                nameInput.disabled = false;
            }
            if (descInput) descInput.value = '';
            if (commandsInput) commandsInput.value = '';
            
            this.currentAlias = null;
        }

        this.updateAliasPreview();
        stoUI.hideModal('aliasManagerModal');
        stoUI.showModal('editAliasModal');
    }

    editAlias(aliasName) {
        this.showEditAliasModal(aliasName);
    }

    async confirmDeleteAlias(aliasName) {
        const confirmed = await stoUI.confirm(
            `Are you sure you want to delete the alias "${aliasName}"?`,
            'Delete Alias',
            'danger'
        );

        if (confirmed) {
            this.deleteAlias(aliasName);
        }
    }

    deleteAlias(aliasName) {
        const profile = app.getCurrentProfile();
        if (profile && profile.aliases && profile.aliases[aliasName]) {
            delete profile.aliases[aliasName];
            app.saveProfile();
            app.setModified(true);
            
            this.renderAliasList();
            this.updateCommandLibrary();
            
            stoUI.showToast(`Alias "${aliasName}" deleted`, 'success');
        }
    }

    useAlias(aliasName) {
        if (!app.selectedKey) {
            stoUI.showToast('Please select a key first', 'warning');
            return;
        }

        const command = {
            command: aliasName,
            type: 'alias',
            icon: '🎭',
            text: `Alias: ${aliasName}`,
            id: app.generateCommandId()
        };

        app.addCommand(app.selectedKey, command);
        stoUI.hideModal('aliasManagerModal');
        stoUI.showToast(`Alias "${aliasName}" added to ${app.selectedKey}`, 'success');
    }

    // Save Alias
    saveAlias() {
        const nameInput = document.getElementById('aliasName');
        const descInput = document.getElementById('aliasDescription');
        const commandsInput = document.getElementById('aliasCommands');

        if (!nameInput || !commandsInput) return;

        const name = nameInput.value.trim();
        const description = descInput?.value.trim() || '';
        const commands = commandsInput.value.trim();

        // Validation
        const validation = this.validateAlias(name, commands);
        if (!validation.valid) {
            stoUI.showToast(validation.error, 'error');
            return;
        }

        const profile = app.getCurrentProfile();
        if (!profile) {
            stoUI.showToast('No active profile', 'error');
            return;
        }

        // Initialize aliases object if it doesn't exist
        if (!profile.aliases) {
            profile.aliases = {};
        }

        // Check for duplicate names (only when creating new alias)
        if (!this.currentAlias && profile.aliases[name]) {
            stoUI.showToast('An alias with this name already exists', 'error');
            nameInput.focus();
            return;
        }

        // Save alias
        profile.aliases[name] = {
            name: name,
            description: description,
            commands: commands,
            created: this.currentAlias ? profile.aliases[name]?.created : new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        app.saveProfile();
        app.setModified(true);

        // Update UI
        this.updateCommandLibrary();
        
        const action = this.currentAlias ? 'updated' : 'created';
        stoUI.showToast(`Alias "${name}" ${action}`, 'success');
        
        stoUI.hideModal('editAliasModal');
        this.showAliasManager();
    }

    validateAlias(name, commands) {
        // Validate name
        if (!name) {
            return { valid: false, error: 'Alias name is required' };
        }

        if (!STO_DATA.validation.aliasNamePattern.test(name)) {
            return { valid: false, error: 'Invalid alias name. Use only letters, numbers, and underscores. Must start with a letter.' };
        }

        if (name.length > 30) {
            return { valid: false, error: 'Alias name is too long (max 30 characters)' };
        }

        // Check for reserved names
        const reservedNames = ['alias', 'bind', 'unbind', 'bind_load_file', 'bind_save_file'];
        if (reservedNames.includes(name.toLowerCase())) {
            return { valid: false, error: 'This is a reserved command name' };
        }

        // Validate commands
        if (!commands) {
            return { valid: false, error: 'Commands are required' };
        }

        if (commands.length > 500) {
            return { valid: false, error: 'Command sequence is too long (max 500 characters)' };
        }

        // Check for circular references (only if app is available)
        if (typeof app !== 'undefined' && app.getCurrentProfile) {
            const profile = app.getCurrentProfile();
            if (profile && profile.aliases) {
                const aliasNames = Object.keys(profile.aliases);
                if (aliasNames.some(aliasName => commands.includes(aliasName) && aliasName !== name)) {
                    // This is a simplified check - a more thorough check would trace the full dependency graph
                    return { valid: false, error: 'Potential circular reference detected' };
                }
            }
        }

        return { valid: true };
    }

    updateAliasPreview() {
        const preview = document.getElementById('aliasPreview');
        const nameInput = document.getElementById('aliasName');
        const commandsInput = document.getElementById('aliasCommands');

        if (!preview || !nameInput || !commandsInput) return;

        const name = nameInput.value.trim() || 'AliasName';
        const commands = commandsInput.value.trim() || 'command sequence';

        preview.textContent = `alias ${name} "${commands}"`;
    }

    // Command Library Integration
    updateCommandLibrary() {
        const profile = app.getCurrentProfile();
        if (!profile || !profile.aliases) return;

        // Find or create aliases category in command library
        const categories = document.getElementById('commandCategories');
        if (!categories) return;

        // Remove existing alias category
        const existingAliasCategory = categories.querySelector('[data-category="aliases"]');
        if (existingAliasCategory) {
            existingAliasCategory.remove();
        }

        // Add aliases category if there are aliases
        const aliases = Object.entries(profile.aliases);
        if (aliases.length > 0) {
            const aliasCategory = this.createAliasCategoryElement(aliases);
            categories.appendChild(aliasCategory);
        }
    }

    createAliasCategoryElement(aliases) {
        const element = document.createElement('div');
        element.className = 'category';
        element.dataset.category = 'aliases';
        
        element.innerHTML = `
            <h4><i class="fas fa-mask"></i> Command Aliases</h4>
            <div class="category-commands">
                ${aliases.map(([name, alias]) => `
                    <div class="command-item alias-item" data-alias="${name}" title="${alias.description || alias.commands}">
                        🎭 ${name}
                    </div>
                `).join('')}
            </div>
        `;
        
        // Add click handlers for aliases
        element.addEventListener('click', (e) => {
            if (e.target.classList.contains('alias-item')) {
                const aliasName = e.target.dataset.alias;
                this.addAliasToKey(aliasName);
            }
        });
        
        return element;
    }

    addAliasToKey(aliasName) {
        if (!app.selectedKey) {
            stoUI.showToast('Please select a key first', 'warning');
            return;
        }

        const profile = app.getCurrentProfile();
        const alias = profile.aliases[aliasName];
        
        if (!alias) {
            stoUI.showToast('Alias not found', 'error');
            return;
        }

        const command = {
            command: aliasName,
            type: 'alias',
            icon: '🎭',
            text: `Alias: ${aliasName}`,
            description: alias.description,
            id: app.generateCommandId()
        };

        app.addCommand(app.selectedKey, command);
    }

    // Alias Templates
    getAliasTemplates() {
        return {
            space_combat: {
                name: 'Space Combat',
                description: 'Aliases for space combat scenarios',
                templates: {
                    'AttackRun': {
                        name: 'AttackRun',
                        description: 'Full attack sequence with targeting',
                        commands: 'target_nearest_enemy $$ +power_exec Attack_Pattern_Alpha $$ FireAll'
                    },
                    'DefensiveMode': {
                        name: 'DefensiveMode',
                        description: 'Defensive abilities and shield management',
                        commands: 'target_self $$ +power_exec Tactical_Team $$ +power_exec Distribute_Shields $$ +power_exec Emergency_Power_to_Shields'
                    },
                    'HealSelf': {
                        name: 'HealSelf',
                        description: 'Self-healing sequence',
                        commands: 'target_self $$ +power_exec Engineering_Team $$ +power_exec Science_Team'
                    },
                    'AlphaStrike': {
                        name: 'AlphaStrike',
                        description: 'Maximum damage alpha strike',
                        commands: 'target_nearest_enemy $$ +power_exec Attack_Pattern_Alpha $$ +power_exec Emergency_Power_to_Weapons $$ +power_exec Tactical_Team $$ FireAll'
                    }
                }
            },
            ground_combat: {
                name: 'Ground Combat',
                description: 'Aliases for ground combat scenarios',
                templates: {
                    'GroundAttack': {
                        name: 'GroundAttack',
                        description: 'Basic ground combat sequence',
                        commands: 'target_nearest_enemy $$ +STOTrayExecByTray 0 0 $$ +STOTrayExecByTray 0 1'
                    },
                    'GroundHeal': {
                        name: 'GroundHeal',
                        description: 'Ground healing sequence',
                        commands: 'target_self $$ +STOTrayExecByTray 1 0 $$ +STOTrayExecByTray 1 1'
                    }
                }
            },
            communication: {
                name: 'Communication',
                description: 'Aliases for team communication',
                templates: {
                    'TeamReady': {
                        name: 'TeamReady',
                        description: 'Announce ready status to team',
                        commands: 'team "Ready!"'
                    },
                    'NeedHealing': {
                        name: 'NeedHealing',
                        description: 'Request healing from team',
                        commands: 'team "Need healing!"'
                    },
                    'Incoming': {
                        name: 'Incoming',
                        description: 'Warn team of incoming enemies',
                        commands: 'team "Incoming enemies!"'
                    }
                }
            }
        };
    }

    createAliasFromTemplate(category, templateId) {
        const templates = this.getAliasTemplates();
        const template = templates[category]?.templates?.[templateId];
        
        if (!template) {
            stoUI.showToast('Template not found', 'error');
            return;
        }

        // Check if alias already exists
        const profile = app.getCurrentProfile();
        if (profile.aliases && profile.aliases[template.name]) {
            stoUI.showToast(`Alias "${template.name}" already exists`, 'warning');
            return;
        }

        // Create alias
        if (!profile.aliases) {
            profile.aliases = {};
        }

        profile.aliases[template.name] = {
            ...template,
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        app.saveProfile();
        app.setModified(true);
        
        this.updateCommandLibrary();
        this.renderAliasList();
        
        stoUI.showToast(`Alias "${template.name}" created from template`, 'success');
    }

    // Utility Methods
    exportAliases() {
        const profile = app.getCurrentProfile();
        if (!profile || !profile.aliases || Object.keys(profile.aliases).length === 0) {
            stoUI.showToast('No aliases to export', 'warning');
            return;
        }

        let output = `# Command Aliases for ${profile.name}\n`;
        output += `# Generated by STO Tools Keybind Manager\n`;
        output += `# ${new Date().toLocaleString()}\n\n`;

        Object.entries(profile.aliases).forEach(([name, alias]) => {
            if (alias.description) {
                output += `# ${alias.description}\n`;
            }
            output += `alias ${name} "${alias.commands}"\n\n`;
        });

        const blob = new Blob([output], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${profile.name.replace(/[^a-zA-Z0-9]/g, '_')}_aliases.txt`;
        a.click();
        URL.revokeObjectURL(url);

        stoUI.showToast('Aliases exported successfully', 'success');
    }

    getAliasUsage(aliasName) {
        const profile = app.getCurrentProfile();
        if (!profile) return [];

        const usage = [];
        
        // Check in keybinds
        Object.entries(profile.keys).forEach(([key, commands]) => {
            commands.forEach((command, index) => {
                if (command.command === aliasName || command.command.includes(aliasName)) {
                    usage.push({
                        type: 'keybind',
                        key: key,
                        position: index + 1,
                        context: `Key "${key}", command ${index + 1}`
                    });
                }
            });
        });

        // Check in other aliases
        Object.entries(profile.aliases || {}).forEach(([name, alias]) => {
            if (name !== aliasName && alias.commands.includes(aliasName)) {
                usage.push({
                    type: 'alias',
                    alias: name,
                    context: `Alias "${name}"`
                });
            }
        });

        return usage;
    }
}

// Global alias manager instance
window.stoAliases = new STOAliasManager(); 