import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import { createEventBusFixture } from '../../fixtures/index.js'
import InterfaceModeService from '../../../src/js/components/services/InterfaceModeService.js'


describe('InterfaceModeService', () => {
  let service, eventBusFixture

  beforeEach(() => {
    eventBusFixture = createEventBusFixture()

    service = new InterfaceModeService({ eventBus: eventBusFixture.eventBus })

    // Stub out network/storage request made by switchMode
    service.request = vi.fn(async (topic) => {
      if (topic === 'data:update-profile') {
        return { success: true }
      }
      return null
    })

    // Initialize the service to set up listeners
    service.init()
  })

  afterEach(() => {
    vi.clearAllMocks()
    eventBusFixture.destroy()
  })

  it('should switch to a new mode and emit environment:changed', async () => {
    await service.switchMode('ground')

    expect(service.currentMode).toBe('ground')
    eventBusFixture.expectEvent('environment:changed', { environment: 'ground' })
  })

  it('should not emit environment:changed when switching to the same mode', async () => {
    // Spy on emit to detect additional calls
    const emitSpy = vi.spyOn(service, 'emit')

    // Already in default "space" mode – switch to same value
    await service.switchMode('space')
    expect(emitSpy).not.toHaveBeenCalled()
  })
}) 