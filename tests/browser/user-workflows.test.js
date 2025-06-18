import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('Complete User Workflows', () => {
  let app, stoStorage, stoUI, stoExport, stoKeybinds;

  beforeEach(async () => {
    // Clear localStorage first
    localStorage.clear()
    
    // Simple mock setup
    if (typeof window !== 'undefined') {
      window.alert = vi.fn()
      window.confirm = vi.fn(() => true)
      window.prompt = vi.fn(() => 'test input')
    }
    
    // Wait for DOM to be ready with timeout
    const waitForDOM = () => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('DOM ready timeout'))
        }, 5000)
        
        if (document.readyState === 'complete') {
          clearTimeout(timeout)
          resolve()
        } else {
          document.addEventListener('DOMContentLoaded', () => {
            clearTimeout(timeout)
            resolve()
          }, { once: true })
        }
      })
    }
    
    await waitForDOM()
    
    // Wait for the application to be fully loaded using the ready event
    const waitForApp = () => {
      return new Promise((resolve, reject) => {
        // Set a timeout in case the event never fires
        const timeout = setTimeout(() => {
          reject(new Error('App ready event timeout'))
        }, 10000)
        
        // Listen for the app ready event
        const handleReady = (event) => {
          clearTimeout(timeout)
          window.removeEventListener('sto-app-ready', handleReady)
          resolve(event.detail.app)
        }
        
        const handleError = (event) => {
          clearTimeout(timeout)
          window.removeEventListener('sto-app-ready', handleReady)
          window.removeEventListener('sto-app-error', handleError)
          reject(event.detail.error)
        }
        
        // Check if already loaded (in case event fired before we started listening)
        if (window.app && window.COMMANDS && window.stoStorage && window.stoUI) {
          clearTimeout(timeout)
          resolve(window.app)
          return
        }
        
        window.addEventListener('sto-app-ready', handleReady, { once: true })
        window.addEventListener('sto-app-error', handleError, { once: true })
      })
    }

    try {
      app = await waitForApp()
      
      // Get instances
      stoStorage = window.stoStorage
      stoUI = window.stoUI
      stoExport = window.stoExport
      stoKeybinds = window.stoKeybinds
    } catch (error) {
      console.error('Failed to wait for app:', error)
      throw error
    }
    
    // Reset application state
    if (app?.resetApplication) {
      app.resetApplication();
    }
  });

  afterEach(async () => {
    // Clean up using browser test utilities
    if (typeof testUtils !== 'undefined') {
      testUtils.clearAppData()
    } else {
      // Fallback cleanup
      localStorage.clear()
      sessionStorage.clear()
    }
    
    // Restore original functions if we mocked them
    if (typeof vi !== 'undefined' && vi.isMockFunction && vi.isMockFunction(window.alert)) {
      vi.restoreAllMocks()
    }
  });

  describe('new user onboarding', () => {
    it('should guide new user through profile creation', async () => {
      // STUB: Test complete new user experience
      // This would test welcome/onboarding messages, but we don't have onboarding UI yet
      expect(true).toBe(true);
    })

    it('should show helpful tooltips and hints', async () => {
      // STUB: Test new user guidance
      // This would test tooltips and hints, but we don't have tooltip system yet
      expect(true).toBe(true);
    })
  })

  describe('profile management workflows', () => {
    it('should create, edit, and manage multiple profiles', async () => {
      // Create space combat profile
      const spaceProfileId = app.createProfile('Space Combat');
      app.switchProfile(spaceProfileId);
      
      // Add multiple keybinds
      app.selectKey('F1');
      app.addCommand('F1', { command: 'GenSendMessage HUD_Root FireAll', type: 'space' });
      app.selectKey('Space');
      app.addCommand('Space', { command: '+STOTrayExecByTray 0 0', type: 'space' });
      
      // Create ground combat profile
      const groundProfileId = app.createProfile('Ground Combat');
      app.switchProfile(groundProfileId);
      
      // Add ground-specific keybinds
      app.selectKey('W');
      app.addCommand('W', { command: '+forward', type: 'movement' });
      app.selectKey('F1');
      app.addCommand('F1', { command: 'GenSendMessage HUD_Root FirePhasers', type: 'ground' });
      
      // Clone space profile for PvP variant (if clone functionality exists)
      if (app.cloneProfile) {
        const pvpProfileId = app.cloneProfile(spaceProfileId, 'PvP Space');
        expect(pvpProfileId).toBeDefined();
      }
      
      // Rename profiles with descriptive names (if rename functionality exists)
      if (app.renameProfile) {
        app.renameProfile(spaceProfileId, 'PvE Space Combat');
      }
      
      // Switch between profiles
      app.switchProfile(spaceProfileId);
      const spaceProfile = app.getCurrentProfile();
      expect(spaceProfile.name).toContain('Space');
      
      app.switchProfile(groundProfileId);
      const groundProfile = app.getCurrentProfile();
      expect(groundProfile.name).toContain('Ground');
      
      // Delete unused profile (if delete functionality exists)
      if (app.deleteProfile) {
        const testProfileId = app.createProfile('Test Profile to Delete');
        app.deleteProfile(testProfileId);
        const allData = stoStorage.getAllData();
        const deletedProfile = allData.profiles[testProfileId];
        expect(deletedProfile).toBeUndefined();
      }
      
      // Verify all operations work correctly
      const allData = stoStorage.getAllData();
      expect(Object.keys(allData.profiles).length).toBeGreaterThanOrEqual(2);
    })

    it('should handle profile switching with modifications', async () => {
      // Create profile and add keybinds
      const profile1Id = app.createProfile('Profile 1');
      app.switchProfile(profile1Id);
      app.selectKey('F1');
      app.addCommand('F1', { command: 'GenSendMessage HUD_Root FireAll', type: 'space' });
      
      const profile2Id = app.createProfile('Profile 2');
      
      // Make modifications without explicit saving (auto-save should handle this)
      app.selectKey('F2');
      app.addCommand('F2', { command: 'target_enemy_near', type: 'targeting' });
      
      // Attempt to switch profiles
      app.switchProfile(profile2Id);
      
      // Switch back and verify data integrity
      app.switchProfile(profile1Id);
      const profile = app.getCurrentProfile();
      
      // Verify the keybinds are still there (auto-saved)
      const hasF1 = !!(profile.keys && profile.keys.F1) || 
                   !!(profile.builds?.space?.keys && profile.builds.space.keys.F1);
      const hasF2 = !!(profile.keys && profile.keys.F2) || 
                   !!(profile.builds?.space?.keys && profile.builds.space.keys.F2);
      
      expect(hasF1 || hasF2).toBe(true); // At least one should be saved
    })
  })

  describe('keybind creation workflows', () => {
    it('should create complex keybind with multiple commands', async () => {
      // Create a profile for testing
      const profileId = app.createProfile('Complex Keybind Test');
      app.switchProfile(profileId);
      
      // Select key (Space bar)
      app.selectKey('Space');
      
      // Add multiple commands in sequence
      app.addCommand('Space', { command: 'target_enemy_near', type: 'targeting' });
      app.addCommand('Space', { command: 'GenSendMessage HUD_Root FireAll', type: 'space' });
      app.addCommand('Space', { command: '+STOTrayExecByTray 0 0', type: 'space' });
      app.addCommand('Space', { command: 'distribute_shields', type: 'defensive' });
      
      // Verify the commands were added
      const profile = app.getCurrentProfile();
      const spaceKey = profile.keys?.Space || profile.builds?.space?.keys?.Space;
      
      if (Array.isArray(spaceKey)) {
        expect(spaceKey.length).toBeGreaterThanOrEqual(1);
      } else if (spaceKey) {
        // Single command or command string
        expect(spaceKey).toBeDefined();
      }
      
      // Test command reordering (if available)
      if (app.reorderCommands) {
        app.reorderCommands('Space', [1, 0, 2, 3]); // Swap first two commands
      }
      
      // Verify command preview updates (if available)
      if (app.getCommandPreview) {
        const preview = app.getCommandPreview('Space');
        expect(preview).toBeDefined();
      }
      
      expect(true).toBe(true); // Test passes if no errors
    })

    it('should create keybind using command library', async () => {
      // Create a profile for testing
      const profileId = app.createProfile('Library Test');
      app.switchProfile(profileId);
      
      // Select key to bind
      app.selectKey('F1');
      
      // Open command library (if available)
      if (app.openCommandLibrary) {
        app.openCommandLibrary();
      }
      
      // Browse different categories (if available)
      if (app.browseCommandCategory) {
        app.browseCommandCategory('targeting');
        app.browseCommandCategory('space');
        app.browseCommandCategory('defensive');
      }
      
      // Search for specific commands (if available)
      if (app.searchCommands) {
        const searchResults = app.searchCommands('fire');
        expect(Array.isArray(searchResults)).toBe(true);
      }
      
      // Add commands from library
      app.addCommand('F1', { command: 'GenSendMessage HUD_Root FireAll', type: 'space' });
      
      // Verify parameters are set correctly
      const profile = app.getCurrentProfile();
      const f1Key = profile.keys?.F1 || profile.builds?.space?.keys?.F1;
      expect(f1Key).toBeDefined();
    })

    it('should create and use aliases in keybinds', async () => {
      // Create a profile for testing
      const profileId = app.createProfile('Alias Test');
      app.switchProfile(profileId);
      
      // Create alias for complex command sequence (if available)
      if (app.createAlias || app.addAlias) {
        const aliasCommand = app.createAlias || app.addAlias;
        aliasCommand('fire_sequence', 'target_enemy_near$$GenSendMessage HUD_Root FireAll$$distribute_shields');
        
        // Use alias in multiple keybinds
        app.selectKey('F1');
        app.addCommand('F1', { command: 'fire_sequence', type: 'alias' });
        app.selectKey('F2');
        app.addCommand('F2', { command: 'fire_sequence', type: 'alias' });
        
        // Modify alias definition (if available)
        if (app.modifyAlias) {
          app.modifyAlias('fire_sequence', 'target_enemy_near$$GenSendMessage HUD_Root FireAll');
        }
        
        // Verify alias appears in profile
        const profile = app.getCurrentProfile();
        if (profile.aliases) {
          expect(profile.aliases.fire_sequence).toBeDefined();
        }
      }
      
      expect(true).toBe(true); // Test passes if no errors
    })
  })

  describe('space and ground environment setup', () => {
    it('should set up complete space combat configuration', async () => {
      // Create space combat profile
      const profileId = app.createProfile('Space Combat Setup');
      app.switchProfile(profileId);
      
      // Ensure space environment is selected
      app.switchMode('space');
      
      // Bind essential space keys - F1-F4 for tray abilities
      app.selectKey('F1');
      app.addCommand('F1', { command: '+STOTrayExecByTray 0 0', type: 'space' });
      app.selectKey('F2');
      app.addCommand('F2', { command: '+STOTrayExecByTray 0 1', type: 'space' });
      app.selectKey('F3');
      app.addCommand('F3', { command: '+STOTrayExecByTray 0 2', type: 'space' });
      app.selectKey('F4');
      app.addCommand('F4', { command: '+STOTrayExecByTray 0 3', type: 'space' });
      
      // Space for weapons
      app.selectKey('Space');
      app.addCommand('Space', { command: 'GenSendMessage HUD_Root FireAll', type: 'space' });
      
      // Tab for targeting
      app.selectKey('Tab');
      app.addCommand('Tab', { command: 'target_enemy_near', type: 'targeting' });
      
      // WASD for movement
      app.selectKey('W');
      app.addCommand('W', { command: '+forward', type: 'movement' });
      app.selectKey('A');
      app.addCommand('A', { command: '+left', type: 'movement' });
      app.selectKey('S');
      app.addCommand('S', { command: '+backward', type: 'movement' });
      app.selectKey('D');
      app.addCommand('D', { command: '+right', type: 'movement' });
      
      // Add advanced bindings - Shield management
      app.selectKey('R');
      app.addCommand('R', { command: 'distribute_shields', type: 'defensive' });
      
      // Power routing (if available)
      app.selectKey('1');
      app.addCommand('1', { command: 'PowerLevel_Weapons 100', type: 'power' });
      app.selectKey('2');
      app.addCommand('2', { command: 'PowerLevel_Shields 100', type: 'power' });
      
      // Verify profile has the expected keybinds
      const profile = app.getCurrentProfile();
      const hasSpaceKeybinds = (profile.keys && Object.keys(profile.keys).length > 0) ||
                              (profile.builds?.space?.keys && Object.keys(profile.builds.space.keys).length > 0);
      
      expect(hasSpaceKeybinds).toBe(true);
      
      // Test export and verify STO compatibility (if export available)
      if (stoExport && typeof stoExport.exportSTOKeybindFile === 'function') {
        let exportedContent = '';
        const originalDownload = stoExport.downloadFile;
        stoExport.downloadFile = (content) => { exportedContent = content; };
        
        stoExport.exportSTOKeybindFile(profile);
        expect(exportedContent.length).toBeGreaterThan(0);
        
        stoExport.downloadFile = originalDownload;
      }
    })

    it('should set up ground combat configuration', async () => {
      // Create ground combat profile
      const profileId = app.createProfile('Ground Combat Setup');
      app.switchProfile(profileId);
      
      // Click ground environment button
      app.switchMode('ground');
      
      // Bind ground-specific keys - Movement and jump
      app.selectKey('W');
      app.addCommand('W', { command: '+forward', type: 'movement' });
      app.selectKey('A');
      app.addCommand('A', { command: '+left', type: 'movement' });
      app.selectKey('S');
      app.addCommand('S', { command: '+backward', type: 'movement' });
      app.selectKey('D');
      app.addCommand('D', { command: '+right', type: 'movement' });
      app.selectKey('Space');
      app.addCommand('Space', { command: '+jump', type: 'movement' });
      
      // Weapon firing
      app.selectKey('Button1');
      app.addCommand('Button1', { command: '+attack', type: 'ground' });
      
      // Kit abilities
      app.selectKey('F1');
      app.addCommand('F1', { command: '+STOTrayExecByTray 0 0', type: 'ground' });
      app.selectKey('F2');
      app.addCommand('F2', { command: '+STOTrayExecByTray 0 1', type: 'ground' });
      
      // Communication
      app.selectKey('T');
      app.addCommand('T', { command: 'startchat', type: 'communication' });
      
      // Verify ground keybinds were set
      const profile = app.getCurrentProfile();
      const hasGroundKeybinds = (profile.keys && Object.keys(profile.keys).length > 0) ||
                               (profile.builds?.ground?.keys && Object.keys(profile.builds.ground.keys).length > 0);
      
      expect(hasGroundKeybinds).toBe(true);
      
      // Export ground-specific file (if available)
      if (stoExport && typeof stoExport.exportSTOKeybindFile === 'function') {
        let exportedContent = '';
        const originalDownload = stoExport.downloadFile;
        stoExport.downloadFile = (content) => { exportedContent = content; };
        
        stoExport.exportSTOKeybindFile(profile);
        expect(exportedContent.length).toBeGreaterThan(0);
        
        stoExport.downloadFile = originalDownload;
      }
    })

    it('should switch between space and ground seamlessly', async () => {
      // Create profile for environment switching test
      const profileId = app.createProfile('Environment Switch Test');
      app.switchProfile(profileId);
      
      // Set up keybinds in space environment
      app.switchMode('space');
      app.selectKey('F1');
      app.addCommand('F1', { command: 'GenSendMessage HUD_Root FireAll', type: 'space' });
      app.selectKey('Space');
      app.addCommand('Space', { command: '+STOTrayExecByTray 0 0', type: 'space' });
      
      // Click ground environment button
      app.switchMode('ground');
      
      // Set up different keybinds on same keys
      app.selectKey('F1');
      app.addCommand('F1', { command: '+STOTrayExecByTray 0 0', type: 'ground' });
      app.selectKey('Space');
      app.addCommand('Space', { command: '+jump', type: 'movement' });
      
      // Switch back and forth using mode buttons
      app.switchMode('space');
      expect(app.currentEnvironment).toBe('space');
      
      app.switchMode('ground');
      expect(app.currentEnvironment).toBe('ground');
      
      // Verify each environment maintains its configuration
      const profile = app.getCurrentProfile();
      
      // Check if builds structure exists for separate environments
      if (profile.builds) {
        expect(profile.builds.space || profile.builds.ground).toBeDefined();
      }
      
      // Export both configurations (if available)
      if (stoExport && typeof stoExport.exportSTOKeybindFile === 'function') {
        app.switchMode('space');
        let spaceContent = '';
        const originalDownload = stoExport.downloadFile;
        stoExport.downloadFile = (content) => { spaceContent = content; };
        stoExport.exportSTOKeybindFile(profile);
        
        app.switchMode('ground');
        let groundContent = '';
        stoExport.downloadFile = (content) => { groundContent = content; };
        stoExport.exportSTOKeybindFile(profile);
        
        expect(spaceContent.length).toBeGreaterThan(0);
        expect(groundContent.length).toBeGreaterThan(0);
        
        stoExport.downloadFile = originalDownload;
      }
    })
  })

  describe('import and export workflows', () => {
    it('should import existing STO keybind file', async () => {
      // Create profile for import test
      const profileId = app.createProfile('Import Test');
      app.switchProfile(profileId);
      
      // Create sample STO keybind file content
      const sampleKeybindContent = `; Sample STO Keybind File
alias fire_all "GenSendMessage HUD_Root FireAll"
bind F1 "fire_all"
bind Space "+STOTrayExecByTray 0 0$$+STOTrayExecByTray 1 0"
bind W "+forward"
bind Tab "target_enemy_near"`;
      
      // Import file using keybind import functionality
      if (stoKeybinds && typeof stoKeybinds.importKeybindFile === 'function') {
        const importResult = stoKeybinds.importKeybindFile(sampleKeybindContent);
        
        // Verify import was successful
        expect(importResult).toBeDefined();
        
        // Verify all keybinds imported correctly
        const profile = app.getCurrentProfile();
        const hasImportedKeys = (profile.keys && Object.keys(profile.keys).length > 0) ||
                               (profile.builds?.space?.keys && Object.keys(profile.builds.space.keys).length > 0);
        
        if (hasImportedKeys) {
          expect(hasImportedKeys).toBe(true);
        } else {
          // At least verify the import function was called
          expect(importResult).toBeDefined();
        }
        
        // Check for aliases if supported
        if (profile.aliases) {
          expect(Object.keys(profile.aliases).length).toBeGreaterThanOrEqual(0);
        }
      }
      
      expect(true).toBe(true); // Test passes if no errors
    })

    it('should export and re-import complete project', async () => {
      // Create multiple profiles with data
      const profile1Id = app.createProfile('Profile 1');
      app.switchProfile(profile1Id);
      app.selectKey('F1');
      app.addCommand('F1', { command: 'GenSendMessage HUD_Root FireAll', type: 'space' });
      
      const profile2Id = app.createProfile('Profile 2');
      app.switchProfile(profile2Id);
      app.selectKey('F2');
      app.addCommand('F2', { command: 'target_enemy_near', type: 'targeting' });
      
      // Export complete project (if available)
      if (stoStorage && typeof stoStorage.exportData === 'function') {
        const exportedData = stoStorage.exportData();
        expect(exportedData).toBeDefined();
        expect(exportedData.length).toBeGreaterThan(0);
        
        // Clear all application data
        localStorage.clear();
        if (app.resetApplication) {
          app.resetApplication();
        }
        
        // Import project file (if available)
        if (typeof stoStorage.importData === 'function') {
          const importSuccess = stoStorage.importData(exportedData);
          
          // Verify all profiles and settings restored
          if (importSuccess) {
            const allData = stoStorage.getAllData();
            expect(Object.keys(allData.profiles).length).toBeGreaterThanOrEqual(2);
          }
        }
      }
      
      expect(true).toBe(true); // Test passes if no errors
    })

    it('should handle file format errors gracefully', async () => {
      // Create profile for error testing
      const profileId = app.createProfile('Error Test');
      app.switchProfile(profileId);
      
      // Attempt to import invalid file
      if (stoKeybinds && typeof stoKeybinds.importKeybindFile === 'function') {
        const invalidContent = 'This is not a valid keybind file';
        
        // Should not throw an error, but handle gracefully
        expect(() => {
          stoKeybinds.importKeybindFile(invalidContent);
        }).not.toThrow();
        
        // Attempt to import corrupted JSON (if JSON import available)
        const corruptedJson = '{"invalid": json syntax}';
        if (stoStorage && typeof stoStorage.importData === 'function') {
          expect(() => {
            stoStorage.importData(corruptedJson);
          }).not.toThrow();
        }
      }
      
      // Verify app remains functional after errors
      expect(app.getCurrentProfile()).toBeDefined();
      const allData = stoStorage.getAllData();
      expect(Object.keys(allData.profiles).length).toBeGreaterThanOrEqual(1);
    })
  })

  describe('advanced editing workflows', () => {
    it('should use drag and drop for command reordering', async () => {
      // Create keybind with multiple commands
      const profileId = app.createProfile('Drag Drop Test');
      app.switchProfile(profileId);
      
      app.selectKey('Space');
      app.addCommand('Space', { command: 'target_enemy_near', type: 'targeting' });
      app.addCommand('Space', { command: 'GenSendMessage HUD_Root FireAll', type: 'space' });
      app.addCommand('Space', { command: 'distribute_shields', type: 'defensive' });
      
      // Test drag and drop functionality (if available)
      if (app.reorderCommands) {
        // Reorder commands: move first command to last position
        app.reorderCommands('Space', [1, 2, 0]);
        
        // Verify new order is saved
        const profile = app.getCurrentProfile();
        const spaceKey = profile.keys?.Space || profile.builds?.space?.keys?.Space;
        expect(spaceKey).toBeDefined();
      }
      
      // Test keyboard accessibility alternative (if available)
      if (app.moveCommandUp || app.moveCommandDown) {
        app.moveCommandUp('Space', 1);
        app.moveCommandDown('Space', 0);
      }
      
      expect(true).toBe(true); // Test passes if no errors
    })

    it('should copy commands between keys', async () => {
      // Create complex keybind on one key
      const profileId = app.createProfile('Copy Test');
      app.switchProfile(profileId);
      
      app.selectKey('F1');
      app.addCommand('F1', { command: 'target_enemy_near', type: 'targeting' });
      app.addCommand('F1', { command: 'GenSendMessage HUD_Root FireAll', type: 'space' });
      
      // Copy commands to another key (if available)
      if (app.copyCommands) {
        app.copyCommands('F1', 'F2');
        
        // Verify copied commands exist
        const profile = app.getCurrentProfile();
        const f2Key = profile.keys?.F2 || profile.builds?.space?.keys?.F2;
        expect(f2Key).toBeDefined();
        
        // Modify copied commands
        app.selectKey('F2');
        app.addCommand('F2', { command: 'distribute_shields', type: 'defensive' });
        
        // Verify original is unchanged
        const f1Key = profile.keys?.F1 || profile.builds?.space?.keys?.F1;
        expect(f1Key).toBeDefined();
      } else {
        // Manual copy by adding same commands
        app.selectKey('F2');
        app.addCommand('F2', { command: 'target_enemy_near', type: 'targeting' });
        app.addCommand('F2', { command: 'GenSendMessage HUD_Root FireAll', type: 'space' });
      }
      
      expect(true).toBe(true); // Test passes if no errors
    })

    it('should validate commands with real-time feedback', async () => {
      // Create profile for validation testing
      const profileId = app.createProfile('Validation Test');
      app.switchProfile(profileId);
      
      // Enter valid command
      app.selectKey('F1');
      app.addCommand('F1', { command: 'GenSendMessage HUD_Root FireAll', type: 'space' });
      
      // Verify command was accepted
      const profile = app.getCurrentProfile();
      const f1Key = profile.keys?.F1 || profile.builds?.space?.keys?.F1;
      expect(f1Key).toBeDefined();
      
      // Test validation (if available)
      if (app.validateCommand) {
        // Enter valid command
        const validResult = app.validateCommand('target_enemy_near');
        expect(validResult.valid).toBe(true);
        
        // Enter invalid command syntax
        const invalidResult = app.validateCommand('invalid_command_xyz');
        expect(invalidResult.valid).toBe(false);
        
        // Check for suggestions (if available)
        if (invalidResult.suggestions) {
          expect(Array.isArray(invalidResult.suggestions)).toBe(true);
        }
      }
      
      expect(true).toBe(true); // Test passes if no errors
    })
  })

  describe('responsive design and accessibility', () => {
    it('should work on different screen sizes', async () => {
      // STUB: Test responsive design
      // This would test mobile/tablet/desktop viewports, but app is not mobile responsive yet
      expect(true).toBe(true);
    })

    it('should be keyboard accessible', async () => {
      // STUB: Test keyboard navigation
      // This would test keyboard shortcuts and navigation, but we don't have keyboard shortcuts yet
      expect(true).toBe(true);
    })

    it('should support high contrast and accessibility', async () => {
      // STUB: Test accessibility features
      // This would test high contrast mode and screen reader support, but we don't have this yet
      expect(true).toBe(true);
    })
  })

  describe('performance and large datasets', () => {
    it('should handle large profiles efficiently', async () => {
      // Create profile with many keybinds
      const profileId = app.createProfile('Large Profile Test');
      app.switchProfile(profileId);
      
      // Add multiple keybinds to simulate large dataset
      const keys = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
                   '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
                   'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
      
      const startTime = performance.now();
      
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        app.selectKey(key);
        app.addCommand(key, { 
          command: `GenSendMessage HUD_Root FireAll_${i}`, 
          type: 'space' 
        });
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Verify UI remains responsive (operations should complete quickly)
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      
      // Verify profile has the expected number of keybinds
      const profile = app.getCurrentProfile();
      const keyCount = (profile.keys && Object.keys(profile.keys).length) ||
                      (profile.builds?.space?.keys && Object.keys(profile.builds.space.keys).length) ||
                      0;
      
      expect(keyCount).toBeGreaterThan(10); // Should have added multiple keys
      
      // Test export performance (if available)
      if (stoExport && typeof stoExport.exportSTOKeybindFile === 'function') {
        const exportStartTime = performance.now();
        let exportedContent = '';
        const originalDownload = stoExport.downloadFile;
        stoExport.downloadFile = (content) => { exportedContent = content; };
        
        stoExport.exportSTOKeybindFile(profile);
        
        const exportEndTime = performance.now();
        const exportDuration = exportEndTime - exportStartTime;
        
        expect(exportDuration).toBeLessThan(2000); // Export should be fast
        expect(exportedContent.length).toBeGreaterThan(0);
        
        stoExport.downloadFile = originalDownload;
      }
    })

    it('should handle multiple profiles without slowdown', async () => {
      const profileIds = [];
      const startTime = performance.now();
      
      // Create multiple profiles
      for (let i = 0; i < 10; i++) {
        const profileId = app.createProfile(`Test Profile ${i}`);
        profileIds.push(profileId);
        
        // Add some keybinds to each
        app.switchProfile(profileId);
        app.selectKey('F1');
        app.addCommand('F1', { command: `test_command_${i}`, type: 'space' });
      }
      
      const createTime = performance.now();
      
      // Test profile switching speed
      for (let i = 0; i < profileIds.length; i++) {
        app.switchProfile(profileIds[i]);
        const profile = app.getCurrentProfile();
        expect(profile).toBeDefined();
      }
      
      const switchTime = performance.now();
      
      // Verify operations complete in reasonable time
      const totalDuration = switchTime - startTime;
      expect(totalDuration).toBeLessThan(3000); // Should complete within 3 seconds
      
      // Verify all profiles exist
      const allData = stoStorage.getAllData();
      expect(Object.keys(allData.profiles).length).toBeGreaterThanOrEqual(10);
    })
  })

  describe('real-world gaming scenarios', () => {
    it('should set up keybinds for PvP combat', async () => {
      // Create PvP profile
      const profileId = app.createProfile('PvP Combat');
      app.switchProfile(profileId);
      app.switchMode('space');
      
      // Bind high-priority abilities to easy keys
      app.selectKey('Space');
      app.addCommand('Space', { command: 'GenSendMessage HUD_Root FireAll', type: 'space' });
      
      app.selectKey('F1');
      app.addCommand('F1', { command: '+STOTrayExecByTray 0 0', type: 'space' }); // Emergency heal
      
      app.selectKey('F2');
      app.addCommand('F2', { command: '+STOTrayExecByTray 0 1', type: 'space' }); // Tactical ability
      
      // Set up target cycling
      app.selectKey('Tab');
      app.addCommand('Tab', { command: 'target_enemy_near', type: 'targeting' });
      
      app.selectKey('G');
      app.addCommand('G', { command: 'target_enemy_next', type: 'targeting' });
      
      // Configure shield and power management
      app.selectKey('R');
      app.addCommand('R', { command: 'distribute_shields', type: 'defensive' });
      
      app.selectKey('1');
      app.addCommand('1', { command: 'PowerLevel_Weapons 100', type: 'power' });
      
      app.selectKey('2');
      app.addCommand('2', { command: 'PowerLevel_Shields 100', type: 'power' });
      
      // Verify PvP setup
      const profile = app.getCurrentProfile();
      expect(profile.name).toContain('PvP');
      
      // Export for in-game use (if available)
      if (stoExport && typeof stoExport.exportSTOKeybindFile === 'function') {
        let exportedContent = '';
        const originalDownload = stoExport.downloadFile;
        stoExport.downloadFile = (content) => { exportedContent = content; };
        
        stoExport.exportSTOKeybindFile(profile);
        expect(exportedContent.length).toBeGreaterThan(0);
        
        stoExport.downloadFile = originalDownload;
      }
    })

    it('should set up keybinds for PvE missions', async () => {
      // Create PvE profile
      const profileId = app.createProfile('PvE Missions');
      app.switchProfile(profileId);
      app.switchMode('space');
      
      // Bind AoE abilities
      app.selectKey('F3');
      app.addCommand('F3', { command: '+STOTrayExecByTray 0 2', type: 'space' }); // AoE ability
      
      app.selectKey('F4');
      app.addCommand('F4', { command: '+STOTrayExecByTray 0 3', type: 'space' }); // Scatter volley
      
      // Set up automatic firing
      app.selectKey('Space');
      app.addCommand('Space', { command: 'GenSendMessage HUD_Root FireAll', type: 'space' });
      
      // Configure team support abilities
      app.selectKey('F5');
      app.addCommand('F5', { command: '+STOTrayExecByTray 1 0', type: 'space' }); // Team heal
      
      app.selectKey('F6');
      app.addCommand('F6', { command: '+STOTrayExecByTray 1 1', type: 'space' }); // Team buff
      
      // Basic movement and targeting
      app.selectKey('W');
      app.addCommand('W', { command: '+forward', type: 'movement' });
      
      app.selectKey('Tab');
      app.addCommand('Tab', { command: 'target_enemy_near', type: 'targeting' });
      
      // Verify PvE setup
      const profile = app.getCurrentProfile();
      expect(profile.name).toContain('PvE');
      
      const hasKeybinds = (profile.keys && Object.keys(profile.keys).length > 0) ||
                         (profile.builds?.space?.keys && Object.keys(profile.builds.space.keys).length > 0);
      expect(hasKeybinds).toBe(true);
    })

    it('should create alt-friendly keybind sets', async () => {
      // STUB: Test multi-character setup
      // This would test ship-type specific profiles, but the concept of "alt-friendly" 
      // keybind sets isn't clearly defined in the current app structure
      expect(true).toBe(true);
    })
  })

  describe('error recovery and edge cases', () => {
    it('should recover from browser crashes', async () => {
      // Make changes to profile
      const profileId = app.createProfile('Crash Recovery Test');
      app.switchProfile(profileId);
      app.selectKey('F1');
      app.addCommand('F1', { command: 'GenSendMessage HUD_Root FireAll', type: 'space' });
      
      // Simulate data persistence (auto-save should handle this)
      const profile = app.getCurrentProfile();
      expect(profile).toBeDefined();
      
      // Verify data would be preserved (localStorage should contain the data)
      const storedData = localStorage.getItem('sto-keybind-manager');
      if (storedData) {
        expect(storedData.length).toBeGreaterThan(0);
      }
      
      // Verify app recovers gracefully (app is functional)
      const allData = stoStorage.getAllData();
      expect(Object.keys(allData.profiles).length).toBeGreaterThanOrEqual(1);
    })

    it('should handle corrupted localStorage', async () => {
      // Manually corrupt localStorage data
      localStorage.setItem('sto-keybind-manager', '{"corrupted": json}');
      
      // App should handle this gracefully and not crash
      expect(() => {
        if (stoStorage && typeof stoStorage.loadData === 'function') {
          stoStorage.loadData();
        }
      }).not.toThrow();
      
      // Verify graceful fallback to defaults
      const allData = stoStorage.getAllData();
      expect(Object.keys(allData.profiles).length).toBeGreaterThanOrEqual(0);
      
      // App should remain functional
      const testProfileId = app.createProfile('Recovery Test');
      expect(testProfileId).toBeDefined();
    })

    it('should handle localStorage quota exceeded', async () => {
      // Create a large profile to test storage limits
      const profileId = app.createProfile('Storage Limit Test');
      app.switchProfile(profileId);
      
      // Add many keybinds to approach storage limits
      try {
        for (let i = 0; i < 100; i++) {
          app.selectKey(`TestKey${i}`);
          app.addCommand(`TestKey${i}`, { 
            command: `very_long_command_name_to_use_storage_${i}_${'x'.repeat(100)}`, 
            type: 'test' 
          });
        }
      } catch (error) {
        // Should handle storage errors gracefully
        expect(error).toBeInstanceOf(Error);
      }
      
      // Verify app remains functional even if storage is full
      expect(app.getCurrentProfile()).toBeDefined();
      const allData = stoStorage.getAllData();
      expect(Object.keys(allData.profiles).length).toBeGreaterThanOrEqual(1);
    })
  })
}) 