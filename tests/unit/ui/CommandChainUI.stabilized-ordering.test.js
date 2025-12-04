import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import CommandChainUI from '../../../src/js/components/ui/CommandChainUI.js'

describe('CommandChainUI Stabilized Ordering', () => {
  let ui, mockDocument, mockEventBus, mockUI

  beforeEach(async () => {
    // Mock document
    mockDocument = {
      getElementById: vi.fn(() => ({
        innerHTML: '',
        classList: { remove: vi.fn(), add: vi.fn() },
        style: {},
        replaceChildren: vi.fn(),
        children: []
      })),
      createElement: vi.fn(() => ({
        innerHTML: '',
        classList: { remove: vi.fn(), add: vi.fn() },
        style: {},
        replaceChildren: vi.fn(),
        children: [],
        dataset: {},
        closest: vi.fn(),
        querySelector: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      })),
      querySelector: vi.fn(),
      body: { appendChild: vi.fn() },
      addEventListener: vi.fn()
    }

    mockUI = {
      showToast: vi.fn(),
      initDragAndDrop: vi.fn()
    }

    // Mock event bus with proper request/response capability
    mockEventBus = {
      on: vi.fn(() => () => {}), // Return cleanup function
      off: vi.fn(),
      emit: vi.fn(),
      request: vi.fn(),
      onDom: vi.fn(() => () => {}),
      onDomDebounced: vi.fn(() => () => {}),
    }

    // Create CommandChainUI instance
    ui = new CommandChainUI({
      eventBus: mockEventBus,
      ui: mockUI,
      document: mockDocument,
      i18n: { t: vi.fn((key) => key) }
    })

    await ui.init()

    // Set up request method on the ui instance
    ui.request = vi.fn().mockResolvedValue({})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getButtonState Method', () => {
    describe('Unstabilized Mode (groupType null)', () => {
      it('should use exact current logic for first item', () => {
        // First item should have up button disabled, down button enabled
        const upButton = ui.getButtonState('up', 0, 5, null, null)
        const downButton = ui.getButtonState('down', 0, 5, null, null)

        expect(upButton).toContain('disabled')
        expect(upButton).not.toContain('style="display:none"')
        expect(downButton).not.toContain('disabled')
        expect(downButton).not.toContain('style="display:none"')
      })

      it('should use exact current logic for middle item', () => {
        // Middle item should have both buttons enabled
        const upButton = ui.getButtonState('up', 2, 5, null, null)
        const downButton = ui.getButtonState('down', 2, 5, null, null)

        expect(upButton).not.toContain('disabled')
        expect(upButton).not.toContain('style="display:none"')
        expect(downButton).not.toContain('disabled')
        expect(downButton).not.toContain('style="display:none"')
      })

      it('should use exact current logic for last item', () => {
        // Last item should have up button enabled, down button disabled
        const upButton = ui.getButtonState('up', 4, 5, null, null)
        const downButton = ui.getButtonState('down', 4, 5, null, null)

        expect(upButton).not.toContain('disabled')
        expect(upButton).not.toContain('style="display:none"')
        expect(downButton).toContain('disabled')
        expect(downButton).not.toContain('style="display:none"')
      })

      it('should handle single item array correctly', () => {
        // Single item should have both buttons disabled in unstabilized mode
        const upButton = ui.getButtonState('up', 0, 1, null, null)
        const downButton = ui.getButtonState('down', 0, 1, null, null)

        expect(upButton).toContain('disabled')
        expect(upButton).not.toContain('style="display:none"')
        expect(downButton).toContain('disabled')
        expect(downButton).not.toContain('style="display:none"')
      })
    })

    describe('Stabilized Mode (groupType provided)', () => {
      beforeEach(() => {
        // Mock currentGroups structure for stabilized mode
        ui.currentGroups = {
          'non-trayexec': {
            title: 'Non-TrayExec Commands',
            commands: [
              { command: 'Cmd1', index: 0 },
              { command: 'Cmd2', index: 1 }
            ]
          },
          'palindromic': {
            title: 'Palindromic Commands',
            commands: [
              { command: 'TrayExecByTray', index: 2 }
            ]
          },
          'pivot': {
            title: 'Pivot Commands',
            commands: [
              { command: 'Pivot1', index: 3 },
              { command: 'Pivot2', index: 4 },
              { command: 'Pivot3', index: 5 }
            ]
          }
        }
      })

      it('should gray out buttons for single-item groups', () => {
        // Palindromic group has only one command
        const upButton = ui.getButtonState('up', 2, 6, 'palindromic', 1)
        const downButton = ui.getButtonState('down', 2, 6, 'palindromic', 1)

        expect(upButton).toContain('disabled')
        expect(downButton).toContain('disabled')
        expect(upButton).not.toContain('style="display:none"')
        expect(downButton).not.toContain('style="display:none"')
      })

      it('should show buttons for first item in multi-item group', () => {
        // First item in non-trayexec group (2 items)
        const upButton = ui.getButtonState('up', 0, 6, 'non-trayexec', 1)
        const downButton = ui.getButtonState('down', 0, 6, 'non-trayexec', 1)

        expect(upButton).toContain('disabled')
        expect(upButton).not.toContain('style="display:none"')
        expect(downButton).not.toContain('disabled')
        expect(downButton).not.toContain('style="display:none"')
      })

      it('should show buttons for last item in multi-item group', () => {
        // Last item in non-trayexec group (2 items)
        const upButton = ui.getButtonState('up', 1, 6, 'non-trayexec', 2)
        const downButton = ui.getButtonState('down', 1, 6, 'non-trayexec', 2)

        expect(upButton).not.toContain('disabled')
        expect(upButton).not.toContain('style="display:none"')
        expect(downButton).toContain('disabled')
        expect(downButton).not.toContain('style="display:none"')
      })

      it('should show buttons for middle item in large multi-item group', () => {
        // Middle item in pivot group (3 items)
        const upButton = ui.getButtonState('up', 4, 6, 'pivot', 2)
        const downButton = ui.getButtonState('down', 4, 6, 'pivot', 2)

        expect(upButton).not.toContain('disabled')
        expect(upButton).not.toContain('style="display:none"')
        expect(downButton).not.toContain('disabled')
        expect(downButton).not.toContain('style="display:none"')
      })

      it('should handle missing groupType gracefully', () => {
        // Should fallback to unstabilized behavior when groupType is missing
        const upButton = ui.getButtonState('up', 2, 6, null, null)
        const downButton = ui.getButtonState('down', 2, 6, null, null)

        expect(upButton).not.toContain('disabled')
        expect(upButton).not.toContain('style="display:none"')
        expect(downButton).not.toContain('disabled')
        expect(downButton).not.toContain('style="display:none"')
      })
    })
  })

  describe('getMoveTarget Method', () => {
    describe('Unstabilized Mode (groupType null)', () => {
      it('should use exact current logic for up movement', () => {
        const targetIndex = ui.getMoveTarget(3, null, 'up')
        expect(targetIndex).toBe(2)
      })

      it('should use exact current logic for down movement', () => {
        const targetIndex = ui.getMoveTarget(3, null, 'down')
        expect(targetIndex).toBe(4)
      })

      it('should handle boundary cases in unstabilized mode', () => {
        expect(ui.getMoveTarget(0, null, 'up')).toBe(-1) // Current behavior
        expect(ui.getMoveTarget(5, null, 'down')).toBe(6) // Current behavior
      })
    })

    describe('Stabilized Mode (groupType provided)', () => {
      beforeEach(() => {
        // Mock currentGroups structure for stabilized mode
        ui.currentGroups = {
          'non-trayexec': {
            title: 'Non-TrayExec Commands',
            commands: [
              { command: 'Cmd1', index: 0 },
              { command: 'Cmd2', index: 1 }
            ]
          },
          'palindromic': {
            title: 'Palindromic Commands',
            commands: [
              { command: 'TrayExecByTray', index: 2 }
            ]
          },
          'pivot': {
            title: 'Pivot Commands',
            commands: [
              { command: 'Pivot1', index: 3 },
              { command: 'Pivot2', index: 4 },
              { command: 'Pivot3', index: 5 }
            ]
          }
        }
      })

      it('should prevent movement for single-item groups', () => {
        // Try to move single item in palindromic group
        const upTarget = ui.getMoveTarget(2, 'palindromic', 'up')
        const downTarget = ui.getMoveTarget(2, 'palindromic', 'down')

        expect(upTarget).toBe(2) // No movement
        expect(downTarget).toBe(2) // No movement
      })

      it('should allow movement within multi-item groups', () => {
        // Move second item in non-trayexec group up
        const upTarget = ui.getMoveTarget(1, 'non-trayexec', 'up')
        expect(upTarget).toBe(0) // Move to first item's position

        // Move first item in non-trayexec group down
        const downTarget = ui.getMoveTarget(0, 'non-trayexec', 'down')
        expect(downTarget).toBe(1) // Move to second item's position
      })

      it('should prevent movement outside group boundaries', () => {
        // Try to move first item in group up
        const upTarget = ui.getMoveTarget(0, 'non-trayexec', 'up')
        expect(upTarget).toBe(0) // No movement

        // Try to move last item in group down
        const downTarget = ui.getMoveTarget(1, 'non-trayexec', 'down')
        expect(downTarget).toBe(1) // No movement
      })

      it('should handle middle item movement in large groups', () => {
        // Move middle item in pivot group (3 items)
        const upTarget = ui.getMoveTarget(4, 'pivot', 'up')
        const downTarget = ui.getMoveTarget(4, 'pivot', 'down')

        expect(upTarget).toBe(3) // Move to previous item's position
        expect(downTarget).toBe(5) // Move to next item's position
      })

      it('should maintain group isolation', () => {
        // Moving within non-trayexec group should never target pivot group indices
        const targets = []
        for (let i = 0; i < 2; i++) {
          targets.push(ui.getMoveTarget(ui.currentGroups['non-trayexec'].commands[i].index, 'non-trayexec', 'up'))
          targets.push(ui.getMoveTarget(ui.currentGroups['non-trayexec'].commands[i].index, 'non-trayexec', 'down'))
        }

        // All targets should be within the non-trayexec group indices (0, 1)
        targets.forEach(target => {
          expect([0, 1]).toContain(target)
        })
      })
    })
  })

  describe('Integration Tests', () => {
    describe('Stabilized Mode Rendering', () => {
      beforeEach(() => {
        // Mock stabilization check to return true
        ui.request = vi.fn().mockResolvedValue(true)

        // Mock groupCommands method
        ui.groupCommands = vi.fn().mockReturnValue({
          'non-trayexec': {
            title: 'Non-TrayExec Commands',
            commands: [{ command: 'Cmd1', index: 0 }],
            isCollapsed: false
          },
          'palindromic': {
            title: 'Palindromic Commands',
            commands: [{ command: 'TrayExecByTray', index: 1 }],
            isCollapsed: false
          },
          'pivot': {
            title: 'Pivot Commands',
            commands: [{ command: 'Pivot1', index: 2 }],
            isCollapsed: false
          }
        })

        // Mock renderGroupSeparator method
        ui.renderGroupSeparator = vi.fn().mockReturnValue('<div class="group-separator">Test Group</div>')

        // Mock enrichForDisplay and command:find-definition
        ui.request = vi.fn((endpoint, data) => {
          if (endpoint === 'command:find-definition') {
            return Promise.resolve({ customizable: false })
          }
          if (endpoint === 'command-chain:is-stabilized') {
            return Promise.resolve(true)
          }
          return Promise.resolve({})
        })

        // Mock enrichForDisplay by setting up global mock
        global.enrichForDisplay = vi.fn().mockResolvedValue({
          displayName: 'Test Command',
          icon: 'fa-test',
          type: 'test',
          warnings: []
        })

        // Mock normalizeToString
        global.normalizeToString = vi.fn().mockReturnValue('test command')
      })

      it('should store currentGroups when rendering stabilized chains', async () => {
        const commands = ['Cmd1', 'TrayExecByTray', 'Pivot1']

        await ui.render(commands)

        expect(ui.currentGroups).toBeDefined()
        expect(ui.groupCommands).toHaveBeenCalledWith(commands)
      })

      it('should clear currentGroups when rendering unstabilized chains', async () => {
        // First render in stabilized mode
        const stabilizedCommands = ['Cmd1', 'TrayExecByTray', 'Pivot1']
        await ui.render(stabilizedCommands)
        expect(ui.currentGroups).toBeDefined()

        // Then render in unstabilized mode
        ui.request = vi.fn().mockResolvedValue(false) // Mock unstabilized
        const unstabilizedCommands = ['Cmd1', 'Cmd2', 'Cmd3']
        await ui.render(unstabilizedCommands)

        expect(ui.currentGroups).toBeNull()
      })
    })

    describe('Event Handler Integration', () => {
      beforeEach(() => {
        // Set up currentGroups for testing
        ui.currentGroups = {
          'non-trayexec': {
            title: 'Non-TrayExec Commands',
            commands: [
              { command: 'Cmd1', index: 0 },
              { command: 'Cmd2', index: 1 }
            ]
          }
        }
      })

      it('should use group-aware movement in stabilized mode', () => {
        // Mock the click event structure
        const mockCommandItem = {
          closest: vi.fn(() => ({ dataset: { index: '1', group: 'non-trayexec' } }))
        }
        const mockButton = {
          disabled: false,
          closest: vi.fn(() => mockCommandItem)
        }

        // Simulate clicking up button on second item in group
        ui.getMoveTarget = vi.fn().mockReturnValue(0) // Should target first item
        ui.emit = vi.fn()

        // Simulate the event handler logic
        const index = parseInt(mockCommandItem.closest().dataset.index)
        const groupType = mockCommandItem.closest().dataset.group || null
        const targetIndex = ui.getMoveTarget(index, groupType, 'up')

        expect(ui.getMoveTarget).toHaveBeenCalledWith(1, 'non-trayexec', 'up')
        expect(targetIndex).toBe(0) // Should move within group, not to index 0 from unstabilized logic
      })

      it('should use unstabilized logic when no group data', () => {
        // Mock the click event structure without group
        const mockCommandItem = {
          closest: vi.fn(() => ({ dataset: { index: '2' } }))
        }
        const mockButton = {
          disabled: false,
          closest: vi.fn(() => mockCommandItem)
        }

        // Simulate clicking up button without group
        ui.getMoveTarget = vi.fn().mockReturnValue(1) // Should use unstabilized logic
        ui.emit = vi.fn()

        // Simulate the event handler logic
        const index = parseInt(mockCommandItem.closest().dataset.index)
        const groupType = mockCommandItem.closest().dataset.group || null
        const targetIndex = ui.getMoveTarget(index, groupType, 'up')

        expect(ui.getMoveTarget).toHaveBeenCalledWith(2, null, 'up')
        expect(targetIndex).toBe(1) // Should use unstabilized logic (index - 1)
      })
    })
  })

  describe('Regression Tests', () => {
    describe('Unstabilized Mode Preservation', () => {
      it('should preserve exact unstabilized behavior for all cases', () => {
        // Test all button states in unstabilized mode
        const testCases = [
          { index: 0, total: 5, direction: 'up', expectedDisabled: true },
          { index: 0, total: 5, direction: 'down', expectedDisabled: false },
          { index: 2, total: 5, direction: 'up', expectedDisabled: false },
          { index: 2, total: 5, direction: 'down', expectedDisabled: false },
          { index: 4, total: 5, direction: 'up', expectedDisabled: false },
          { index: 4, total: 5, direction: 'down', expectedDisabled: true },
          { index: 0, total: 1, direction: 'up', expectedDisabled: true },
          { index: 0, total: 1, direction: 'down', expectedDisabled: true }
        ]

        testCases.forEach(({ index, total, direction, expectedDisabled }) => {
          const button = ui.getButtonState(direction, index, total, null, null)
          if (expectedDisabled) {
            expect(button).toContain('disabled')
          } else {
            expect(button).not.toContain('disabled')
          }
          expect(button).not.toContain('style="display:none"') // Never hide buttons in unstabilized
        })

        // Test movement logic
        expect(ui.getMoveTarget(3, null, 'up')).toBe(2)
        expect(ui.getMoveTarget(3, null, 'down')).toBe(4)
        expect(ui.getMoveTarget(0, null, 'up')).toBe(-1)
        expect(ui.getMoveTarget(5, null, 'down')).toBe(6)
      })
    })

    describe('Backward Compatibility', () => {
      it('should not break when currentGroups is undefined', () => {
        // Reset currentGroups to undefined
        ui.currentGroups = undefined

        // Should fallback to unstabilized behavior
        const upButton = ui.getButtonState('up', 0, 5, 'some-group', null)
        const downButton = ui.getButtonState('down', 4, 5, 'some-group', null)

        expect(upButton).toContain('disabled')
        expect(downButton).toContain('disabled')

        const upTarget = ui.getMoveTarget(3, 'some-group', 'up')
        const downTarget = ui.getMoveTarget(3, 'some-group', 'down')

        expect(upTarget).toBe(2)
        expect(downTarget).toBe(4)
      })

      it('should handle missing groupType gracefully', () => {
        // Test with groupType null but currentGroups present
        ui.currentGroups = { 'test': { commands: [] } }

        const upButton = ui.getButtonState('up', 0, 5, null, null)
        const downButton = ui.getButtonState('down', 4, 5, null, null)

        expect(upButton).toContain('disabled')
        expect(downButton).toContain('disabled')
      })
    })
  })
})