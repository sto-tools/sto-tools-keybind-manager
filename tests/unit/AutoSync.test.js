import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import AutoSync from '../../src/js/components/services/AutoSync.js'

describe('AutoSync', () => {
  let autoSync
  let mockEventBus
  let mockStorage
  let mockSyncManager
  let mockUI
  let consoleWarnSpy

  beforeEach(() => {
    // Mock dependencies
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn()
    }

    mockStorage = {
      getSettings: vi.fn().mockReturnValue({}),
      saveSettings: vi.fn()
    }

    mockSyncManager = {
      syncProject: vi.fn().mockResolvedValue()
    }

    mockUI = {}

    // Mock console.warn to test warning messages
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Mock setInterval and clearInterval
    vi.useFakeTimers()

    autoSync = new AutoSync({
      eventBus: mockEventBus,
      storage: mockStorage,
      syncManager: mockSyncManager,
      ui: mockUI
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('constructor', () => {
    it('initializes with correct default values', () => {
      expect(autoSync.isEnabled).toBe(false)
      expect(autoSync.interval).toBe('change')
      expect(autoSync._intervalId).toBe(null)
      expect(autoSync.lastSync).toBe(null)
    })

    it('stores dependencies correctly', () => {
      expect(autoSync.storage).toBe(mockStorage)
      expect(autoSync.syncManager).toBe(mockSyncManager)
      expect(autoSync.ui).toBe(mockUI)
    })
  })

  describe('setupFromSettings', () => {
    it('enables autoSync when settings indicate it should be enabled', () => {
      mockStorage.getSettings.mockReturnValue({
        autoSync: true,
        autoSyncInterval: '30'
      })

      const enableSpy = vi.spyOn(autoSync, 'enable')
      autoSync.setupFromSettings()

      expect(enableSpy).toHaveBeenCalledWith('30')
    })

    it('uses default interval when autoSyncInterval is not set', () => {
      mockStorage.getSettings.mockReturnValue({
        autoSync: true
      })

      const enableSpy = vi.spyOn(autoSync, 'enable')
      autoSync.setupFromSettings()

      expect(enableSpy).toHaveBeenCalledWith('change')
    })

    it('does not enable when autoSync is false', () => {
      mockStorage.getSettings.mockReturnValue({
        autoSync: false
      })

      const enableSpy = vi.spyOn(autoSync, 'enable')
      autoSync.setupFromSettings()

      expect(enableSpy).not.toHaveBeenCalled()
    })

    it('handles missing storage gracefully', () => {
      autoSync.storage = null
      expect(() => autoSync.setupFromSettings()).not.toThrow()
    })
  })

  describe('enable', () => {
    it('enables change-based sync when interval is "change"', () => {
      autoSync.enable('change')

      expect(autoSync.isEnabled).toBe(true)
      expect(autoSync.interval).toBe('change')
      expect(mockEventBus.on).toHaveBeenCalledWith('storage:data-changed', autoSync._onStorageChange)
      expect(mockStorage.saveSettings).toHaveBeenCalled()
    })

    it('enables timer-based sync with valid numeric interval', () => {
      autoSync.enable('30')

      expect(autoSync.isEnabled).toBe(true)
      expect(autoSync.interval).toBe('30')
      expect(autoSync._intervalId).toBeTruthy()
      expect(mockStorage.saveSettings).toHaveBeenCalled()
    })

    it('falls back to change mode when interval is invalid string', () => {
      autoSync.enable('invalid')

      expect(autoSync.isEnabled).toBe(true)
      expect(autoSync.interval).toBe('change')
      expect(mockEventBus.on).toHaveBeenCalledWith('storage:data-changed', autoSync._onStorageChange)
      expect(consoleWarnSpy).toHaveBeenCalledWith("[AutoSync] Invalid interval 'invalid', falling back to 'change' mode")
    })

    it('falls back to change mode when interval is NaN', () => {
      autoSync.enable('NaN')

      expect(autoSync.isEnabled).toBe(true)
      expect(autoSync.interval).toBe('change')
      expect(mockEventBus.on).toHaveBeenCalledWith('storage:data-changed', autoSync._onStorageChange)
      expect(consoleWarnSpy).toHaveBeenCalledWith("[AutoSync] Invalid interval 'NaN', falling back to 'change' mode")
    })

    it('falls back to change mode when interval is zero', () => {
      autoSync.enable('0')

      expect(autoSync.isEnabled).toBe(true)
      expect(autoSync.interval).toBe('change')
      expect(mockEventBus.on).toHaveBeenCalledWith('storage:data-changed', autoSync._onStorageChange)
      expect(consoleWarnSpy).toHaveBeenCalledWith("[AutoSync] Invalid interval '0', falling back to 'change' mode")
    })

    it('falls back to change mode when interval is negative', () => {
      autoSync.enable('-5')

      expect(autoSync.isEnabled).toBe(true)
      expect(autoSync.interval).toBe('change')
      expect(mockEventBus.on).toHaveBeenCalledWith('storage:data-changed', autoSync._onStorageChange)
      expect(consoleWarnSpy).toHaveBeenCalledWith("[AutoSync] Invalid interval '-5', falling back to 'change' mode")
    })

    it('disables previous sync before enabling new one', () => {
      const disableSpy = vi.spyOn(autoSync, 'disable')
      autoSync.enable('30')

      expect(disableSpy).toHaveBeenCalled()
    })

    it('persists settings after enabling', () => {
      autoSync.enable('30')

      expect(mockStorage.saveSettings).toHaveBeenCalledWith({
        autoSync: true,
        autoSyncInterval: '30'
      })
    })
  })

  describe('disable', () => {
    it('disables sync and clears interval', () => {
      // First enable
      autoSync.enable('30')
      const intervalId = autoSync._intervalId

      // Then disable
      autoSync.disable()

      expect(autoSync.isEnabled).toBe(false)
      expect(mockEventBus.off).toHaveBeenCalledWith('storage:data-changed', autoSync._onStorageChange)
      expect(autoSync._intervalId).toBe(null)
    })

    it('removes event listener for change-based sync', () => {
      autoSync.enable('change')
      autoSync.disable()

      expect(mockEventBus.off).toHaveBeenCalledWith('storage:data-changed', autoSync._onStorageChange)
    })

    it('persists disabled state', () => {
      autoSync.disable()

      expect(mockStorage.saveSettings).toHaveBeenCalledWith({
        autoSync: false
      })
    })
  })

  describe('sync', () => {
    it('performs sync when enabled', async () => {
      autoSync.enable('change')
      await autoSync.sync()

      expect(mockSyncManager.syncProject).toHaveBeenCalled()
      expect(autoSync.lastSync).toBeInstanceOf(Date)
    })

    it('does not sync when disabled', async () => {
      autoSync.disable()
      await autoSync.sync()

      expect(mockSyncManager.syncProject).not.toHaveBeenCalled()
    })

    it('does not sync when syncManager is missing', async () => {
      autoSync.syncManager = null
      autoSync.enable('change')
      await autoSync.sync()

      expect(mockSyncManager.syncProject).not.toHaveBeenCalled()
    })

    it('handles sync errors gracefully', async () => {
      const error = new Error('Sync failed')
      mockSyncManager.syncProject.mockRejectedValue(error)
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      autoSync.enable('change')
      await autoSync.sync()

      expect(consoleErrorSpy).toHaveBeenCalledWith('[AutoSync] sync failed', error)
    })
  })

  describe('getStatus', () => {
    it('returns current status', () => {
      autoSync.enable('30')
      const testDate = new Date()
      autoSync.lastSync = testDate

      const status = autoSync.getStatus()

      expect(status).toEqual({
        enabled: true,
        interval: '30',
        lastSync: testDate
      })
    })
  })

  describe('timer-based sync', () => {
    it('triggers sync at correct intervals', async () => {
      const syncSpy = vi.spyOn(autoSync, 'sync').mockResolvedValue()
      
      autoSync.enable('2') // 2 seconds
      
      // Fast-forward 2 seconds
      vi.advanceTimersByTime(2000)
      expect(syncSpy).toHaveBeenCalledTimes(1)
      
      // Fast-forward another 2 seconds
      vi.advanceTimersByTime(2000)
      expect(syncSpy).toHaveBeenCalledTimes(2)
    })

    it('stops timer when disabled', () => {
      autoSync.enable('5')
      const intervalId = autoSync._intervalId
      
      autoSync.disable()
      
      expect(autoSync._intervalId).toBe(null)
    })
  })

  describe('change-based sync', () => {
    it('triggers sync on storage change events', async () => {
      const syncSpy = vi.spyOn(autoSync, 'sync').mockResolvedValue()
      
      autoSync.enable('change')
      
      // Simulate storage change event
      autoSync._onStorageChange()
      
      expect(syncSpy).toHaveBeenCalled()
    })
  })

  describe('regression tests for interval validation bug', () => {
    it('prevents infinite sync loop with invalid interval', () => {
      // This test ensures the bug is fixed - invalid intervals should not cause
      // setInterval to be called with NaN (which becomes 0)
      autoSync.enable('invalid-string')
      
      // Should fall back to change mode, not set up a timer
      expect(autoSync.interval).toBe('change')
      expect(autoSync._intervalId).toBe(null)
      expect(mockEventBus.on).toHaveBeenCalledWith('storage:data-changed', autoSync._onStorageChange)
    })

    it('prevents infinite sync loop with empty string interval', () => {
      autoSync.enable('')
      
      expect(autoSync.interval).toBe('change')
      expect(autoSync._intervalId).toBe(null)
    })

    it('prevents infinite sync loop with whitespace interval', () => {
      autoSync.enable('   ')
      
      expect(autoSync.interval).toBe('change')
      expect(autoSync._intervalId).toBe(null)
    })
  })
}) 