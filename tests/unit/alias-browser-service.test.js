import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import AliasBrowserService from '../../src/js/components/services/AliasBrowserService.js'
import { respond } from '../../src/js/core/requestResponse.js'
import eventBus from '../../src/js/core/eventBus.js'

// Provide minimal i18n stub so service can call i18next.t via UI toast
if (!global.i18next) {
  global.i18next = { t: (k) => k }
}

describe('AliasBrowserService', () => {
  let mockUI, svc, mockProfileUpdateResponder

  beforeEach(async () => {
    // Mock DataCoordinator responses
    mockProfileUpdateResponder = respond(eventBus, 'data:update-profile', ({ profileId, updates }) => {
      // Simulate successful profile update
      return { success: true, profile: { id: profileId, aliases: updates.aliases || {} } }
    })

    mockUI = {
      showToast: vi.fn(),
    }

    svc = new AliasBrowserService({ storage: null, ui: mockUI })
    
    // Use real eventBus for proper request/response
    svc.eventBus = eventBus

    // Initialize the service
    await svc.init()
    
    // Set up cache state for testing
    svc.cache.currentProfile = 'profile-1'
    svc.cache.aliases = {}
    svc.cache.profile = { id: 'profile-1', aliases: {} }
    svc.currentProfileId = 'profile-1'
  })

  afterEach(() => {
    if (mockProfileUpdateResponder) mockProfileUpdateResponder()
    if (svc) svc.destroy()
    vi.clearAllMocks()
  })

  it('creates a new alias successfully through DataCoordinator', async () => {
    const ok = await svc.createAlias('MyAlias', 'desc')
    
    expect(ok).toBe(true)
    expect(svc.selectedAliasName).toBe('MyAlias')
  })

  it('prevents duplicate alias creation and shows toast', async () => {
    // Set up existing alias in cache
    svc.cache.aliases = { 'DupAlias': { description: 'existing', commands: '' } }
    
    const ok = await svc.createAlias('DupAlias')
    
    expect(ok).toBe(false)
    expect(mockUI.showToast).toHaveBeenCalled()
  })

  it('selectAlias emits alias-selected event', () => {
    const spy = vi.fn()
    svc.addEventListener('alias-selected', spy)
    svc.selectAlias('Chosen')
    expect(spy).toHaveBeenCalledWith({ name: 'Chosen' })
  })

  it('deleteAlias removes alias through DataCoordinator and clears selection', async () => {
    // Set up existing alias in cache
    svc.cache.aliases = { 'DelAlias': { description: 'to delete', commands: '' } }
    svc.selectAlias('DelAlias')
    
    const ok = await svc.deleteAlias('DelAlias')
    
    expect(ok).toBe(true)
    expect(svc.selectedAliasName).toBeNull()
  })

  it('duplicateAlias copies alias with incremented suffix through DataCoordinator', async () => {
    // Set up existing alias in cache
    svc.cache.aliases = { 'Orig': { description: 'orig-desc', commands: 'cmd' } }
    
    await svc.duplicateAlias('Orig')
    expect(svc.selectedAliasName).toBe('Orig_copy')

    // Duplicate again => should make _copy1
    svc.cache.aliases['Orig_copy'] = { description: 'orig-desc (copy)', commands: 'cmd' }
    await svc.duplicateAlias('Orig')

    expect(svc.selectedAliasName).toBe('Orig_copy1')
  })

  it('duplicateAlias copies alias to explicitly provided name', async () => {
    svc.cache.aliases = { 'Orig': { description: 'orig-desc', commands: 'cmd' } }

    const ok = await svc.duplicateAlias('Orig', 'OrigNew')
    expect(ok).toBe(true)
    expect(svc.selectedAliasName).toBe('OrigNew')
  })

  it('handles DataCoordinator errors gracefully', async () => {
    // Remove the responder to simulate error
    if (mockProfileUpdateResponder) mockProfileUpdateResponder()
    mockProfileUpdateResponder = null
    
    const ok = await svc.createAlias('FailAlias', 'Will fail')
    
    expect(ok).toBe(false)
    expect(mockUI.showToast).toHaveBeenCalledWith('Failed to create alias', 'error')
  })
}) 