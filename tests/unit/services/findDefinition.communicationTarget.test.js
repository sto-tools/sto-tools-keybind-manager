import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServiceFixture } from '../../fixtures/index.js'
import CommandLibraryService from '../../../src/js/components/services/CommandLibraryService.js'
import { respond } from '../../../src/js/core/requestResponse.js'

let fixture, eventBus, cmdLib

beforeEach(async () => {
  fixture = createServiceFixture()
  eventBus = fixture.eventBus

  // Stub data:has-commands & data:get-commands
  respond(eventBus, 'data:has-commands', () => true)
  respond(eventBus, 'data:get-commands', () => ({
    targeting: {
      commands: {
        target: {
          command: 'Target',
          name: 'Target by Name',
          customizable: true,
          icon: '🎯'
        }
      }
    },
    communication: {
      commands: {
        communication: {
          command: 'team',
          name: 'Team Message',
          customizable: true,
          icon: '💬'
        }
      }
    }
  }))

  cmdLib = new CommandLibraryService({ eventBus, i18n: null })
})

afterEach(() => {
  fixture.destroy()
})

describe('CommandLibraryService.findCommandDefinition – Communication vs Target', () => {
  it('should NOT mis-classify communication with $Target as Target command', async () => {
    const def = await cmdLib.findCommandDefinition('team "attack $Target"')
    // BUG: currently returns target instead of communication
    expect(def?.commandId).toBe('communication')
  })
}) 