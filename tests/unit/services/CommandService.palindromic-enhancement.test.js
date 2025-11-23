import { describe, it, expect, vi } from 'vitest'

describe('CommandService Palindromic Enhancement', () => {
  // Mock CommandService instance for testing
  class MockCommandService {
    constructor() {
      this.commandDisplayAdapter = {
        normalizeCommandsForDisplay: async (commands) => {
          return commands.map(cmd => cmd.command)
        }
      }
    }

    async generateMirroredCommands(commands = []) {
      // Accept either an array of command objects or plain strings.
      if (!Array.isArray(commands) || commands.length === 0) return ''

      // Normalise to command objects first
      const cmdObjects = commands.map((c) => {
        if (typeof c === 'string') return { command: c }
        if (c && typeof c.command === 'string') return c
        return null
      }).filter(Boolean)

      if (cmdObjects.length <= 1) {
        const normalized = await this.commandDisplayAdapter.normalizeCommandsForDisplay(cmdObjects)
        return normalized.join(' $$ ')
      }

      // Apply TrayExec-aware palindromic generation
      const beforePrePivot = []  // Non-TrayExec + excluded TrayExec (before)
      const palindromic = []     // TrayExec for mirroring (pre-pivot candidates)
      const pivotGroup = []      // Excluded TrayExec (in pivot)

      cmdObjects.forEach(cmd => {
        const cmdStr = cmd.command
        const isTrayExec = cmdStr.match(/^(?:\+)?TrayExecByTray/)
        const isExcluded = cmd.palindromicGeneration === false

        if (!isTrayExec) {
          beforePrePivot.push(cmdStr)  // Non-TrayExec first
        } else if (isExcluded) {
          if (cmd.placement === 'in-pivot-group') {
            pivotGroup.push(cmdStr)
          } else {
            beforePrePivot.push(cmdStr)  // before-pre-pivot
          }
        } else {
          palindromic.push(cmdStr)  // Normal TrayExec palindrome
        }
      })

      // Determine pivot/pivot group + pre-pivot
      let pivot = []
      let prePivot = palindromic

      if (pivotGroup.length > 0) {
        pivot = pivotGroup  // Use specified pivot group
      } else if (palindromic.length > 0) {
        pivot = [palindromic[palindromic.length - 1]]  // Last item becomes pivot
        prePivot = palindromic.slice(0, -1)  // All others are pre-pivot
      }

      const postPivot = [...prePivot].reverse()  // Mirror pre-pivot to create post-pivot

      // Build final sequence: [non-TrayExec + before-pre-pivot] + [pre-pivot] + [pivot] + [post-pivot]
      const finalCommands = [...beforePrePivot, ...prePivot, ...pivot, ...postPivot]

      // Apply normalization before returning
      const normalizedStrings = await this.commandDisplayAdapter.normalizeCommandsForDisplay(
        finalCommands.map(cmd => ({ command: cmd }))
      )
      return normalizedStrings.join(' $$ ')
    }
  }

  const service = new MockCommandService()

  describe('Basic functionality', () => {
    it('should return empty string for empty input', async () => {
      expect(await service.generateMirroredCommands([])).toEqual('')
    })

    it('should return single command unchanged', async () => {
      const commands = ['Target_Enemy_Near']
      expect(await service.generateMirroredCommands(commands)).toEqual('Target_Enemy_Near')
    })

    it('should handle single rich object command', async () => {
      const commands = [{ command: 'Target_Enemy_Near' }]
      expect(await service.generateMirroredCommands(commands)).toEqual('Target_Enemy_Near')
    })

    it('should return two commands joined with $$ separator', async () => {
      const commands = ['Target_Enemy_Near', 'FirePhasers']
      expect(await service.generateMirroredCommands(commands)).toEqual('Target_Enemy_Near $$ FirePhasers')
    })
  })

  describe('TrayExec-only palindromic generation', () => {
    it('should create simple palindrome with only TrayExec commands', async () => {
      const commands = ["+TrayExecByTray 1 0", "+TrayExecByTray 1 1"]
      const result = await service.generateMirroredCommands(commands)
      expect(result).toEqual("+TrayExecByTray 1 0 $$ +TrayExecByTray 1 1 $$ +TrayExecByTray 1 0")
    })

    it('should place non-TrayExec commands before pre-pivot section', async () => {
      const commands = ["Target_Enemy_Near", "+TrayExecByTray 1 0", "+TrayExecByTray 1 1"]
      const result = await service.generateMirroredCommands(commands)
      expect(result).toEqual(
        "Target_Enemy_Near $$ +TrayExecByTray 1 0 $$ +TrayExecByTray 1 1 $$ +TrayExecByTray 1 0"
      )
    })

    it('should handle multiple non-TrayExec commands', async () => {
      const commands = ["Target_Enemy_Near", "FirePhasers", "+TrayExecByTray 1 0", "+TrayExecByTray 1 1"]
      const result = await service.generateMirroredCommands(commands)
      expect(result).toEqual(
        "Target_Enemy_Near $$ FirePhasers $$ +TrayExecByTray 1 0 $$ +TrayExecByTray 1 1 $$ +TrayExecByTray 1 0"
      )
    })

    it('should handle TrayExec with + prefix', async () => {
      const commands = ["Target_Enemy_Near", "+TrayExecByTray 1 0", "+TrayExecByTray 1 1"]
      const result = await service.generateMirroredCommands(commands)
      expect(result).toEqual(
        "Target_Enemy_Near $$ +TrayExecByTray 1 0 $$ +TrayExecByTray 1 1 $$ +TrayExecByTray 1 0"
      )
    })
  })

  describe('Individual command exclusion', () => {
    it('should handle excluded TrayExec command with before-pre-pivot placement', async () => {
      const commands = [
        "+TrayExecByTray 1 0",
        { command: "+TrayExecByTray 1 1", palindromicGeneration: false, placement: "before-pre-pivot" },
        "+TrayExecByTray 1 2"
      ]
      const result = await service.generateMirroredCommands(commands)
      expect(result).toEqual(
        "+TrayExecByTray 1 1 $$ +TrayExecByTray 1 0 $$ +TrayExecByTray 1 2 $$ +TrayExecByTray 1 0"
      )
    })

    it('should handle excluded TrayExec command with in-pivot-group placement', async () => {
      const commands = [
        "+TrayExecByTray 1 0",
        { command: "+TrayExecByTray 1 1", palindromicGeneration: false, placement: "in-pivot-group" },
        "+TrayExecByTray 1 2"
      ]
      const result = await service.generateMirroredCommands(commands)
      expect(result).toEqual(
        "+TrayExecByTray 1 0 $$ +TrayExecByTray 1 2 $$ +TrayExecByTray 1 1 $$ +TrayExecByTray 1 2 $$ +TrayExecByTray 1 0"
      )
    })

    it('should handle mixed excluded TrayExec placements', async () => {
      const commands = [
        { command: "+TrayExecByTray 1 0", palindromicGeneration: false, placement: "before-pre-pivot" },
        "+TrayExecByTray 1 1",
        { command: "+TrayExecByTray 1 2", palindromicGeneration: false, placement: "in-pivot-group" }
      ]
      const result = await service.generateMirroredCommands(commands)
      expect(result).toEqual(
        "+TrayExecByTray 1 0 $$ +TrayExecByTray 1 1 $$ +TrayExecByTray 1 2 $$ +TrayExecByTray 1 1"
      )
    })

    it('should use pivot group when specified, even with single TrayExec left', async () => {
      const commands = [
        "+TrayExecByTray 1 0",
        { command: "+TrayExecByTray 1 1", palindromicGeneration: false, placement: "in-pivot-group" }
      ]
      const result = await service.generateMirroredCommands(commands)
      expect(result).toEqual("+TrayExecByTray 1 0 $$ +TrayExecByTray 1 1 $$ +TrayExecByTray 1 0")
    })
  })

  describe('Complex scenarios', () => {
    it('should handle mixed non-TrayExec and excluded TrayExec commands', async () => {
      const commands = [
        "Target_Enemy_Near",
        { command: "+TrayExecByTray 1 0", palindromicGeneration: false, placement: "before-pre-pivot" },
        "+TrayExecByTray 1 1",
        "+TrayExecByTray 1 2",
        "FirePhasers"
      ]
      const result = await service.generateMirroredCommands(commands)
      expect(result).toEqual(
        "Target_Enemy_Near $$ +TrayExecByTray 1 0 $$ FirePhasers $$ +TrayExecByTray 1 1 $$ +TrayExecByTray 1 2 $$ +TrayExecByTray 1 1"
      )
    })

    it('should handle all commands excluded from palindrome', async () => {
      const commands = [
        "Target_Enemy_Near",
        { command: "+TrayExecByTray 1 0", palindromicGeneration: false, placement: "before-pre-pivot" },
        { command: "+TrayExecByTray 1 1", palindromicGeneration: false, placement: "before-pre-pivot" }
      ]
      const result = await service.generateMirroredCommands(commands)
      expect(result).toEqual(
        "Target_Enemy_Near $$ +TrayExecByTray 1 0 $$ +TrayExecByTray 1 1"
      )
    })

    it('should handle single TrayExec command with non-TrayExec commands', async () => {
      const commands = [
        "Target_Enemy_Near",
        "+TrayExecByTray 1 0",
        "FirePhasers"
      ]
      const result = await service.generateMirroredCommands(commands)
      expect(result).toEqual(
        "Target_Enemy_Near $$ FirePhasers $$ +TrayExecByTray 1 0"
      )
    })

    it('should handle empty pivot group with regular TrayExec commands', async () => {
      const commands = [
        "+TrayExecByTray 1 0",
        "+TrayExecByTray 1 1",
        "+TrayExecByTray 1 2",
        "+TrayExecByTray 1 3"
      ]
      const result = await service.generateMirroredCommands(commands)
      expect(result).toEqual(
        "+TrayExecByTray 1 0 $$ +TrayExecByTray 1 1 $$ +TrayExecByTray 1 2 $$ +TrayExecByTray 1 3 $$ +TrayExecByTray 1 2 $$ +TrayExecByTray 1 1 $$ +TrayExecByTray 1 0"
      )
    })
  })

  describe('Edge cases', () => {
    it('should handle commands with only non-TrayExec types', async () => {
      const commands = ["Target_Enemy_Near", "FirePhasers", "ActivateShield"]
      const result = await service.generateMirroredCommands(commands)
      expect(result).toEqual(
        "Target_Enemy_Near $$ FirePhasers $$ ActivateShield"
      )
    })

    it('should handle empty string commands', async () => {
      const commands = ["", "+TrayExecByTray 1 0"]
      const result = await service.generateMirroredCommands(commands)
      expect(result).toEqual(" $$ +TrayExecByTray 1 0")
    })

    it('should handle rich objects without command property', async () => {
      const commands = [
        { command: "+TrayExecByTray 1 0" },
        { command: "+TrayExecByTray 1 1", palindromicGeneration: false }
      ]
      const result = await service.generateMirroredCommands(commands)
      expect(result).toEqual(
        "+TrayExecByTray 1 1 $$ +TrayExecByTray 1 0"
      )
    })

    it('should handle invalid objects in command array', async () => {
      const commands = [
        "+TrayExecByTray 1 0",
        null,
        undefined,
        { command: "+TrayExecByTray 1 1" },
        { invalid: "object" }
      ]
      const result = await service.generateMirroredCommands(commands)
      expect(result).toEqual(
        "+TrayExecByTray 1 0 $$ +TrayExecByTray 1 1 $$ +TrayExecByTray 1 0"
      )
    })
  })

  describe('Backward compatibility', () => {
    it('should handle old string-only command format', async () => {
      const commands = ["Target_Enemy_Near", "+TrayExecByTray 1 0", "+TrayExecByTray 1 1"]
      const result = await service.generateMirroredCommands(commands)
      expect(result).toEqual(
        "Target_Enemy_Near $$ +TrayExecByTray 1 0 $$ +TrayExecByTray 1 1 $$ +TrayExecByTray 1 0"
      )
    })

    it('should handle mixed string and rich object format', async () => {
      const commands = [
        "Target_Enemy_Near",
        "+TrayExecByTray 1 0",
        { command: "+TrayExecByTray 1 1", palindromicGeneration: false }
      ]
      const result = await service.generateMirroredCommands(commands)
      expect(result).toEqual(
        "Target_Enemy_Near $$ +TrayExecByTray 1 1 $$ +TrayExecByTray 1 0"
      )
    })
  })

  describe('Command normalization integration', () => {
    it('should call normalizeCommandsForDisplay with proper structure', async () => {
      const mockNormalize = vi.fn().mockResolvedValue(['cmd1', 'cmd2'])
      service.commandDisplayAdapter.normalizeCommandsForDisplay = mockNormalize

      const commands = ["+TrayExecByTray 1 0", "+TrayExecByTray 1 1"]
      await service.generateMirroredCommands(commands)

      expect(mockNormalize).toHaveBeenCalledWith([
        { command: "+TrayExecByTray 1 0" },
        { command: "+TrayExecByTray 1 1" },
        { command: "+TrayExecByTray 1 0" }
      ])
    })

    it('should handle normalizeCommandsForDisplay for single command', async () => {
      const mockNormalize = vi.fn().mockResolvedValue(['Target_Enemy_Near'])
      service.commandDisplayAdapter.normalizeCommandsForDisplay = mockNormalize

      const commands = ["Target_Enemy_Near"]
      await service.generateMirroredCommands(commands)

      expect(mockNormalize).toHaveBeenCalledWith([{ command: "Target_Enemy_Near" }])
    })
  })
})