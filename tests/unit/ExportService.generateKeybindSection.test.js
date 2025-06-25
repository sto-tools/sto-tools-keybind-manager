import { describe, it, expect } from 'vitest'

import ExportService from '../../src/js/components/services/ExportService.js'

const exportService = new ExportService({})
exportService.init()

describe('ExportService.generateKeybindSection regression', () => {
  it('skips null command objects gracefully', () => {
    const keys = {
      Space: [null, { command: '+STOTrayExecByTray 0 0', type: 'tray' }],
    }
    const section = exportService.generateKeybindSection(keys)
    expect(section).toContain('Space "+STOTrayExecByTray 0 0"')
  })
}) 