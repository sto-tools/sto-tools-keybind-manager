import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import FileSystemService from '../../../src/js/components/services/FileSystemService.js'
import { createServiceFixture } from '../../fixtures/index.js'

/**
 * Unit tests – FileSystemService interacting with the in-memory FS fixture
 */

describe('FileSystemService', () => {
  let fixture, fsService, rootDir

  beforeEach(() => {
    fixture   = createServiceFixture({ enableFS: true })
    rootDir   = fixture.rootDir
    fsService = new FileSystemService({ eventBus: fixture.eventBus })
  })

  afterEach(() => {
    fixture.destroy()
  })

  it('saveDirectoryHandle / getDirectoryHandle round-trip', async () => {
    await fsService.saveDirectoryHandle('sync-folder', rootDir)
    const handle = await fsService.getDirectoryHandle('sync-folder')
    expect(handle).toBe(rootDir)
  })

  it('writeFile should create nested path and persist contents', async () => {
    const content = 'Hello World'
    await fsService.writeFile(rootDir, 'exports/logs/output.txt', content)

    const stored = await fixture.fsReadText('exports/logs/output.txt')
    expect(stored).toBe(content)
  })
}) 