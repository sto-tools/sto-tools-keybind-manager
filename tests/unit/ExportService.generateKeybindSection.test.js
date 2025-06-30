import { describe, it, expect, vi } from 'vitest'
import { respond } from '../../src/js/core/requestResponse.js'
import eventBus from '../../src/js/core/eventBus.js'

import ExportService from '../../src/js/components/services/ExportService.js'

describe('ExportService.generateKeybindSection regression', () => {
  it('skips null command objects gracefully', async () => {
    // Create the service with real eventBus
    const exportService = new ExportService({ eventBus })
    exportService.init()

    // Mock the fileops:generate-keybind-section request handler
    const mockKeybindSection = 'Space "+STOTrayExecByTray 0 0"\n'
    const detach = respond(eventBus, 'fileops:generate-keybind-section', () => mockKeybindSection)

    const keys = {
      Space: [null, { command: '+STOTrayExecByTray 0 0', type: 'tray' }],
    }
    
    // Await the async method
    const section = await exportService.generateKeybindSection(keys)
    expect(section).toContain('Space "+STOTrayExecByTray 0 0"')

    // Clean up the mock handler
    detach()
  })
}) 