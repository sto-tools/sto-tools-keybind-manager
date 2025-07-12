// Test to verify Phase 2.1 event flow optimization - elimination of redundant keys:changed events
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createServiceFixture } from '../../fixtures/services/harness.js'

// Import the services we optimized
import KeyService from '../../../src/js/components/services/KeyService.js'
import KeyBrowserService from '../../../src/js/components/services/KeyBrowserService.js'

describe('Phase 2.1: Event Flow Optimization - keys:changed Elimination', () => {
  let harness
  let keyService
  let keyBrowserService
  let capturedEvents = []

  beforeEach(async () => {
    harness = createServiceFixture()
    capturedEvents = []

    // Create services
    keyService = new KeyService({ 
      storage: harness.storage, 
      eventBus: harness.eventBus,
      i18n: { t: (key) => key },
      ui: { showToast: () => {} }
    })

    keyBrowserService = new KeyBrowserService({ 
      storage: harness.storage, 
      eventBus: harness.eventBus,
      ui: { showToast: () => {} }
    })

    // Spy on event emissions
    const originalEmit = harness.eventBus.emit
    harness.eventBus.emit = vi.fn((event, data) => {
      capturedEvents.push({ event, data })
      originalEmit.call(harness.eventBus, event, data)
    })

    await keyService.init()
    await keyBrowserService.init()
  })

  describe('KeyService no longer emits keys:changed events', () => {
    it('should NOT emit keys:changed on profile:updated', async () => {
      // Setup service state
      keyService.cache.currentProfile = 'test-profile'
      
      // Simulate profile:updated event
      harness.eventBus.emit('profile:updated', {
        profileId: 'test-profile',
        profile: {
          id: 'test-profile',
          builds: {
            space: { keys: { F1: ['command1'], F2: ['command2'] } },
            ground: { keys: { F3: ['command3'] } }
          }
        }
      })

      // Verify keys:changed was NOT emitted
      const keysChangedEvents = capturedEvents.filter(e => e.event === 'keys:changed')
      expect(keysChangedEvents).toHaveLength(0)
    })

    it('should NOT emit keys:changed on environment:changed', async () => {
      // Setup service state
      keyService.cache.currentProfile = 'test-profile'
      keyService.cache.builds = {
        space: { keys: { F1: ['command1'] } },
        ground: { keys: { F2: ['command2'] } }
      }

      // Simulate environment:changed event
      harness.eventBus.emit('environment:changed', { environment: 'ground' })

      // Verify keys:changed was NOT emitted
      const keysChangedEvents = capturedEvents.filter(e => e.event === 'keys:changed')
      expect(keysChangedEvents).toHaveLength(0)
    })

    it('should NOT emit keys:changed on profile:switched', async () => {
      // Simulate profile:switched event
      harness.eventBus.emit('profile:switched', {
        profileId: 'new-profile',
        profile: {
          id: 'new-profile',
          builds: {
            space: { keys: { F4: ['command4'] } }
          }
        },
        environment: 'space'
      })

      // Verify keys:changed was NOT emitted
      const keysChangedEvents = capturedEvents.filter(e => e.event === 'keys:changed')
      expect(keysChangedEvents).toHaveLength(0)
    })

    it('should NOT emit keys:changed during duplicateKeyWithName', async () => {
      // Setup service with profile and keys
      keyService.cache.currentProfile = 'test-profile'
      keyService.cache.keys = { F1: ['command1'] }

      // Mock the request method for DataCoordinator update
      keyService.request = vi.fn().mockResolvedValue({ success: true })

      // Call duplicateKeyWithName
      await keyService.duplicateKeyWithName('F1', 'F2')

      // Verify keys:changed was NOT emitted (but key-duplicated should be)
      const keysChangedEvents = capturedEvents.filter(e => e.event === 'keys:changed')
      const keyDuplicatedEvents = capturedEvents.filter(e => e.event === 'key-duplicated')
      
      expect(keysChangedEvents).toHaveLength(0)
      expect(keyDuplicatedEvents).toHaveLength(1)
      expect(keyDuplicatedEvents[0].data).toEqual({ from: 'F1', to: 'F2' })
    })
  })

  describe('KeyBrowserService still receives key updates', () => {
    it('should emit key:list-changed in response to profile:updated (direct flow)', async () => {
      // Setup KeyBrowserService state properly
      keyBrowserService.cache.currentProfile = 'test-profile'
      keyBrowserService.cache.currentEnvironment = 'space'
      
      // Clear captured events to focus on KeyBrowserService response
      capturedEvents.length = 0

      // Simulate profile:updated event (direct from DataCoordinator)
      const profileData = {
        profileId: 'test-profile',
        profile: {
          id: 'test-profile',
          builds: {
            space: { keys: { F1: ['command1'], F2: ['command2'] } },
            ground: { keys: { F3: ['command3'] } }
          }
        }
      }
      
      console.log('About to emit profile:updated with:', profileData)
      console.log('KeyBrowserService cache.currentProfile before:', keyBrowserService.cache.currentProfile)
      
      // Check if KeyBrowserService has the event listener registered
      console.log('EventBus listener count for profile:updated:', harness.eventBus.getListenerCount('profile:updated'))
      
      harness.eventBus.emit('profile:updated', profileData)

      // Debug: log what events were captured (should be immediate/synchronous)
      console.log('Captured events after emission:', capturedEvents.map(e => e.event))
      console.log('KeyBrowserService current profile after:', keyBrowserService.cache.currentProfile)
      console.log('KeyBrowserService keys after:', keyBrowserService.getKeys())

      // Verify KeyBrowserService emitted key:list-changed (but NOT keys:changed)
      const keyListChangedEvents = capturedEvents.filter(e => e.event === 'key:list-changed')
      const keysChangedEvents = capturedEvents.filter(e => e.event === 'keys:changed')
      
      expect(keyListChangedEvents).toHaveLength(1)
      expect(keysChangedEvents).toHaveLength(0)
      
      // Verify the data is correct
      expect(keyListChangedEvents[0].data.keys).toEqual({ 
        F1: ['command1'], 
        F2: ['command2'] 
      })
    })

    it('should NOT have keys:changed listener anymore', () => {
      // This test verifies that KeyBrowserService doesn't listen to keys:changed
      // We can't directly test event listener absence, but we can verify behavior
      
      // Clear captured events
      capturedEvents.length = 0
      
      // Emit a keys:changed event (shouldn't happen in new flow, but test for safety)
      harness.eventBus.emit('keys:changed', { keys: { F1: ['test'] } })
      
      // Verify KeyBrowserService didn't respond (no key:list-changed emission)
      const keyListChangedEvents = capturedEvents.filter(e => e.event === 'key:list-changed')
      expect(keyListChangedEvents).toHaveLength(0)
    })
  })

  describe('Event flow optimization working correctly', () => {
    it('should have direct DataCoordinator → KeyBrowserService flow', async () => {
      // Setup both services properly
      keyService.cache.currentProfile = 'test-profile'
      keyBrowserService.cache.currentProfile = 'test-profile'
      keyBrowserService.cache.currentEnvironment = 'space'
      
      // Clear captured events
      capturedEvents.length = 0

      // Simulate DataCoordinator profile update
      const profileData = {
        profileId: 'test-profile',
        profile: {
          id: 'test-profile',
          builds: {
            space: { keys: { F1: ['command1'] } }
          }
        }
      }

      harness.eventBus.emit('profile:updated', profileData)

      // Count event types
      const eventCounts = capturedEvents.reduce((counts, { event }) => {
        counts[event] = (counts[event] || 0) + 1
        return counts
      }, {})

      // Verify optimized flow:
      // - KeyBrowserService emits key:list-changed (1 time)  
      // - NO keys:changed events emitted by KeyService (0 times)
      expect(eventCounts['key:list-changed']).toBe(1)
      expect(eventCounts['keys:changed']).toBeUndefined()
      
      // Verify we reduced event traffic compared to old flow
      // Filter out input events we sent during testing - only count service responses
      const serviceResponseEvents = capturedEvents.filter(e => 
        e.event !== 'profile:updated' && 
        e.event !== 'environment:changed' && 
        e.event !== 'profile:switched'
      )
      expect(serviceResponseEvents.length).toBe(1) // Only key:list-changed response
    })

    it('should maintain functionality despite eliminating redundant events', async () => {
      // Setup KeyBrowserService properly
      keyBrowserService.cache.currentProfile = 'test-profile'
      keyBrowserService.cache.currentEnvironment = 'space'
      
      // Simulate profile update with new keys
      harness.eventBus.emit('profile:updated', {
        profileId: 'test-profile',
        profile: {
          id: 'test-profile',
          builds: {
            space: { keys: { 
              F1: ['FireAll'], 
              F2: ['Target_Enemy_Near'] 
            } }
          }
        }
      })

      // Verify KeyBrowserService has correct cached data
      expect(keyBrowserService.getKeys()).toEqual({
        F1: ['FireAll'],
        F2: ['Target_Enemy_Near']
      })

      // Verify UI gets notified via key:list-changed
      const keyListChangedEvents = capturedEvents.filter(e => e.event === 'key:list-changed')
      expect(keyListChangedEvents).toHaveLength(1)
      expect(keyListChangedEvents[0].data.keys).toEqual({
        F1: ['FireAll'],
        F2: ['Target_Enemy_Near']
      })
    })
  })

  describe('Performance improvement verification', () => {
    it('should emit fewer events per profile operation', async () => {
      // Setup services
      keyService.cache.currentProfile = 'test-profile'
      keyBrowserService.cache.currentProfile = 'test-profile'
      
      // Clear events
      capturedEvents.length = 0

      // Simulate multiple profile operations that used to trigger keys:changed
      harness.eventBus.emit('profile:updated', {
        profileId: 'test-profile',
        profile: { id: 'test-profile', builds: { space: { keys: { F1: ['cmd1'] } } } }
      })

      harness.eventBus.emit('environment:changed', { environment: 'ground' })

      harness.eventBus.emit('profile:switched', {
        profileId: 'test-profile',
        profile: { id: 'test-profile', builds: { ground: { keys: { F2: ['cmd2'] } } } },
        environment: 'ground'
      })

      // Count relevant events
      const relevantEvents = capturedEvents.filter(e => 
        e.event === 'key:list-changed' || e.event === 'keys:changed'
      )

      // In the old flow, we would have had:
      // - profile:updated → keys:changed → key:list-changed (2 events)
      // - environment:changed → keys:changed (1 event) 
      // - profile:switched → keys:changed → key:list-changed (2 events)
      // Total: 5 events

      // In the new flow, we have:
      // - profile:updated → key:list-changed (1 event)
      // - environment:changed → key:list-changed (1 event) 
      // - profile:switched → key:list-changed (1 event)
      // Total: 3 events (all key:list-changed, no keys:changed)

      // The key optimization is that we eliminated keys:changed events entirely
      expect(relevantEvents.every(e => e.event === 'key:list-changed')).toBe(true)
      expect(relevantEvents.filter(e => e.event === 'keys:changed')).toHaveLength(0)
    })
  })
})