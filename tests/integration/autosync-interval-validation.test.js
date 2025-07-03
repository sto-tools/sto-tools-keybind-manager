import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import AutoSync from '../../src/js/components/services/AutoSync.js'

describe('AutoSync Interval Validation Integration', () => {
  let autoSync
  let mockEventBus
  let mockStorage
  let mockSyncManager
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

    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.useFakeTimers()

    autoSync = new AutoSync({
      eventBus: mockEventBus,
      storage: mockStorage,
      syncManager: mockSyncManager
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('Regression Test: Interval Validation Bug', () => {
    it('should prevent infinite sync loops from invalid intervals', () => {
      // This test reproduces the original bug scenario:
      // When an invalid interval is provided, parseInt() returns NaN
      // NaN * 1000 = NaN, and setInterval(callback, NaN) becomes setInterval(callback, 0)
      // This would cause continuous firing
      
      const invalidIntervals = [
        'invalid-string',
        'NaN',
        '',
        '   ',
        'abc123',
        'not-a-number',
        '0',      // Zero should be invalid
        '-5',     // Negative should be invalid
        'null',
        'undefined'
      ]

      invalidIntervals.forEach(interval => {
        // Reset mocks
        mockEventBus.on.mockClear()
        consoleWarnSpy.mockClear()

        // Enable with invalid interval
        autoSync.enable(interval)

        // Should fall back to 'change' mode
        expect(autoSync.interval).toBe('change')
        expect(autoSync._intervalId).toBe(null)
        expect(mockEventBus.on).toHaveBeenCalledWith('storage:data-changed', autoSync._onStorageChange)
        expect(consoleWarnSpy).toHaveBeenCalledWith(`[AutoSync] Invalid interval '${interval}', falling back to 'change' mode`)
      })
    })

    it('should work correctly with valid numeric intervals', () => {
      const validIntervals = ['1', '5', '10', '30', '60', '300']

      validIntervals.forEach(interval => {
        // Reset
        autoSync.disable()
        mockEventBus.on.mockClear()
        consoleWarnSpy.mockClear()

        // Enable with valid interval
        autoSync.enable(interval)

        // Should set up timer-based sync
        expect(autoSync.interval).toBe(interval)
        expect(autoSync._intervalId).toBeTruthy()
        expect(mockEventBus.on).not.toHaveBeenCalledWith('storage:data-changed', autoSync._onStorageChange)
        expect(consoleWarnSpy).not.toHaveBeenCalled()
      })
    })

    it('should handle the specific NaN case that caused the original bug', () => {
      // This reproduces the exact scenario from the bug report
      const problematicInterval = 'not-a-number'
      
      autoSync.enable(problematicInterval)
      
      // Before the fix: parseInt('not-a-number', 10) returns NaN
      // NaN * 1000 = NaN
      // setInterval(callback, NaN) becomes setInterval(callback, 0)
      // This would cause continuous firing
      
      // After the fix: Should fall back to 'change' mode
      expect(autoSync.interval).toBe('change')
      expect(autoSync._intervalId).toBe(null)
      expect(consoleWarnSpy).toHaveBeenCalledWith("[AutoSync] Invalid interval 'not-a-number', falling back to 'change' mode")
    })

    it('should not fire continuously with invalid intervals', async () => {
      const syncSpy = vi.spyOn(autoSync, 'sync').mockResolvedValue()
      
      // Enable with invalid interval that would cause NaN
      autoSync.enable('invalid')
      
      // Fast-forward time significantly
      vi.advanceTimersByTime(10000) // 10 seconds
      
      // Should not have fired any timer-based syncs
      // (it should only fire on storage change events)
      expect(syncSpy).not.toHaveBeenCalled()
      
      // But should respond to storage change events
      autoSync._onStorageChange()
      expect(syncSpy).toHaveBeenCalledTimes(1)
    })

    it('should handle settings loaded from storage with invalid intervals', () => {
      // Simulate loading invalid settings from storage
      mockStorage.getSettings.mockReturnValue({
        autoSync: true,
        autoSyncInterval: 'corrupted-value'
      })

      autoSync.setupFromSettings()

      // Should fall back to 'change' mode
      expect(autoSync.interval).toBe('change')
      expect(autoSync._intervalId).toBe(null)
      expect(consoleWarnSpy).toHaveBeenCalledWith("[AutoSync] Invalid interval 'corrupted-value', falling back to 'change' mode")
    })
  })

  describe('Performance Test', () => {
    it('should not create rapid timers with edge case intervals', () => {
      const edgeCases = ['0.1', '0.01', '0.001', '0']
      
      edgeCases.forEach(interval => {
        autoSync.disable()
        consoleWarnSpy.mockClear()
        
        autoSync.enable(interval)
        
        // All these intervals should be invalid because:
        // - '0' is explicitly invalid (zero or negative)
        // - '0.1', '0.01', '0.001' parse to 0 with parseInt(), which is invalid
        expect(autoSync.interval).toBe('change')
        expect(consoleWarnSpy).toHaveBeenCalledWith(`[AutoSync] Invalid interval '${interval}', falling back to 'change' mode`)
      })
    })
  })
}) 