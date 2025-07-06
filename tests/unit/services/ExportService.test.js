import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import ExportService from '../../../src/js/components/services/ExportService.js'
import { createServiceFixture, createProfileDataFixture } from '../../fixtures/index.js'
import { respond } from '../../../src/js/core/requestResponse.js'

/**
 * Unit tests – ExportService – verify keybind file generation
 */

// Register a lightweight responder for parser:parse-command-string to avoid timeouts in unit tests
respond(undefined, 'parser:parse-command-string', ({ commandString }) => {
  // Return minimal parse result needed by normalizeToOptimizedString
  return {
    commands: [ { command: commandString } ]
  }
})

describe('ExportService', () => {
  let fixture, service, profile

  beforeEach(() => {
    fixture = createServiceFixture()
    service = new ExportService({ eventBus: fixture.eventBus, storage: fixture.storage })
    service.init && service.init()

    // Register responder for parser on the fixture event bus to avoid timeouts
    respond(fixture.eventBus, 'parser:parse-command-string', ({ commandString }) => ({ commands: [{ command: commandString }] }))

    // Build simple profile data
    const pFix = createProfileDataFixture('basic')
    pFix.addKey('space', 'F1', ['FireAll'])
    profile = { id: 'prof1', name: 'TestProfile', builds: pFix.profile.builds }
  })

  afterEach(() => {
    fixture.destroy()
  })

  it('generateSTOKeybindFile returns header and key lines', async () => {
    const txt = await service.generateSTOKeybindFile(profile, { environment: 'space' })
    expect(txt).toContain('STO Keybind Configuration')
    expect(txt).toMatch(/F1\s+"FireAll"/)
  })
}) 