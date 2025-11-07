import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createServiceFixture } from '../../fixtures/index.js'
import StorageService from '../../../src/js/components/services/StorageService.js'


describe('StorageService', () => {
  let fixture, storageService, eventBusFixture, mockEventBus

  beforeEach(() => {
    // Ensure a clean slate before each test
    localStorage.clear()
    fixture = createServiceFixture()
    eventBusFixture = fixture.eventBusFixture
    mockEventBus = fixture.eventBus

    storageService = new StorageService({ eventBus: mockEventBus, version: 'test-1.0.0' })
    // Trigger onInit via ComponentBase.init()
    storageService.init()
  })

  afterEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    fixture.destroy()
  })

  describe('Initialization', () => {
    it('should emit storage:ready event', () => {
      eventBusFixture.expectEvent('storage:ready')
    })

    it('should populate localStorage with default structure', () => {
      const raw = localStorage.getItem('sto_keybind_manager')
      expect(raw).toBeTruthy()
      const data = JSON.parse(raw)
      expect(data).toHaveProperty('currentProfile')
      expect(data).toHaveProperty('profiles')
      expect(data).toHaveProperty('settings')
      expect(data.version).toBe('test-1.0.0')
    })
  })

  describe('Data persistence', () => {
    it('should save modified data and emit change event', () => {
      const data = storageService.getAllData()
      data.settings.theme = 'light'
      const ok = storageService.saveAllData(data)

      expect(ok).toBe(true)
      eventBusFixture.expectEvent('storage:data-changed')

      const persisted = JSON.parse(localStorage.getItem('sto_keybind_manager'))
      expect(persisted.settings.theme).toBe('light')
    })
  })

  describe('Profile operations', () => {
    it('should save and retrieve profiles', () => {
      const profileId = 'test_profile'
      const profileData = { name: 'Test Profile', builds: { space: { keys: {} }, ground: { keys: {} } }, aliases: {} }

      const ok = storageService.saveProfile(profileId, profileData)
      expect(ok).toBe(true)

      const fetched = storageService.getProfile(profileId)
      expect(fetched).toBeTruthy()
      expect(fetched.name).toBe('Test Profile')
    })

    it('should delete profiles and update currentProfile', () => {
      const profileId = 'delete_me'
      storageService.saveProfile(profileId, { name: 'Delete Me', builds: { space: { keys: {} }, ground: { keys: {} } }, aliases: {} })

      // Set the profile as current
      const data = storageService.getAllData()
      data.currentProfile = profileId
      storageService.saveAllData(data)

      const ok = storageService.deleteProfile(profileId)
      expect(ok).toBe(true)

      const fetched = storageService.getProfile(profileId)
      expect(fetched).toBeNull()

      const updated = storageService.getAllData()
      expect(updated.currentProfile).not.toBe(profileId)
    })
  })

  describe('Settings operations', () => {
    it('should return default settings', () => {
      const settings = storageService.getSettings()
      expect(settings).toMatchObject({ theme: 'default', language: 'en', autoSave: true })
    })

    it('should save settings and merge with existing', () => {
      const ok = storageService.saveSettings({ language: 'es' })
      expect(ok).toBe(true)

      const settings = storageService.getSettings()
      expect(settings.language).toBe('es')
      expect(settings.theme).toBe('default') // Unchanged
    })
  })

  
  describe('Error handling', () => {
    it('should return false when localStorage.setItem throws', async () => {
      const { createLocalStorageFixture } = await import('../../fixtures/core/index.js')
      const { destroy } = createLocalStorageFixture({ quotaError: true })

      const ok = storageService.saveAllData(storageService.getAllData())
      expect(ok).toBe(false)

      destroy()
    })
  })
}) 