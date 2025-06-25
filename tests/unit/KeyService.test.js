import { describe, it, expect, beforeEach, vi } from 'vitest'

import { KeyService, StorageService } from '../../src/js/components/services/index.js'

// Minimal global STO_DATA validation pattern required by KeyService.isValidKeyName
if (typeof global.STO_DATA === 'undefined') {
  global.STO_DATA = {
    validation: {
      keyNamePattern: /^[A-Za-z0-9_]+$/
    }
  }
}

describe('KeyService – core key operations', () => {
  let service, storageMock, uiMock

  beforeEach(() => {
    // Fresh mocks for every test
    storageMock = new StorageService()
    // Ensure storage has a dummy profile to work with
    const data = storageMock.getAllData()
    data.profiles['test-profile'] = {
      name: 'Test Profile',
      builds: {
        space: { keys: {} },
        ground: { keys: {} }
      }
    }
    storageMock.saveAllData(data)

    uiMock = { showToast: vi.fn() }

    service = new KeyService({ storage: storageMock, ui: uiMock })
    service.setCurrentProfile('test-profile')
  })

  describe('isValidKeyName()', () => {
    it('accepts alphanumeric key names up to 20 chars', () => {
      expect(service.isValidKeyName('F1')).toBe(true)
      expect(service.isValidKeyName('CtrlA')).toBe(true)
      expect(service.isValidKeyName('Key_123')).toBe(true)
    })

    it('rejects names with special characters or too long', () => {
      expect(service.isValidKeyName('Invalid-Key!')).toBe(false)
      expect(service.isValidKeyName('ThisKeyNameIsWayTooLongToBeValid')).toBe(false)
    })
  })

  describe('generateKeyId()', () => {
    it('creates a unique id with key_ prefix', () => {
      const id = service.generateKeyId()
      expect(typeof id).toBe('string')
      expect(id.startsWith('key_')).toBe(true)
      // Two consecutive calls should yield different values
      expect(service.generateKeyId()).not.toBe(id)
    })
  })

  describe('addKey()', () => {
    it('successfully adds a new key row', () => {
      const result = service.addKey('F3')
      expect(result).toBe(true)
      const profile = storageMock.getProfile('test-profile')
      expect(profile.builds.space.keys).toHaveProperty('F3')
    })

    it('prevents duplicate keys', () => {
      expect(service.addKey('F3')).toBe(true)
      expect(service.addKey('F3')).toBe(false)
    })
  })

  describe('deleteKey()', () => {
    it('removes an existing key row', () => {
      service.addKey('F4')
      expect(service.deleteKey('F4')).toBe(true)
      const profile = storageMock.getProfile('test-profile')
      expect(profile.builds.space.keys).not.toHaveProperty('F4')
    })
  })

  describe('duplicateKey()', () => {
    it('creates a copy with a new name and fresh ids', () => {
      // Prepopulate with a command so we can verify cloning
      service.addKey('F5')
      const profileBefore = storageMock.getProfile('test-profile')
      profileBefore.builds.space.keys['F5'].push({ id: 'original-id', command: 'say hello' })
      storageMock.saveProfile('test-profile', profileBefore)

      expect(service.duplicateKey('F5')).toBe(true)

      const profileAfter = storageMock.getProfile('test-profile')
      const duplicateKeyName = Object.keys(profileAfter.builds.space.keys).find(k => k !== 'F5')
      expect(duplicateKeyName).toMatch(/^F5_copy/)
      expect(profileAfter.builds.space.keys[duplicateKeyName]).toHaveLength(1)
      expect(profileAfter.builds.space.keys[duplicateKeyName][0].id).not.toBe('original-id')
    })
  })
}) 