import { describe, it, expect, beforeAll } from 'vitest'

import eventBus from '../../../src/js/core/eventBus.js'
import { STOCommandParser } from '../../../src/js/lib/STOCommandParser.js'
import { enrichForDisplay } from '../../../src/js/lib/commandDisplayAdapter.js'

// Canonical tray-execution variants to verify UI display conversion
const TRAY_COMMANDS = [
  '+TrayExecByTray 3 0',
  'TrayExecByTray 1 3 1',
  'TrayExecByTray 1 3 2',
  '+STOTrayExecByTray 0 0',
  'STOTrayExecByTray 1 0 1',
  'STOTrayExecByTray 0 0 2',
  '+STOTrayExecByTray 0 3',
  '+STOTrayExecByTray 0 0',
  'STOTrayExecByTray 0 0 1',
  '+TrayExecByTray 0 0',
  'TrayExecByTray 0 0 0',
  '+TrayExecByTray 0 3',
  'STOTrayExecByTray 0 0 3',
  'TrayExecByTray 0 0 3',
  'STOTrayExecByTray 0 0 0'
]

describe('CommandDisplayAdapter – tray execution display text', () => {
  // Stand-alone parser instance bound to shared eventBus for tests
  beforeAll(() => {
    // Instantiating the parser once registers RPC handlers on the shared bus
    // (subsequent creations will be no-ops because the handlers are idempotent)
    // eslint-disable-next-line no-new
    new STOCommandParser(eventBus)
  })

  it('should produce human-readable displayText for all tray execution variants', async () => {
    const results = await Promise.all(
      TRAY_COMMANDS.map(cmd => enrichForDisplay(cmd, null, { eventBus }))
    )

    results.forEach((rich, idx) => {
      expect(rich).toBeTruthy()
      expect(typeof rich.displayText).toBe('string')
      // Should convert to a friendly label rather than echoing raw command
      // e.g. "Tray Execution (3 0)" or similar
      expect(rich.displayText).not.toBe(TRAY_COMMANDS[idx])
      expect(rich.displayText).toMatch(/Tray Execution/i)
    })
  })
}) 