import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import FileOperationsService from '../../../src/js/components/services/FileOperationsService.js'
import { createServiceFixture } from '../../fixtures/index.js'
import { respond as respondRPC } from '../../../src/js/core/requestResponse.js'

/**
 * Unit tests – FileOperationsService (pure parsing + import helpers)
 */

describe('FileOperationsService', () => {
  let fixture, svc

  beforeEach(() => {
    fixture = createServiceFixture()
    svc = new FileOperationsService({ eventBus: fixture.eventBus, storage: fixture.storage })
    svc.init && svc.init()
  })

  afterEach(() => {
    fixture.destroy()
  })

  it('parseKeybindFile should return keybinds and aliases', async () => {
    // Dummy parser responder to satisfy internal request-response
    respondRPC(fixture.eventBus, 'parser:parse-command-string', () => ({ commands: [], isMirrored: false }))

    const content = 'F1 "FirePhasers $$ FireAll"\nalias kapow "FireAll"'
    const result = await svc.parseKeybindFile(content)
    expect(Object.keys(result.keybinds)).toContain('F1')
    expect(result.aliases).toEqual({})
    // Should have error for alias inclusion
    expect(result.errors.some(e => /Alias definitions/.test(e))).toBe(true)
  })

  it('parseAliasFile should return aliases only', async () => {
    // Dummy parser responder
    respondRPC(fixture.eventBus, 'parser:parse-command-string', () => ({ commands: [], isMirrored: false }))

    const content = 'alias kapow "FireAll"\nalias boom <& FirePhasers $$ FireAll &>'
    const result = await svc.parseAliasFile(content)

    expect(result.aliases).toHaveProperty('kapow')
    expect(result.aliases).toHaveProperty('boom')
    expect(Object.keys(result.aliases).length).toBe(2)
    expect(result.errors.length).toBe(0)
  })
}) 