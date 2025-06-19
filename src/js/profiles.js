// STO Tools Keybind Manager - Profile Management
// Handles profile creation, editing, and management operations

class STOProfileManager {
    constructor() {
        this.currentModal = null;
        // Don't initialize immediately - wait for app to be ready
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Profile dropdown change
        const profileSelect = document.getElementById('profileSelect');
        if (profileSelect) {
            profileSelect.addEventListener('change', (e) => {
                app.switchProfile(e.target.value);
            });
        }

        // Profile action buttons
        document.getElementById('newProfileBtn')?.addEventListener('click', () => {
            this.showNewProfileModal();
        });

        document.getElementById('cloneProfileBtn')?.addEventListener('click', () => {
            this.showCloneProfileModal();
        });

        document.getElementById('renameProfileBtn')?.addEventListener('click', () => {
            this.showRenameProfileModal();
        });

        document.getElementById('deleteProfileBtn')?.addEventListener('click', () => {
            this.confirmDeleteProfile();
        });

        // Profile modal save button
        document.getElementById('saveProfileBtn')?.addEventListener('click', () => {
            this.handleProfileSave();
        });

        // Settings dropdown
        document.getElementById('settingsBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleSettingsMenu();
        });

        // Keybinds dropdown
        document.getElementById('keybindsBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleKeybindsMenu();
        });

        // Aliases dropdown  
        document.getElementById('aliasesBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleAliasesMenu();
        });

        document.getElementById('importKeybindsBtn')?.addEventListener('click', () => {
            this.importKeybinds();
            this.closeKeybindsMenu();
        });

        document.getElementById('exportKeybindsBtn')?.addEventListener('click', () => {
            this.exportKeybinds();
            this.closeKeybindsMenu();
        });

        document.getElementById('importAliasesBtn')?.addEventListener('click', () => {
            this.importAliases();
            this.closeAliasesMenu();
        });

        document.getElementById('exportAliasesBtn')?.addEventListener('click', () => {
            this.exportAliases();
            this.closeAliasesMenu();
        });

        document.getElementById('loadDefaultDataBtn')?.addEventListener('click', () => {
            this.loadDefaultData();
            this.closeSettingsMenu();
        });

        document.getElementById('resetAppBtn')?.addEventListener('click', () => {
            this.confirmResetApp();
            this.closeSettingsMenu();
        });

        document.getElementById('aboutBtn')?.addEventListener('click', () => {
            stoUI.showModal('aboutModal');
        });

        // Close settings menu when clicking outside
        document.addEventListener('click', () => {
            this.closeSettingsMenu();
            this.closeKeybindsMenu();
            this.closeAliasesMenu();
        });
    }

    // Profile Modal Management
    showNewProfileModal() {
        const modal = document.getElementById('profileModal');
        const title = document.getElementById('profileModalTitle');
        const nameInput = document.getElementById('profileName');
        const descInput = document.getElementById('profileDescription');

        if (title) title.textContent = 'New Profile';
        if (nameInput) {
            nameInput.value = '';
            nameInput.placeholder = 'Enter profile name';
        }
        if (descInput) {
            descInput.value = '';
        }

        this.currentModal = 'new';
        stoUI.showModal('profileModal');
    }

    showCloneProfileModal() {
        const currentProfile = app.getCurrentProfile();
        if (!currentProfile) {
            stoUI.showToast('No profile selected to clone', 'warning');
            return;
        }

        const modal = document.getElementById('profileModal');
        const title = document.getElementById('profileModalTitle');
        const nameInput = document.getElementById('profileName');
        const descInput = document.getElementById('profileDescription');

        if (title) title.textContent = 'Clone Profile';
        if (nameInput) {
            nameInput.value = `${currentProfile.name} Copy`;
            nameInput.placeholder = 'Enter new profile name';
        }
        if (descInput) {
            descInput.value = `Copy of ${currentProfile.name}`;
        }

        this.currentModal = 'clone';
        stoUI.showModal('profileModal');
    }

    showRenameProfileModal() {
        const currentProfile = app.getCurrentProfile();
        if (!currentProfile) {
            stoUI.showToast('No profile selected to rename', 'warning');
            return;
        }

        const modal = document.getElementById('profileModal');
        const title = document.getElementById('profileModalTitle');
        const nameInput = document.getElementById('profileName');
        const descInput = document.getElementById('profileDescription');

        if (title) title.textContent = 'Rename Profile';
        if (nameInput) {
            nameInput.value = currentProfile.name;
            nameInput.placeholder = 'Enter profile name';
        }
        if (descInput) {
            descInput.value = currentProfile.description || '';
        }

        this.currentModal = 'rename';
        stoUI.showModal('profileModal');
    }

    handleProfileSave() {
        const nameInput = document.getElementById('profileName');
        const descInput = document.getElementById('profileDescription');

        if (!nameInput) return;

        const name = nameInput.value.trim();
        const description = descInput?.value.trim() || '';

        if (!name) {
            stoUI.showToast('Profile name is required', 'error');
            nameInput.focus();
            return;
        }

        if (name.length > 50) {
            stoUI.showToast('Profile name is too long (max 50 characters)', 'error');
            nameInput.focus();
            return;
        }

        // Check for duplicate names (except when renaming current profile)
        const data = stoStorage.getAllData();
        const existingProfile = Object.values(data.profiles).find(p => 
            p.name.toLowerCase() === name.toLowerCase() && 
            (this.currentModal !== 'rename' || p.name !== app.getCurrentProfile()?.name)
        );

        if (existingProfile) {
            stoUI.showToast('A profile with this name already exists', 'error');
            nameInput.focus();
            return;
        }

        try {
            switch (this.currentModal) {
                case 'new':
                    this.createNewProfile(name, description);
                    break;
                case 'clone':
                    this.cloneCurrentProfile(name, description);
                    break;
                case 'rename':
                    this.renameCurrentProfile(name, description);
                    break;
            }

            stoUI.hideModal('profileModal');
            this.currentModal = null;
        } catch (error) {
            stoUI.showToast('Failed to save profile: ' + error.message, 'error');
        }
    }

    createNewProfile(name, description) {
        const profileId = app.generateProfileId(name);
        const profile = {
            name,
            description,
            mode: 'space',
            keys: {},
            aliases: {},
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        if (stoStorage.saveProfile(profileId, profile)) {
            app.switchProfile(profileId);
            app.renderProfiles();
            stoUI.showToast(`Profile "${name}" created`, 'success');
        } else {
            throw new Error('Failed to save profile');
        }
    }

    cloneCurrentProfile(name, description) {
        const currentProfile = app.getCurrentProfile();
        if (!currentProfile) {
            throw new Error('No profile to clone');
        }

        const profileId = app.generateProfileId(name);
        const clonedProfile = {
            ...JSON.parse(JSON.stringify(currentProfile)), // Deep clone
            name,
            description,
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        if (stoStorage.saveProfile(profileId, clonedProfile)) {
            app.switchProfile(profileId);
            app.renderProfiles();
            stoUI.showToast(`Profile "${name}" created from "${currentProfile.name}"`, 'success');
        } else {
            throw new Error('Failed to save cloned profile');
        }
    }

    renameCurrentProfile(name, description) {
        const currentProfile = app.getCurrentProfile();
        if (!currentProfile) {
            throw new Error('No profile to rename');
        }

        const oldName = currentProfile.name;
        currentProfile.name = name;
        currentProfile.description = description;
        currentProfile.lastModified = new Date().toISOString();

        if (stoStorage.saveProfile(app.currentProfile, currentProfile)) {
            app.renderProfiles();
            app.setModified(true);
            stoUI.showToast(`Profile renamed from "${oldName}" to "${name}"`, 'success');
        } else {
            throw new Error('Failed to save renamed profile');
        }
    }

    async confirmDeleteProfile() {
        const currentProfile = app.getCurrentProfile();
        if (!currentProfile) {
            stoUI.showToast('No profile selected to delete', 'warning');
            return;
        }

        const data = stoStorage.getAllData();
        const profileCount = Object.keys(data.profiles).length;

        if (profileCount <= 1) {
            stoUI.showToast('Cannot delete the last profile', 'warning');
            return;
        }

        const confirmed = await stoUI.confirm(
            `Are you sure you want to delete the profile "${currentProfile.name}"?\n\nThis action cannot be undone.`,
            'Delete Profile',
            'danger'
        );

        if (confirmed) {
            this.deleteCurrentProfile();
        }
    }

    deleteCurrentProfile() {
        const currentProfile = app.getCurrentProfile();
        if (!currentProfile) return;

        const profileName = currentProfile.name;
        
        if (app.deleteProfile(app.currentProfile)) {
            stoUI.showToast(`Profile "${profileName}" deleted`, 'success');
        } else {
            stoUI.showToast('Failed to delete profile', 'error');
        }
    }

    // Settings Menu Management
    toggleSettingsMenu() {
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            const dropdown = settingsBtn.closest('.dropdown');
        if (dropdown) {
            dropdown.classList.toggle('active');
            }
        }
    }

    closeSettingsMenu() {
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            const dropdown = settingsBtn.closest('.dropdown');
        if (dropdown) {
            dropdown.classList.remove('active');
            }
        }
    }

    // Keybinds Menu Management
    toggleKeybindsMenu() {
        // Close other dropdowns first
        this.closeSettingsMenu();
        this.closeAliasesMenu();
        
        const keybindsBtn = document.getElementById('keybindsBtn');
        if (keybindsBtn) {
            const dropdown = keybindsBtn.closest('.dropdown');
            if (dropdown) {
                dropdown.classList.toggle('active');
            }
        }
    }

    closeKeybindsMenu() {
        const keybindsBtn = document.getElementById('keybindsBtn');
        if (keybindsBtn) {
            const dropdown = keybindsBtn.closest('.dropdown');
            if (dropdown) {
                dropdown.classList.remove('active');
            }
        }
    }

    // Aliases Menu Management
    toggleAliasesMenu() {
        // Close other dropdowns first
        this.closeSettingsMenu();
        this.closeKeybindsMenu();
        
        const aliasesBtn = document.getElementById('aliasesBtn');
        if (aliasesBtn) {
            const dropdown = aliasesBtn.closest('.dropdown');
            if (dropdown) {
                dropdown.classList.toggle('active');
            }
        }
    }

    closeAliasesMenu() {
        const aliasesBtn = document.getElementById('aliasesBtn');
        if (aliasesBtn) {
            const dropdown = aliasesBtn.closest('.dropdown');
            if (dropdown) {
                dropdown.classList.remove('active');
            }
        }
    }

    // Import/Export Operations
    importKeybinds() {
        const input = document.getElementById('fileInput');
        if (input) {
            input.accept = '.txt';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        try {
                            stoKeybinds.importKeybindFile(e.target.result);
                        } catch (error) {
                            stoUI.showToast('Failed to import keybind file: ' + error.message, 'error');
                        }
                    };
                    reader.readAsText(file);
                }
                // Reset file input
                e.target.value = '';
            };
            input.click();
        }
    }

    exportKeybinds() {
        const profile = app.getCurrentProfile();
        if (!profile) {
            stoUI.showToast('No profile selected to export', 'warning');
            return;
        }

        if (!profile.keys || Object.keys(profile.keys).length === 0) {
            stoUI.showToast('No keybinds to export', 'warning');
            return;
        }

        stoExport.exportSTOKeybindFile(profile);
    }

    importAliases() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const content = e.target.result;
                        stoKeybinds.importAliasFile(content);
                        
                        // Refresh alias manager if open
                        if (window.stoAliases && typeof window.stoAliases.renderAliasList === 'function') {
                            window.stoAliases.renderAliasList();
                        }
                    } catch (error) {
                        stoUI.showToast('Failed to import aliases: ' + error.message, 'error');
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    }

    exportAliases() {
        const profile = app.getCurrentProfile();
        if (!profile) {
            stoUI.showToast('No profile selected to export', 'warning');
            return;
        }

        if (!profile.aliases || Object.keys(profile.aliases).length === 0) {
            stoUI.showToast('No aliases to export', 'warning');
            return;
        }

        stoExport.exportAliases(profile);
    }

    async confirmResetApp() {
        const confirmed = await stoUI.confirm(
            'Are you sure you want to reset the application?\n\nThis will delete all profiles, keybinds, and settings. This action cannot be undone.',
            'Reset Application',
            'danger'
        );

        if (confirmed) {
            this.resetApplication();
        }
    }

    resetApplication() {
        try {
            // Clear all data
            stoStorage.clearAllData();
            
            // Reinitialize app with empty data instead of reloading
            app.currentProfile = null;
            app.selectedKey = null;
            app.setModified(false);
            
            // Re-render UI with empty state
            app.renderProfiles();
            app.renderKeyGrid();
            app.renderCommandChain();
            app.updateProfileInfo();
            
            stoUI.showToast('Application reset successfully. All data cleared.', 'success');
        } catch (error) {
            stoUI.showToast('Failed to reset application: ' + error.message, 'error');
        }
    }

    // Load default/demo data
    loadDefaultData() {
        try {
            if (stoStorage.loadDefaultData()) {
                // Reinitialize app with default data
                const data = stoStorage.getAllData();
                app.currentProfile = data.currentProfile;
                app.selectedKey = null;
                app.setModified(false);
                
                // Re-render UI with default data
                app.renderProfiles();
                app.renderKeyGrid();
                app.renderCommandChain();
                app.updateProfileInfo();
                
                stoUI.showToast('Default demo data loaded successfully', 'success');
            } else {
                stoUI.showToast('Failed to load default data', 'error');
            }
        } catch (error) {
            stoUI.showToast('Failed to load default data: ' + error.message, 'error');
        }
    }

    // Profile Statistics and Analysis
    getProfileAnalysis(profile) {
        const analysis = {
            keyCount: Object.keys(profile.keys).length,
            commandCount: 0,
            aliasCount: Object.keys(profile.aliases || {}).length,
            commandTypes: {},
            keyTypes: {
                function: 0,
                number: 0,
                letter: 0,
                special: 0,
                modifier: 0
            },
            complexity: 'Simple',
            recommendations: []
        };

        // Analyze keys and commands
        Object.entries(profile.keys).forEach(([key, commands]) => {
            analysis.commandCount += commands.length;

            // Categorize key types
            if (/^F\d+$/.test(key)) {
                analysis.keyTypes.function++;
            } else if (/^\d+$/.test(key)) {
                analysis.keyTypes.number++;
            } else if (/^[A-Z]$/.test(key)) {
                analysis.keyTypes.letter++;
            } else if (key.includes('+')) {
                analysis.keyTypes.modifier++;
            } else {
                analysis.keyTypes.special++;
            }

            // Count command types
            commands.forEach(command => {
                analysis.commandTypes[command.type] = (analysis.commandTypes[command.type] || 0) + 1;
            });
        });

        // Determine complexity
        if (analysis.commandCount > 50) {
            analysis.complexity = 'Complex';
        } else if (analysis.commandCount > 20) {
            analysis.complexity = 'Moderate';
        }

        // Generate recommendations
        this.generateRecommendations(analysis, profile);

        return analysis;
    }

    generateRecommendations(analysis, profile) {
        const recommendations = [];

        // Check for basic combat setup
        if (!analysis.commandTypes.targeting && !analysis.commandTypes.combat) {
            recommendations.push({
                type: 'setup',
                title: 'Add Basic Combat Commands',
                description: 'Consider adding targeting and firing commands for basic combat functionality.',
                priority: 'high'
            });
        }

        // Check for defensive abilities
        if (!analysis.commandTypes.power) {
            recommendations.push({
                type: 'defensive',
                title: 'Add Defensive Abilities',
                description: 'Add shield management commands like shield distribution and shield routing.',
                priority: 'medium'
            });
        }

        // Check for key efficiency
        if (analysis.keyTypes.modifier < 3 && analysis.keyCount > 10) {
            recommendations.push({
                type: 'efficiency',
                title: 'Use Modifier Keys',
                description: 'Consider using Ctrl+, Alt+, and Shift+ combinations to access more commands efficiently.',
                priority: 'low'
            });
        }

        // Check for aliases
        if (analysis.aliasCount === 0 && analysis.commandCount > 15) {
            recommendations.push({
                type: 'organization',
                title: 'Create Command Aliases',
                description: 'Use aliases to group related commands and simplify complex sequences.',
                priority: 'medium'
            });
        }

        // Check for space vs ground mode appropriateness
        const spaceCommands = ['FireAll', 'target_nearest_enemy', '+fullimpulse'];
        const hasSpaceCommands = Object.values(profile.keys).some(commands =>
            commands.some(cmd => spaceCommands.some(sc => cmd.command.includes(sc)))
        );

        if (profile.mode === 'ground' && hasSpaceCommands) {
            recommendations.push({
                type: 'mode',
                title: 'Check Profile Mode',
                description: 'This profile contains space combat commands but is set to ground mode.',
                priority: 'medium'
            });
        }

        analysis.recommendations = recommendations;
    }

    // Profile Templates
    getProfileTemplates() {
        return {
            basic_space: {
                name: 'Basic Space Combat',
                description: 'Essential space combat keybinds for new players',
                mode: 'space',
                keys: {
                    'Space': [
                        { command: 'target_nearest_enemy', type: 'targeting', icon: '🎯', text: 'Target nearest enemy' },
                        { command: 'FireAll', type: 'combat', icon: '🔥', text: 'Fire all weapons' }
                    ],
                    'Tab': [
                        { command: 'target_nearest_friend', type: 'targeting', icon: '🤝', text: 'Target nearest friend' }
                    ],
                    'F1': [
                        { command: 'target_self', type: 'targeting', icon: '👤', text: 'Target self' },
                        { command: '+power_exec Distribute_Shields', type: 'power', icon: '🛡️', text: 'Distribute shields' }
                    ]
                },
                aliases: {}
            },
            
            advanced_tactical: {
                name: 'Advanced Tactical',
                description: 'Comprehensive DPS-focused space build',
                mode: 'space',
                keys: {
                    'Space': [
                        { command: 'target_nearest_enemy', type: 'targeting', icon: '🎯', text: 'Target nearest enemy' },
                        { command: '+STOTrayExecByTray 0 0', type: 'tray', icon: '⚡', text: 'Execute Tray 1 Slot 1' },
                        { command: 'FireAll', type: 'combat', icon: '🔥', text: 'Fire all weapons' }
                    ],
                    '1': [
                        { command: '+STOTrayExecByTray 1 0', type: 'tray', icon: '⚡', text: 'Execute Tray 2 Slot 1' }
                    ],
                    '2': [
                        { command: '+STOTrayExecByTray 1 1', type: 'tray', icon: '⚡', text: 'Execute Tray 2 Slot 2' }
                    ],
                    'F1': [
                        { command: 'target_self', type: 'targeting', icon: '👤', text: 'Target self' },
                    ],
                    'F2': [
                        { command: 'target_self', type: 'targeting', icon: '👤', text: 'Target self' },
                    ]
                },
                aliases: {
                    'AlphaStrike': {
                        name: 'AlphaStrike',
                        commands: 'target_nearest_enemy $$ +STOTrayExecByTray 0 0 $$ +STOTrayExecByTray 0 1',
                        description: 'Full alpha strike sequence'
                    }
                }
            },

            ground_combat: {
                name: 'Ground Combat',
                description: 'Ground combat and away team keybinds',
                mode: 'ground',
                keys: {
                    'Space': [
                        { command: 'target_nearest_enemy', type: 'targeting', icon: '🎯', text: 'Target nearest enemy' },
                        { command: '+STOTrayExecByTray 0 0', type: 'tray', icon: '⚡', text: 'Primary attack' }
                    ],
                    '1': [
                        { command: '+STOTrayExecByTray 0 1', type: 'tray', icon: '⚡', text: 'Secondary attack' }
                    ],
                    '2': [
                        { command: '+STOTrayExecByTray 0 2', type: 'tray', icon: '⚡', text: 'Kit ability 1' }
                    ],
                    'F1': [
                        { command: 'target_self', type: 'targeting', icon: '👤', text: 'Target self' },
                        { command: '+STOTrayExecByTray 1 0', type: 'tray', icon: '💊', text: 'Heal self' }
                    ]
                },
                aliases: {}
            }
        };
    }

    createProfileFromTemplate(templateId) {
        const templates = this.getProfileTemplates();
        const template = templates[templateId];
        
        if (!template) {
            stoUI.showToast('Template not found', 'error');
            return;
        }

        // Generate unique profile name
        let profileName = template.name;
        let counter = 1;
        const data = stoStorage.getAllData();
        
        while (Object.values(data.profiles).some(p => p.name === profileName)) {
            profileName = `${template.name} ${counter}`;
            counter++;
        }

        // Create profile
        const profileId = app.generateProfileId(profileName);
        const profile = {
            ...template,
            name: profileName,
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };

        // Add IDs to commands
        Object.values(profile.keys).forEach(commands => {
            commands.forEach(command => {
                command.id = app.generateCommandId();
            });
        });

        if (stoStorage.saveProfile(profileId, profile)) {
            app.switchProfile(profileId);
            app.renderProfiles();
            stoUI.showToast(`Profile "${profileName}" created from template`, 'success');
        } else {
            stoUI.showToast('Failed to create profile from template', 'error');
        }
    }

    // Profile Export/Import
    exportProfile(profileId) {
        const profile = stoStorage.getProfile(profileId);
        if (!profile) {
            stoUI.showToast('Profile not found', 'error');
            return;
        }

        const exportData = {
            version: '1.0.0',
            exported: new Date().toISOString(),
            profile: profile
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${profile.name.replace(/[^a-zA-Z0-9]/g, '_')}_profile.json`;
        a.click();
        URL.revokeObjectURL(url);

        stoUI.showToast(`Profile "${profile.name}" exported`, 'success');
    }

    async importProfile(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            
            if (!data.profile) {
                throw new Error('Invalid profile file format');
            }

            const profile = data.profile;
            
            // Generate unique profile name
            let profileName = profile.name;
            let counter = 1;
            const existingData = stoStorage.getAllData();
            
            while (Object.values(existingData.profiles).some(p => p.name === profileName)) {
                profileName = `${profile.name} (${counter})`;
                counter++;
            }

            profile.name = profileName;
            profile.imported = new Date().toISOString();
            profile.lastModified = new Date().toISOString();

            const profileId = app.generateProfileId(profileName);
            
            if (stoStorage.saveProfile(profileId, profile)) {
                app.renderProfiles();
                stoUI.showToast(`Profile "${profileName}" imported successfully`, 'success');
                return true;
            } else {
                throw new Error('Failed to save imported profile');
            }
        } catch (error) {
            stoUI.showToast('Failed to import profile: ' + error.message, 'error');
            return false;
        }
    }
}

// Global profile manager instance
window.stoProfiles = new STOProfileManager(); 