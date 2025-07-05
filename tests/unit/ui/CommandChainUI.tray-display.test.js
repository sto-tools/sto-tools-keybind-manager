import { describe, it, expect, beforeAll } from 'vitest'
import { JSDOM } from 'jsdom'

import eventBus from '../../../src/js/core/eventBus.js'
import { respond } from '../../../src/js/core/requestResponse.js'
import { STOCommandParser } from '../../../src/js/lib/STOCommandParser.js'
import CommandChainUI from '../../../src/js/components/ui/CommandChainUI.js'

// Canonical tray-execution command variants to verify UI display conversion
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
  'TrayExecByTray 0 0 3'
]

describe('CommandChainUI – tray execution display titles', () => {
  let document, ui

  beforeAll(() => {
    // Attach parser RPC handlers once for the shared event bus
    // eslint-disable-next-line no-new
    new STOCommandParser(eventBus)

    // Mock request handlers used inside createCommandElement
    respond(eventBus, 'command:find-definition', ({ command }) => {
      // Return a minimal command definition for tray commands
      if (/TrayExecByTray/i.test(command)) {
        return {
          name: 'Tray Execution',
          icon: '⚡',
          categoryId: 'tray',
          commandId: 'custom_tray',
          customizable: false
        }
      }
      return null
    })

    respond(eventBus, 'command:get-warning', () => null)
  })

  // Setup fresh DOM and UI instance for each test
  beforeAll(() => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="commandList"></div>
          <div id="chainTitle"></div>
          <div id="commandPreview"></div>
          <span id="commandCount"></span>
          <div id="emptyState"></div>
        </body>
      </html>
    `)
    document = dom.window.document

    ui = new CommandChainUI({
      eventBus,
      document,
      ui: { initDragAndDrop: () => {} }
    })
  })

  it('should render human-readable titles for every tray execution variant', async () => {
    for (const cmd of TRAY_COMMANDS) {
      const element = await ui.createCommandElement(cmd, 0, 1)
      const textEl  = element.querySelector('.command-text')
      expect(textEl).toBeTruthy()
      const txt = textEl.textContent.trim()
      expect(txt).not.toBe(cmd)
      expect(txt).toMatch(/Tray Execution/i)
    }
  })
}) 