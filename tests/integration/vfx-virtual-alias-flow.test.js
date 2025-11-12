import { describe, it, expect, beforeEach, vi } from 'vitest'
import VFXManagerService from '../../src/js/components/services/VFXManagerService.js'
import CommandLibraryService from '../../src/js/components/services/CommandLibraryService.js'
import CommandLibraryUI from '../../src/js/components/ui/CommandLibraryUI.js'

// Mock VFX effects data
global.VFX_EFFECTS = {
  space: [
    { effect: 'FX_SpaceTest', name: 'Test Space Effect' }
  ],
  ground: [
    { effect: 'FX_GroundTest', name: 'Test Ground Effect' }
  ]
}

describe('VFX Virtual Alias Integration Flow', () => {
  let mockEventBus
  let vfxService
  let commandLibraryService
  let commandLibraryUI

  beforeEach(async () => {
    // Create mock event bus
    mockEventBus = {
      events: {},
      listeners: new Map(), // Add listeners Map for requestResponse handler detection
      on: vi.fn((event, callback) => {
        if (!mockEventBus.events[event]) mockEventBus.events[event] = []
        mockEventBus.events[event].push(callback)

        // Special handling for RPC events - also store in listeners Map
        if (event.startsWith('rpc:')) {
          if (!mockEventBus.listeners.has(event)) {
            mockEventBus.listeners.set(event, [])
          }
          mockEventBus.listeners.get(event).push(callback)
        }

        return () => mockEventBus.off(event, callback)
      }),
      off: vi.fn((event, callback) => {
        if (mockEventBus.events[event]) {
          const index = mockEventBus.events[event].indexOf(callback)
          if (index > -1) mockEventBus.events[event].splice(index, 1)
        }
      }),
      emit: vi.fn((event, data) => {
        // Handle VFX virtual alias emission
        if (event === 'vfx:virtual-aliases-updated' && data.aliases) {
          mockEventBus.events['vfx:virtual-aliases-updated']?.forEach(callback => callback(data))
        }

        // Handle RPC pattern for all events
        if (event.startsWith('rpc:') && mockEventBus.listeners.has(event)) {
          // Call the registered RPC handlers
          const handlers = mockEventBus.listeners.get(event)
          handlers.forEach(handler => {
            try {
              // Simulate async handler behavior
              setTimeout(() => handler(data), 0)
            } catch (error) {
              console.error(`Error in RPC handler for ${event}:`, error)
            }
          })
        }

        // Regular event handling
        if (mockEventBus.events[event]) {
          mockEventBus.events[event].forEach(callback => callback(data))
        }
      }),

      // Add mock respond function for VFX service
      respond: vi.fn((topic, handler) => {
        const rpcTopic = `rpc:${topic}`
        if (!mockEventBus.listeners.has(rpcTopic)) {
          mockEventBus.listeners.set(rpcTopic, [])
        }
        mockEventBus.listeners.get(rpcTopic).push(handler)

        return () => { // Return detach function
          if (mockEventBus.listeners.has(rpcTopic)) {
            const handlers = mockEventBus.listeners.get(rpcTopic)
            const index = handlers.indexOf(handler)
            if (index > -1) {
              handlers.splice(index, 1)
            }
          }
        }
      })
    }

    // Create services
    const mockI18n = { t: vi.fn((key, params) => key) }
    vfxService = new VFXManagerService(mockEventBus, mockI18n)
    await vfxService.init()

    commandLibraryService = new CommandLibraryService({
      storage: {},
      eventBus: mockEventBus,
      i18n: { t: (key, opts) => opts?.defaultValue || key },
      ui: {},
      modalManager: {}
    })
    await commandLibraryService.init()

    commandLibraryUI = new CommandLibraryUI({
      service: commandLibraryService,
      eventBus: mockEventBus,
      ui: {},
      modalManager: {},
      document: {
        getElementById: vi.fn(() => null),
        createElement: vi.fn(() => ({ className: '', dataset: {} })),
        createDocumentFragment: vi.fn(() => ({ appendChild: vi.fn() }))
      }
    })
    await commandLibraryUI.init()
  })

  it('should propagate VFX virtual aliases to CommandLibraryUI when VFX settings change', async () => {
    // Set up spies
    const commandLibraryUpdateSpy = vi.spyOn(commandLibraryUI, 'updateCommandLibrary')

    // Add some VFX effects
    vfxService.toggleEffect('space', 'FX_SpaceTest')
    vfxService.toggleEffect('ground', 'FX_GroundTest')

    // Verify initial virtual aliases exist
    const virtualAliases = vfxService.getVirtualVFXAliases()
    expect(virtualAliases).toHaveProperty('dynFxSetFXExclusionList_Space')
    expect(virtualAliases).toHaveProperty('dynFxSetFXExclusionList_Ground')
    expect(virtualAliases).toHaveProperty('dynFxSetFXExclusionList_Combined')

    // Clear the emit call history before the test
    mockEventBus.emit.mockClear()

    // Simulate VFX settings change (like when user saves VFX effects)
    mockEventBus.emit('vfx:settings-changed', {
      selectedEffects: {
        space: ['FX_SpaceTest'],
        ground: ['FX_GroundTest']
      },
      showPlayerSay: false
    })

    // Wait for async operations to complete - RPC requests and responses
    await new Promise(resolve => setTimeout(resolve, 50))

    // Find the aliases-changed event call among all emit calls
    const aliasesChangedCalls = mockEventBus.emit.mock.calls.filter(call => call[0] === 'aliases-changed')
    expect(aliasesChangedCalls.length).toBeGreaterThan(0)

    // Verify that aliases-changed event was emitted with correct structure
    const aliasesChangedCall = aliasesChangedCalls[aliasesChangedCalls.length - 1]
    expect(aliasesChangedCall[0]).toBe('aliases-changed')
    expect(aliasesChangedCall[1]).toEqual(
      expect.objectContaining({
        aliases: expect.objectContaining({
          dynFxSetFXExclusionList_Space: expect.objectContaining({
            type: 'vfx-alias',
            virtual: true,
            commands: ['dynFxSetFXExlusionList FX_SpaceTest']
          }),
          dynFxSetFXExclusionList_Ground: expect.objectContaining({
            type: 'vfx-alias',
            virtual: true,
            commands: ['dynFxSetFXExlusionList FX_GroundTest']
          }),
          dynFxSetFXExclusionList_Combined: expect.objectContaining({
            type: 'vfx-alias',
            virtual: true,
            commands: ['dynFxSetFXExlusionList FX_SpaceTest,FX_GroundTest']
          })
        })
      })
    )

    // Verify that CommandLibraryUI received the event and updated
    expect(commandLibraryUpdateSpy).toHaveBeenCalled()

    // Verify that the UI can get the virtual aliases via the service (actual behavior)
    const combinedAliases = await commandLibraryService.getCombinedAliases()
    expect(combinedAliases).toHaveProperty('dynFxSetFXExclusionList_Space')
    expect(combinedAliases.dynFxSetFXExclusionList_Space.type).toBe('vfx-alias')
    expect(combinedAliases.dynFxSetFXExclusionList_Space.virtual).toBe(true)
    expect(combinedAliases.dynFxSetFXExclusionList_Space.commands).toEqual(['dynFxSetFXExlusionList FX_SpaceTest'])
  })

  it('should handle VFX virtual aliases request from CommandLibraryService', async () => {
    // Add VFX effects
    vfxService.toggleEffect('space', 'FX_SpaceTest')

    // Debug: Check what's actually happening
    const combinedAliases = await commandLibraryService.getCombinedAliases()
    console.log('Combined aliases:', JSON.stringify(combinedAliases, null, 2))

    expect(combinedAliases).toHaveProperty('dynFxSetFXExclusionList_Space')
    expect(combinedAliases.dynFxSetFXExclusionList_Space).toEqual({
      commands: ['dynFxSetFXExlusionList FX_SpaceTest'],
      description: 'vfx_suppression_for_environment',
      type: 'vfx-alias',
      virtual: true
    })
  })

  it('should generate virtual aliases with correct command format', () => {
    // Add multiple effects
    vfxService.toggleEffect('space', 'FX_SpaceTest')
    vfxService.toggleEffect('ground', 'FX_GroundTest')
    vfxService.showPlayerSay = true

    const virtualAliases = vfxService.getVirtualVFXAliases()

    // Check space alias
    expect(virtualAliases.dynFxSetFXExclusionList_Space.commands).toEqual([
      'dynFxSetFXExlusionList FX_SpaceTest',
      'PlayerSay VFX Suppression Loaded'
    ])

    // Check combined alias
    expect(virtualAliases.dynFxSetFXExclusionList_Combined.commands).toEqual([
      'dynFxSetFXExlusionList FX_SpaceTest,FX_GroundTest',
      'PlayerSay VFX Suppression Loaded'
    ])
  })
})