import { describe, it, beforeEach, afterEach, expect } from 'vitest'
import { createEventBusFixture } from '../../fixtures/index.js'
import VFXManagerService from '../../../src/js/components/services/VFXManagerService.js'


describe('VFXManagerService', () => {
  let service, eventBusFixture

  beforeEach(() => {
    eventBusFixture = createEventBusFixture()
    service = new VFXManagerService(eventBusFixture.eventBus)
    service.init()
  })

  afterEach(() => {
    eventBusFixture.destroy()
  })

  it('should toggle effect selection', () => {
    service.toggleEffect('space', 'Bloom')
    expect(service.getSelectedEffects('space')).toContain('Bloom')

    service.toggleEffect('space', 'Bloom')
    expect(service.getSelectedEffects('space')).not.toContain('Bloom')
  })

  it('should generate alias command with and without PlayerSay', () => {
    service.toggleEffect('ground', 'FX_GreenSmoke')

    let cmd = service.generateAliasCommand('ground')
    expect(cmd).toBe('dynFxSetFXExclusionList FX_GreenSmoke')

    service.showPlayerSay = true
    cmd = service.generateAliasCommand('ground')
    expect(cmd).toBe('dynFxSetFXExclusionList FX_GreenSmoke $$ PlayerSay VFX Suppression Loaded')
  })

  it('should combine effects across environments', () => {
    service.toggleEffect('space', 'FX_A')
    service.toggleEffect('ground', 'FX_B')

    const combined = service.generateCombinedAliasCommand(['space', 'ground'])
    expect(combined).toBe('dynFxSetFXExclusionList FX_A,FX_B')
  })

  it('should emit modal:hide after cancelEffects', () => {
    // store initial state
    service.initialState = {
      selectedEffects: { space: new Set(), ground: new Set() },
      showPlayerSay: false
    }
    service.cancelEffects()
    eventBusFixture.expectEvent('modal:hide', { modalId: 'vertigoModal' })
  })
}) 