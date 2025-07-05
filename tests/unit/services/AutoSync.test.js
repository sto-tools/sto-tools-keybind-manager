import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import AutoSync from '../../../src/js/components/services/AutoSync.js'
import { createServiceFixture } from '../../fixtures/index.js'

function createMockSyncManager() {
  return { syncProject: vi.fn().mockResolvedValue() }
}

describe('AutoSync', () => {
  let fixture, storage, eventBus, syncManager, autoSync

  beforeEach(() => {
    fixture = createServiceFixture()
    storage = fixture.storageService
    eventBus = fixture.eventBus

    syncManager = createMockSyncManager()
    autoSync = new AutoSync({ eventBus, storage, syncManager })
    autoSync.init()
  })

  afterEach(() => {
    fixture.destroy()
  })

  it('enable("change") listens for storage changes and debounces', async () => {
    vi.useFakeTimers()
    autoSync.enable('change')

    // Emit storage change twice quickly
    eventBus.emit('storage:data-changed')
    eventBus.emit('storage:data-changed')

    // Fast-forward debounce delay
    vi.advanceTimersByTime(600)

    expect(syncManager.syncProject).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
}) 