// Test to verify Activity Tracking in KBFDecodePipeline
// Tests that stabilization metadata is correctly set based on activities 13, 26, and 95 during KBF parsing
import { describe, it, expect, beforeEach } from 'vitest'
import { ActivityTranslator } from '../../../src/js/lib/kbf/translation/ActivityTranslator.js'

describe('KBFDecodePipeline - Activity Tracking', () => {
  let activityTranslator

  beforeEach(() => {
    activityTranslator = new ActivityTranslator()
  })

  describe('TrayExec-generating activities', () => {
    it('should generate TrayExec commands for Activity 13 (TrayExecByTray)', () => {
      const result = activityTranslator.generateActivityCommand(13, {
        n1: 2,
        n2: 5
      }, {
        environment: 'space',
        bindsetName: 'test',
        keyToken: 'F1'
      })

      
      // Activity 13 should generate TrayExec commands
      const hasTrayExec = result.commands.some(cmd => cmd.includes('TrayExecByTray'))
      expect(hasTrayExec).toBe(true)
    })

    it('should generate TrayExec commands for Activity 26', () => {
      const result = activityTranslator.generateActivityCommand(26, {}, {
        environment: 'space',
        bindsetName: 'test',
        keyToken: 'F1'
      })

      // Should have 10 TrayExec commands for full tray execution
      expect(result.commands).toHaveLength(10)
      result.commands.forEach(cmd => {
        expect(cmd).toContain('+TrayExecByTray')
      })
    })

    it('should generate TrayExec commands for Activity 95', () => {
      const result = activityTranslator.generateActivityCommand(95, {}, {
        environment: 'space',
        bindsetName: 'test',
        keyToken: 'F1'
      })

      // Should have TrayExec commands for partial tray execution
      expect(result.commands.length).toBeGreaterThan(0)
      result.commands.forEach(cmd => {
        expect(cmd).toContain('+TrayExecByTray')
      })
    })

    it('should not generate TrayExec commands for non-TrayExec activities', () => {
      const result = activityTranslator.generateActivityCommand(1, {}, {
        environment: 'space',
        bindsetName: 'test',
        keyToken: 'F1'
      })

      // Should NOT contain any TrayExec commands
      result.commands.forEach(cmd => {
        expect(cmd).not.toContain('TrayExec')
      })
    })

    it('should handle edge cases gracefully', () => {
      // Test Activity 13 with invalid parameters
      const result13Invalid = activityTranslator.generateActivityCommand(13, {}, {
        environment: 'space',
        bindsetName: 'test',
        keyToken: 'F1'
      })

      // Activity 13 should always generate some output, even with invalid params
      expect(result13Invalid.commands).toBeDefined()
    })
  })

  describe('Activity ID identification for stabilization', () => {
    it('should correctly identify stabilization-requiring activities', () => {
      const stabilizationActivities = [13, 26, 95]

      stabilizationActivities.forEach(activityId => {
        let params = {}
        if (activityId === 13) {
          params = { n1: 2, n2: 5 }
        } else if (activityId === 95) {
          params = { n1: 1, n2: 3, n3: 6 }
        }

        const result = activityTranslator.generateActivityCommand(activityId, params, {
          environment: 'space',
          bindsetName: 'test',
          keyToken: 'F1'
        })

        // All stabilization activities should generate at least one TrayExec command
        const hasTrayExec = result.commands.some(cmd => cmd.includes('TrayExec'))
        expect(hasTrayExec).toBe(true)
      })
    })

    it('should not identify non-stabilization activities', () => {
      const nonStabilizationActivities = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 27, 28, 29, 30]

      nonStabilizationActivities.forEach(activityId => {
        const result = activityTranslator.generateActivityCommand(activityId, {}, {
          environment: 'space',
          bindsetName: 'test',
          keyToken: 'F1'
        })

        // Non-stabilization activities should not generate TrayExec commands
        const hasTrayExec = result.commands.some(cmd => cmd.includes('TrayExec'))
        expect(hasTrayExec).toBe(false)
      })
    })
  })
})