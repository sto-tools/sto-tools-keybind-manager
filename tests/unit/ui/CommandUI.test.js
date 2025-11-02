import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import { createServiceFixture } from '../../fixtures/index.js'
import { respond } from '../../../src/js/core/requestResponse.js'
import CommandUI from '../../../src/js/components/ui/CommandUI.js'

function createStubUI() {
  return {
    showToast: vi.fn()
  }
}

describe('CommandUI', () => {
  let fixture, busFixture, eventBus, uiStub, commandUI

  beforeEach(async () => {
    fixture = createServiceFixture()
    busFixture = fixture.eventBusFixture
    eventBus = fixture.eventBus
    uiStub = createStubUI()
    commandUI = new CommandUI({ eventBus, ui: uiStub, modalManager: { show: vi.fn() } })
    commandUI.init()
    // Stub i18n translation requests
    respond(eventBus, 'i18n:translate', ({ key }) => {
      const defaults = {
        please_select_a_key_first: 'Please select a key first'
      }
      return defaults[key] || key
    })
  })

  afterEach(() => {
    fixture.destroy()
    vi.restoreAllMocks()
  })

  it('should show warning toast when adding static command without key selected', async () => {
    // Spy on the showToast method
    const showToastSpy = vi.spyOn(commandUI, 'showToast')

    eventBus.emit('command-add', { commandDef: { command: 'FireAll', name: 'Fire All' } })

    // microtask queue flush
    await new Promise(r => setTimeout(r, 0))

    expect(showToastSpy).toHaveBeenCalled()
  })

  it('should emit command:add event when key is selected', async () => {
    // Select a key first
    eventBus.emit('key-selected', { key: 'F1' })

    const cmdDef = { command: 'FireAll', name: 'Fire All' }
    eventBus.emit('command-add', { commandDef: cmdDef })

    await new Promise(r => setTimeout(r, 0))

    // showToast should not be called this time
    expect(uiStub.showToast).not.toHaveBeenCalledWith(expect.stringMatching(/select.*key/i), 'warning')

    // Verify command:add emitted with correct payload
    const events = busFixture.getEventsOfType('command:add')
    const match = events.find(e => e.data?.key === 'F1' && e.data?.command?.command === 'FireAll')
    expect(match).toBeDefined()
  })

  describe('bindset integration', () => {
    it('should include active bindset when adding commands to non-primary bindset', async () => {
      const mockCommand = { command: 'FireAll', type: 'basic' }
      
      // Set up UI state using the cache mechanism
      commandUI.cache = {
        selectedKey: 'F1',
        currentEnvironment: 'space'
      }
      commandUI._activeBindset = 'Custom Bindset'
      
      // Trigger command add
      eventBus.emit('command-add', { commandDef: mockCommand })
      
      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 0))
      
      // Verify command:add emitted with correct payload including bindset
      const events = busFixture.getEventsOfType('command:add')
      const match = events.find(e => e.data?.key === 'F1' && e.data?.bindset === 'Custom Bindset')
      expect(match).toBeDefined()
      expect(match.data.command).toEqual(mockCommand)
    })

    it('should not include bindset when in alias mode', async () => {
      const mockCommand = { command: 'FireAll', type: 'basic' }
      
      // Set up UI state for alias mode using the cache mechanism
      commandUI.cache = {
        selectedAlias: 'myalias',
        currentEnvironment: 'alias'
      }
      commandUI._activeBindset = 'Custom Bindset'
      
      // Trigger command add
      eventBus.emit('command-add', { commandDef: mockCommand })
      
      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 0))
      
      // Verify command:add emitted with null bindset for alias mode
      const events = busFixture.getEventsOfType('command:add')
      const match = events.find(e => e.data?.key === 'myalias' && e.data?.bindset === null)
      expect(match).toBeDefined()
      expect(match.data.command).toEqual(mockCommand)
    })

    it('should cache active bindset from bindset-selector:active-changed events', () => {
      expect(commandUI._activeBindset).toBe('Primary Bindset') // default
      
      eventBus.emit('bindset-selector:active-changed', { bindset: 'Test Bindset' })
      
      expect(commandUI._activeBindset).toBe('Test Bindset')
    })
  })
}) 