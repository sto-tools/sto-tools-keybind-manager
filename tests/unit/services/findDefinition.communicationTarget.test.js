import { describe, it, expect, beforeEach } from 'vitest'
import { createEventBusFixture } from '../../fixtures/core/eventBus.js'
import CommandLibraryService from '../../../src/js/components/services/CommandLibraryService.js'
import { respond } from '../../../src/js/core/requestResponse.js'

let eventBus
let cmdLib

beforeEach(async () => {
  const busFix = createEventBusFixture()
  eventBus = busFix.eventBus

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

describe('CommandLibraryService.findCommandDefinition – Communication vs Target', () => {
  it('should NOT mis-classify communication with $Target as Target command', async () => {
    const def = await cmdLib.findCommandDefinition('team "attack $Target"')
    // BUG: currently returns target instead of communication
    expect(def?.commandId).toBe('communication')
  })
}) 