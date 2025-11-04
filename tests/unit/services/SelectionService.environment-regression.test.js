import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createServiceFixture } from '../../fixtures/services/harness.js'
import SelectionService from '../../../src/js/components/services/SelectionService.js'

describe('SelectionService Environment Regression', () => {
  let harness
  let selectionService

  beforeEach(async () => {
    harness = createServiceFixture()
    selectionService = new SelectionService({ eventBus: harness.eventBus })
    await selectionService.init()

    selectionService.cache.currentProfile = 'test-profile'
    selectionService.cache.currentEnvironment = 'space'
    selectionService.cache.builds = {
      space: { keys: { F10: ['FireAll'], F12: ['Spare'] } },
      ground: { keys: { F11: ['Sprint'], F13: ['Jump'] } }
    }
    selectionService.cache.keys = selectionService.cache.builds.space.keys
    selectionService.cache.profile = {
      id: 'test-profile',
      selections: {},
      builds: selectionService.cache.builds
    }

    selectionService.request = vi.fn(async (topic, payload) => {
      if (topic === 'data:update-profile') {
        const selections = payload?.properties?.selections || {}
        selectionService.cache.profile.selections = {
          ...selectionService.cache.profile.selections,
          ...selections
        }
        return { success: true }
      }
      return { success: true }
    })
  })

  afterEach(() => {
    harness?.destroy?.()
  })

  it('should restore the last selection for each environment when environment:changed events fire', async () => {
    await selectionService.selectKey('F10', 'space')

    harness.eventBus.emit('environment:changed', {
      fromEnvironment: 'space',
      toEnvironment: 'ground',
      environment: 'ground'
    })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(selectionService.getCachedSelection('space')).toBe('F10')
    expect(selectionService.cache.currentEnvironment).toBe('ground')

    await selectionService.selectKey('F11', 'ground')
    expect(selectionService.getCachedSelection('space')).toBe('F10')
    expect(selectionService.getCachedSelection('ground')).toBe('F11')

    harness.eventBus.emit('environment:changed', {
      fromEnvironment: 'ground',
      toEnvironment: 'space',
      environment: 'space'
    })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(selectionService.cache.currentEnvironment).toBe('space')
    expect(selectionService.getCachedSelection('space')).toBe('F10')
    expect(selectionService.getCachedSelection('ground')).toBe('F11')

    expect(selectionService.cache.selectedKey).toBe('F10')

    harness.eventBus.emit('environment:changed', {
      fromEnvironment: 'space',
      toEnvironment: 'ground',
      environment: 'ground'
    })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(selectionService.cache.selectedKey).toBe('F11')
  })
})
