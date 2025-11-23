import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import KeyService from '../../../src/js/components/services/KeyService.js'
import { createServiceFixture } from '../../fixtures/index.js'
import { respond } from '../../../src/js/core/requestResponse.js'


describe('KeyService Structured Response Tests', () => {
  let fixture, service

  beforeEach(async () => {
    fixture = createServiceFixture()

    // Set up request handlers on the fixture's eventBus
    const eventBus = fixture.eventBus

    // Mock DataCoordinator profile switching
    eventBus.on('rpc:data:switch-profile', ({ requestId, replyTopic, payload }) => {
      // Mock profile switching - emit the profile:switched event
      const testProfile = {
        name: 'Test Profile',
        builds: {
          space: { keys: {} },
          ground: { keys: {} }
        },
        bindsets: {
          Custom: {
            space: { keys: {} },
            ground: { keys: {} }
          }
        }
      }

      // Emit the event that ComponentBase expects
      eventBus.emit('profile:switched', {
        profileId: payload.profileId,
        profile: testProfile,
        environment: 'space'
      })

      // Respond to the request
      eventBus.emit(replyTopic, { data: { success: true, profileId: payload.profileId } })
    })

    // Mock other required requests
    eventBus.on('rpc:data:get-key-name-pattern', ({ requestId, replyTopic }) => {
      eventBus.emit(replyTopic, { data: { pattern: /^[A-Z]\d+$/ } })
    })

    eventBus.on('rpc:data:update-profile', ({ requestId, replyTopic, payload }) => {
      // Mock the data update - return success
      const { profileId, add, delete: deleteOp, updates } = payload
      if (updates?.modify?.bindsets) {
        const modifications = updates.modify.bindsets
        service.cache.profile.bindsets = service.cache.profile.bindsets || {}
        Object.entries(modifications).forEach(([bindsetName, envData]) => {
          if (!service.cache.profile.bindsets[bindsetName]) {
            service.cache.profile.bindsets[bindsetName] = { space: { keys: {} }, ground: { keys: {} } }
          }
          Object.entries(envData).forEach(([env, data]) => {
            if (!service.cache.profile.bindsets[bindsetName][env]) {
              service.cache.profile.bindsets[bindsetName][env] = { keys: {} }
            }
            const targetKeys = service.cache.profile.bindsets[bindsetName][env].keys
            Object.entries(data.keys || {}).forEach(([key, value]) => {
              if (value === null) delete targetKeys[key]
              else targetKeys[key] = value
            })
          })
        })
        eventBus.emit(replyTopic, { data: { success: true } })
        return
      }
      if (add || deleteOp) {
        // Update the service cache to simulate what DataCoordinator would do
        if (add && add.builds && add.builds.space && add.builds.space.keys) {
          Object.assign(service.cache.keys, add.builds.space.keys)
        }
        if (deleteOp && deleteOp.builds && deleteOp.builds.space && deleteOp.builds.space.keys) {
          deleteOp.builds.space.keys.forEach(key => delete service.cache.keys[key])
        }
        eventBus.emit(replyTopic, { data: { success: true } })
        return
      }
      eventBus.emit(replyTopic, { data: { success: false, error: 'invalid_operation' } })
    })

    eventBus.on('rpc:selection:select-key', ({ requestId, replyTopic }) => {
      eventBus.emit(replyTopic, { data: { success: true } })
    })

    eventBus.on('rpc:parser:parse-command-string', ({ requestId, replyTopic, payload }) => {
      eventBus.emit(replyTopic, { data: { commands: [{ command: payload.commandString }] } })
    })

    eventBus.on('rpc:data:generate-unique-key-name', ({ requestId, replyTopic, payload }) => {
      eventBus.emit(replyTopic, { data: `${payload.baseKey}_duplicate_${Date.now()}` })
    })

    service = new KeyService({
      eventBus: eventBus,
      storage: fixture.storage,
      i18n: { t: (key, params) => `${key}:${JSON.stringify(params)}` }
    })
    service.init()

    // Set up a test profile in storage
    const testProfile = {
      name: 'Test Profile',
      builds: {
        space: { keys: {} },
        ground: { keys: {} }
      },
      bindsets: {
        Custom: {
          space: { keys: {} },
          ground: { keys: {} }
        }
      }
    }
    fixture.storage.saveProfile('test-profile', testProfile)

    // Use proper profile switching via DataCoordinator
    await service.request('data:switch-profile', { profileId: 'test-profile' })

    // Give ComponentBase time to process the profile:switched event
    await new Promise(resolve => setTimeout(resolve, 10))
  })

  afterEach(() => {
    if (service && service.destroy) {
      service.destroy()
    }
  })

  describe('addKey', () => {
    it('should return structured success response for valid key', async () => {
      const result = await service.addKey('K1')

      expect(result).toEqual({
        success: true,
        key: 'K1',
        environment: 'space'
      })
    })

    it('should return structured error response for invalid key name', async () => {
      const result = await service.addKey('')

      expect(result).toEqual({
        success: false,
        error: 'invalid_key_name',
        params: { keyName: '' }
      })
    })

    it('should return structured error response when no profile selected', async () => {
      // Create a new service with no profile to test the no profile case
      const noProfileService = new KeyService({
        eventBus: fixture.eventBus,
        storage: fixture.storage,
        i18n: { t: (key, params) => `${key}:${JSON.stringify(params)}` }
      })
      noProfileService.init()

      const result = await noProfileService.addKey('K1')

      expect(result).toEqual({
        success: false,
        error: 'no_profile_selected'
      })

      if (noProfileService && noProfileService.destroy) {
        noProfileService.destroy()
      }
    })

    it('should return structured error response for duplicate key', async () => {
      // Add first key
      await service.addKey('K1')

      // Try to add duplicate
      const result = await service.addKey('K1')

      expect(result).toEqual({
        success: false,
        error: 'key_already_exists',
        params: { keyName: 'K1' }
      })
    })

    it('should add key directly into a target bindset when provided', async () => {
      const result = await service.addKey('B1', 'Custom')

      expect(result).toEqual({
        success: true,
        key: 'B1',
        environment: 'space',
        bindset: 'Custom'
      })
      expect(service.cache.profile.bindsets.Custom.space.keys.B1).toEqual([])
    })
  })

  describe('deleteKey', () => {
    it('should return structured success response for existing key', async () => {
      // First add a key
      await service.addKey('K1')

      // Then delete it
      const result = await service.deleteKey('K1')

      expect(result).toEqual({
        success: true,
        key: 'K1',
        environment: 'space'
      })
    })

    it('should return structured error response when no profile selected', async () => {
      // Create a new service with no profile to test the no profile case
      const noProfileService = new KeyService({
        eventBus: fixture.eventBus,
        storage: fixture.storage,
        i18n: { t: (key, params) => `${key}:${JSON.stringify(params)}` }
      })
      noProfileService.init()

      const result = await noProfileService.deleteKey('K1')

      expect(result).toEqual({
        success: false,
        error: 'no_profile_selected'
      })

      if (noProfileService && noProfileService.destroy) {
        noProfileService.destroy()
      }
    })

    it('should return structured error response for non-existent key', async () => {
      const result = await service.deleteKey('Z9')

      expect(result).toEqual({
        success: false,
        error: 'key_not_found',
        params: { keyName: 'Z9' }
      })
    })
  })

  describe('duplicateKey', () => {
    it('should return structured success response for valid duplication', async () => {
      // First add a key with some commands
      service.cache.keys['K1'] = ['test_command']

      // Then duplicate it
      const result = await service.duplicateKey('K1')

      expect(result.success).toBe(true)
      expect(result.sourceKey).toBe('K1')
      expect(result.newKey).toMatch(/^K1_copy(_\d+)?$/)
    })

    it('should return structured error response when no profile selected', async () => {
      // Create a new service with no profile to test the no profile case
      const noProfileService = new KeyService({
        eventBus: fixture.eventBus,
        storage: fixture.storage,
        i18n: { t: (key, params) => `${key}:${JSON.stringify(params)}` }
      })
      noProfileService.init()

      const result = await noProfileService.duplicateKey('K1')

      expect(result).toEqual({
        success: false,
        error: 'no_profile_selected'
      })

      if (noProfileService && noProfileService.destroy) {
        noProfileService.destroy()
      }
    })

    it('should return structured error response for non-existent source key', async () => {
      const result = await service.duplicateKey('Z9')

      expect(result).toEqual({
        success: false,
        error: 'key_not_found',
        params: { keyName: 'Z9' }
      })
    })
  })

  describe('duplicateKeyWithName', () => {
    it('should return structured success response for valid duplication', async () => {
      await service.addKey('K1')
      service.cache.keys.K1 = [{ id: 'cmd_1', command: 'TestCommand' }]

      const result = await service.duplicateKeyWithName('K1', 'K2')

      expect(result).toEqual({
        success: true,
        sourceKey: 'K1',
        newKey: 'K2',
        environment: 'space'
      })
      expect(service.cache.keys).toHaveProperty('K2')
      expect(service.cache.keys.K2).toEqual([{ id: 'cmd_1', command: 'TestCommand' }])
    })

    it('should return structured error when no profile selected', async () => {
      const noProfileService = new KeyService({
        eventBus: fixture.eventBus,
        storage: fixture.storage,
        i18n: { t: (key, params) => `${key}:${JSON.stringify(params)}` }
      })
      noProfileService.init()

      const result = await noProfileService.duplicateKeyWithName('K1', 'K2')

      expect(result).toEqual({ success: false, error: 'no_profile_selected' })

      if (noProfileService && noProfileService.destroy) {
        noProfileService.destroy()
      }
    })

    it('should return structured error for missing source key', async () => {
      const result = await service.duplicateKeyWithName('M1', 'M2')

      expect(result).toEqual({
        success: false,
        error: 'key_not_found',
        params: { keyName: 'M1' }
      })
    })

    it('should return structured error for invalid new key name', async () => {
      await service.addKey('K1')
      service.cache.keys.K1 = [{ id: 'cmd_1', command: 'TestCommand' }]

      const result = await service.duplicateKeyWithName('K1', 'invalid')

      expect(result).toEqual({
        success: false,
        error: 'invalid_key_name',
        params: { keyName: 'invalid' }
      })
    })

    it('should return structured error when target key already exists', async () => {
      await service.addKey('K1')
      service.cache.keys.K1 = [{ id: 'cmd_1', command: 'TestCommand' }]
      service.cache.keys.K2 = [{ id: 'cmd_existing', command: 'Existing' }]

      const result = await service.duplicateKeyWithName('K1', 'K2')

      expect(result).toEqual({
        success: false,
        error: 'key_already_exists',
        params: { keyName: 'K2' }
      })
    })

    it('should return structured error when source key has no commands', async () => {
      await service.addKey('K3')
      service.cache.keys.K3 = []

      const result = await service.duplicateKeyWithName('K3', 'K4')

      expect(result).toEqual({ success: false, error: 'no_commands_to_duplicate' })
    })
  })

  describe('Request/Response Endpoints', () => {
    it('should handle key:add request via event bus', async () => {
      const result = await service.request('key:add', { key: 'X1' })

      expect(result.success).toBe(true)
      expect(result.key).toBe('X1')
    })

    it('should handle key:delete request via event bus', async () => {
      // First add a key
      await service.addKey('X1')

      // Then delete via request
      const result = await service.request('key:delete', { key: 'X1' })

      expect(result.success).toBe(true)
      expect(result.key).toBe('X1')
    })

    it('should handle key:duplicate request via event bus', async () => {
      // First add a key
      service.cache.keys['X1'] = ['test_command']

      // Then duplicate via request
      const result = await service.request('key:duplicate', { key: 'X1' })

      expect(result.success).toBe(true)
      expect(result.sourceKey).toBe('X1')
    })

    it('should handle invalid requests gracefully', async () => {
      const result = await service.request('key:add', { key: '' })

      expect(result.success).toBe(false)
      expect(result.error).toBe('invalid_key_name')
    })
  })

  describe('ComponentBase Integration', () => {
    it('should update cache when profile:switched event is emitted', () => {
      expect(service.cache.currentProfile).toBe('test-profile')
    })

    
    it('should maintain cache consistency after operations', async () => {
      // Add a key
      await service.addKey('K1')
      expect(service.cache.keys['K1']).toBeDefined()

      // Delete the key
      await service.deleteKey('K1')
      expect(service.cache.keys['K1']).toBeUndefined()
    })
  })
})
