// Test to verify Phase 1a state ownership fixes
import { describe, it, expect, beforeEach } from 'vitest'
import { createServiceFixture } from '../../fixtures/services/harness.js'

// Import the services we fixed
import KeyService from '../../../src/js/components/services/KeyService.js'
import KeyBrowserService from '../../../src/js/components/services/KeyBrowserService.js'
import CommandService from '../../../src/js/components/services/CommandService.js'
import ParameterCommandService from '../../../src/js/components/services/ParameterCommandService.js'
import VFXManagerService from '../../../src/js/components/services/VFXManagerService.js'
import ProfileService from '../../../src/js/components/services/ProfileService.js'
import CommandChainService from '../../../src/js/components/services/CommandChainService.js'
import BindsetSelectorService from '../../../src/js/components/services/BindsetSelectorService.js'
import AliasBrowserService from '../../../src/js/components/services/AliasBrowserService.js'
import CommandLibraryService from '../../../src/js/components/services/CommandLibraryService.js'

describe('Phase 1a: State Ownership Fixes', () => {
  let harness

  beforeEach(async () => {
    harness = createServiceFixture()
  })

  describe('KeyService getCurrentState()', () => {
    it('should only return owned state (selectedKey)', async () => {
      const service = new KeyService({ 
        storage: harness.storage, 
        eventBus: harness.eventBus,
        i18n: { t: (key) => key },
        ui: { showToast: () => {} }
      })
      await service.init()

      const state = service.getCurrentState()
      
      // Should only contain owned state
      expect(state).toHaveProperty('selectedKey')
      
      // Should NOT contain non-owned state
      expect(state).not.toHaveProperty('currentProfile')
      expect(state).not.toHaveProperty('currentEnvironment')
      expect(state).not.toHaveProperty('keys')
    })
  })

  describe('KeyBrowserService getCurrentState()', () => {
    it('should only return owned state (selection and cache)', async () => {
      const service = new KeyBrowserService({ 
        storage: harness.storage, 
        eventBus: harness.eventBus,
        ui: { showToast: () => {} }
      })
      await service.init()

      const state = service.getCurrentState()
      
      // Should only contain owned state
      expect(state).toHaveProperty('selectedKeyName')
      expect(state).toHaveProperty('cachedSelections')
      
      // Should NOT contain non-owned state
      expect(state).not.toHaveProperty('currentProfileId')
      expect(state).not.toHaveProperty('currentEnvironment')
      expect(state).not.toHaveProperty('keys')
    })
  })

  describe('CommandService getCurrentState()', () => {
    it('should only return owned state (selection)', async () => {
      const service = new CommandService({ 
        storage: harness.storage, 
        eventBus: harness.eventBus,
        i18n: { t: (key) => key }
      })
      await service.init()

      const state = service.getCurrentState()
      
      // Should only contain owned state
      expect(state).toHaveProperty('selectedKey')
      expect(state).toHaveProperty('selectedAlias')
      
      // Should NOT contain non-owned state
      expect(state).not.toHaveProperty('currentEnvironment')
      expect(state).not.toHaveProperty('currentProfile')
    })
  })

  describe('ParameterCommandService getCurrentState()', () => {
    it('should only return owned state (selection and editing context)', async () => {
      const service = new ParameterCommandService({ 
        eventBus: harness.eventBus
      })
      await service.init()

      const state = service.getCurrentState()
      
      // Should only contain owned state
      expect(state).toHaveProperty('selectedKey')
      expect(state).toHaveProperty('selectedAlias')
      expect(state).toHaveProperty('editingContext')
      
      // Should NOT contain non-owned state
      expect(state).not.toHaveProperty('currentEnvironment')
    })
  })

  describe('VFXManagerService getCurrentState()', () => {
    it('should only return owned state (VFX effects)', async () => {
      const service = new VFXManagerService(harness.eventBus)
      await service.init()

      const state = service.getCurrentState()
      
      // Should only contain owned state
      expect(state).toHaveProperty('selectedEffects')
      expect(state).toHaveProperty('showPlayerSay')
      
      // Should NOT contain non-owned state
      expect(state).not.toHaveProperty('currentProfile')
    })
  })

  describe('ProfileService getCurrentState()', () => {
    it('should only return owned state (modified flag)', async () => {
      const service = new ProfileService({ 
        storage: harness.storage, 
        eventBus: harness.eventBus,
        i18n: { t: (key) => key }
      })
      await service.init()

      const state = await service.getCurrentState()
      
      // Should only contain owned state
      expect(state).toHaveProperty('modified')
      
      // Should NOT contain non-owned state (delegated to DataCoordinator)
      expect(state).not.toHaveProperty('currentProfile')
      expect(state).not.toHaveProperty('currentEnvironment')
      expect(state).not.toHaveProperty('profiles')
    })
  })

  describe('AliasBrowserService getCurrentState()', () => {
    it('should only return owned state (selection cache)', async () => {
      const service = new AliasBrowserService({ 
        storage: harness.storage, 
        eventBus: harness.eventBus,
        ui: { showToast: () => {} }
      })
      await service.init()

      const state = service.getCurrentState()
      
      // Should only contain owned state
      expect(state).toHaveProperty('selectedAliasName')
      expect(state).toHaveProperty('cachedAliasSelection')
      
      // Should NOT contain non-owned state
      expect(state).not.toHaveProperty('currentProfileId')
      expect(state).not.toHaveProperty('currentEnvironment')
      expect(state).not.toHaveProperty('aliases')
    })
  })

  describe('All Services State Ownership Compliance', () => {
    it('should not return profile/environment context from non-owning services', async () => {
      const services = [
        new KeyService({ storage: harness.storage, eventBus: harness.eventBus, i18n: { t: (key) => key }, ui: { showToast: () => {} } }),
        new KeyBrowserService({ storage: harness.storage, eventBus: harness.eventBus, ui: { showToast: () => {} } }),
        new CommandService({ storage: harness.storage, eventBus: harness.eventBus, i18n: { t: (key) => key } }),
        new ParameterCommandService({ eventBus: harness.eventBus }),
        new VFXManagerService(harness.eventBus),
        new AliasBrowserService({ storage: harness.storage, eventBus: harness.eventBus, ui: { showToast: () => {} } })
      ]

      for (const service of services) {
        await service.init()
        const state = service.getCurrentState()
        
        // These should not be present in any non-DataCoordinator service
        expect(state).not.toHaveProperty('currentProfile', 
          `${service.componentName} should not return currentProfile`)
        expect(state).not.toHaveProperty('currentEnvironment', 
          `${service.componentName} should not return currentEnvironment`)
        expect(state).not.toHaveProperty('profiles', 
          `${service.componentName} should not return profiles`)
        expect(state).not.toHaveProperty('keys', 
          `${service.componentName} should not return keys`)
        expect(state).not.toHaveProperty('aliases', 
          `${service.componentName} should not return aliases`)
      }
    })
  })
})