import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import { createServiceFixture } from '../../fixtures/index.js'
import VFXManagerService from '../../../src/js/components/services/VFXManagerService.js'

// Mock VFX_EFFECTS data for testing
const VFX_EFFECTS = {
  space: [
    { effect: 'Bloom' },
    { effect: 'FX_A' },
    { effect: 'engine_glow' }
  ],
  ground: [
    { effect: 'FX_GreenSmoke' },
    { effect: 'FX_B' },
    { effect: 'ground_sparkles' }
  ]
}

describe('VFXManagerService', () => {
  let fixture, service, eventBusFixture

  beforeEach(() => {
    // Set up VFX_EFFECTS on window object for testing
    window.VFX_EFFECTS = VFX_EFFECTS

    fixture = createServiceFixture()
    eventBusFixture = fixture.eventBusFixture
    service = new VFXManagerService(eventBusFixture.eventBus)
    service.init()
  })

  afterEach(() => {
    fixture.destroy()
    // Clean up window.VFX_EFFECTS to avoid test interference
    delete window.VFX_EFFECTS
  })

  it('should toggle effect selection', () => {
    service.toggleEffect('space', 'Bloom')
    expect(service.selectedEffects.space.has('Bloom')).toBe(true)

    service.toggleEffect('space', 'Bloom')
    expect(service.selectedEffects.space.has('Bloom')).toBe(false)
  })

  it('should generate alias command with and without PlayerSay', () => {
    service.toggleEffect('ground', 'FX_GreenSmoke')

    let cmd = service.generateAliasCommand('ground')
    expect(cmd).toEqual(['dynFxSetFXExlusionList FX_GreenSmoke'])

    service.showPlayerSay = true
    cmd = service.generateAliasCommand('ground')
    expect(cmd).toEqual(['dynFxSetFXExlusionList FX_GreenSmoke', 'PlayerSay VFX Suppression Loaded'])
  })

  it('should combine effects across environments', () => {
    service.toggleEffect('space', 'FX_A')
    service.toggleEffect('ground', 'FX_B')

    const combined = service.generateCombinedAliasCommand(['space', 'ground'])
    expect(combined).toEqual(['dynFxSetFXExlusionList FX_A,FX_B'])
  })

  it('should emit modal:hide after saveEffects', async () => {
    // Set up some effects to save
    service.toggleEffect('space', 'Bloom')
    service.cache.currentProfile = 'test-profile'

    // Mock the data coordinator requests
    service.request = vi.fn(async (topic) => {
      if (topic === 'data:get-all-profiles') {
        return {
          'test-profile': { id: 'test-profile', name: 'Test Profile' }
        }
      }
      if (topic === 'data:update-profile') {
        return { success: true }
      }
      return null
    })

    await service.saveEffects()

    // Verify modal:hide event was emitted
    eventBusFixture.expectEvent('modal:hide', { modalId: 'vertigoModal' })
  })

  it('should select all effects for an environment using window.VFX_EFFECTS', () => {
    // Test that selectAllEffects works with explicit window.VFX_EFFECTS access
    // Regression test for: VFX_MANAGER_UNDEFINED_REFERENCE bug
    service.selectAllEffects('space')
    const selectedSpaceEffects = Array.from(service.selectedEffects.space)
    expect(selectedSpaceEffects.length).toBeGreaterThan(0)
    expect(selectedSpaceEffects).toContain('Bloom')
    expect(selectedSpaceEffects).toContain('FX_A')

    // Test ground environment
    service.selectAllEffects('ground')
    const selectedGroundEffects = Array.from(service.selectedEffects.ground)
    expect(selectedGroundEffects.length).toBeGreaterThan(0)
    expect(selectedGroundEffects).toContain('FX_GreenSmoke')
    expect(selectedGroundEffects).toContain('FX_B')
  })

  it('should handle invalid environment errors in selectAllEffects', () => {
    // Test error handling for invalid environments
    expect(() => service.selectAllEffects('invalid')).toThrow('Invalid environment: invalid')
  })
}) 