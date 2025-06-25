import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import AliasBrowserService from '../../src/js/components/services/AliasBrowserService.js'
import eventBus from '../../src/js/core/eventBus.js'

// Provide minimal i18n stub so service can call i18next.t via UI toast
if (!global.i18next) {
  global.i18next = { t: (k) => k }
}

describe('AliasBrowserService', () => {
  let mockStorage, mockUI, svc

  beforeEach(() => {
    // Simple in-memory storage mock replicating methods used by the service
    mockStorage = {
      _profiles: {
        'profile-1': {
          aliases: {},
        },
      },
      getProfile: vi.fn((id) => mockStorage._profiles[id] || null),
      saveProfile: vi.fn((id, profile) => {
        mockStorage._profiles[id] = JSON.parse(JSON.stringify(profile))
        return true
      }),
      getAllData: vi.fn(() => ({ currentProfile: 'profile-1' })),
    }

    mockUI = {
      showToast: vi.fn(),
    }

    svc = new AliasBrowserService({ storage: mockStorage, ui: mockUI })
    svc.currentProfileId = 'profile-1'
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('creates a new alias successfully', () => {
    const ok = svc.createAlias('MyAlias', 'desc')
    expect(ok).toBe(true)
    const profile = mockStorage.getProfile('profile-1')
    expect(profile.aliases.MyAlias).toBeDefined()
    expect(profile.aliases.MyAlias.description).toBe('desc')
  })

  it('prevents duplicate alias creation and shows toast', () => {
    svc.createAlias('DupAlias')
    const ok = svc.createAlias('DupAlias')
    expect(ok).toBe(false)
    expect(mockUI.showToast).toHaveBeenCalled()
  })

  it('selectAlias emits alias-selected event', () => {
    const spy = vi.fn()
    svc.addEventListener('alias-selected', spy)
    svc.selectAlias('Chosen')
    expect(spy).toHaveBeenCalledWith({ name: 'Chosen' })
  })

  it('deleteAlias removes alias and clears selection', () => {
    svc.createAlias('DelAlias')
    svc.selectAlias('DelAlias')
    const ok = svc.deleteAlias('DelAlias')
    expect(ok).toBe(true)
    const profile = mockStorage.getProfile('profile-1')
    expect(profile.aliases.DelAlias).toBeUndefined()
    expect(svc.selectedAliasName).toBeNull()
  })

  it('duplicateAlias copies alias with incremented suffix', () => {
    svc.createAlias('Orig', 'orig-desc')
    const ok = svc.duplicateAlias('Orig')
    expect(ok).toBe(true)
    const profile = mockStorage.getProfile('profile-1')
    expect(profile.aliases.Orig_copy).toBeDefined()
    // Duplicate again => should make _copy1
    svc.duplicateAlias('Orig')
    expect(profile.aliases.Orig_copy1).toBeDefined()
  })
}) 