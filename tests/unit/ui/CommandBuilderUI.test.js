import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServiceFixture } from '../../fixtures/index.js'
import CommandBuilderUI from '../../../src/js/components/ui/CommandBuilderUI.js'

let fixture

beforeEach(() => {
  fixture = createServiceFixture()
})

afterEach(() => {
  fixture.destroy()
})

describe('CommandBuilderUI', () => {
  it('should generate targeting UI markup', () => {
    const ui = new CommandBuilderUI()
    const html = ui.createTargetingUI()
    expect(html).toContain('command-builder-targeting')
    expect(html).toContain('<select')
  })

  it('should generate tray UI markup', () => {
    const ui = new CommandBuilderUI()
    const html = ui.createTrayUI()
    expect(html).toContain('command-builder-tray')
  })

  it('should generate communication UI markup', () => {
    const ui = new CommandBuilderUI()
    const html = ui.createCommunicationUI()
    expect(html).toContain('command-builder-communication')
    expect(html).toContain('<input')
  })
}) 