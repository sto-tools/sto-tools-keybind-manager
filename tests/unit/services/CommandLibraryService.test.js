import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import { createServiceFixture } from '../../fixtures/index.js'
import CommandLibraryService from '../../../src/js/components/services/CommandLibraryService.js'


describe('CommandLibraryService', () => {
  let fixture, service, eventBusFixture

  beforeEach(() => {
    fixture = createServiceFixture()
    eventBusFixture = fixture.eventBusFixture

    // Simple i18n stub that returns the default value
    const i18nStub = { t: (_key, { defaultValue }) => defaultValue }

    service = new CommandLibraryService({ eventBus: eventBusFixture.eventBus, i18n: i18nStub })

    const mockCommands = {
      general: {
        commands: {
          FireAll: {
            command: 'FireAll',
            name: 'Fire All Weapons',
            description: 'Fire everything'
          }
        }
      }
    }

    // Stub the request helper so the service thinks DataService is available
    service.request = vi.fn(async (topic) => {
      if (topic === 'data:has-commands') return true
      if (topic === 'data:get-commands') return mockCommands
      return null
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    fixture.destroy()
  })

  it('should return command categories via getCommandCategories', async () => {
    const categories = await service.getCommandCategories()
    expect(categories).toHaveProperty('general')
  })

  it('should find command definition when provided with a command string', async () => {
    const def = await service.findCommandDefinition('FireAll')
    expect(def).toBeTruthy()
    expect(def.name).toBe('Fire All Weapons')
    expect(def.commandId).toBe('FireAll')
  })

  it('should generate unique command IDs', () => {
    const id1 = service.generateCommandId()
    const id2 = service.generateCommandId()
    expect(id1).not.toEqual(id2)
  })
}) 