// In-memory File System fixture built on the global createMockDirectoryHandle()
// exposed in tests/setup.js. Provides helper APIs that resemble the Web
// File-System-Access directory handle plus convenience read/write utilities
// purely in JS memory (no real disk).

import { registerFixture, unregisterFixture, generateFixtureId } from './cleanup.js'

export function createFSFixture(seed = {}) {
  const fixtureId = generateFixtureId('fs')

  // Root directory handle provided globally
  const rootHandle = global.createMockDirectoryHandle('root')

  // Helper to ensure sub-directories and write file contents
  async function writeText(filePath, text) {
    const parts = filePath.split('/')
    const fileName = parts.pop()
    let dir = rootHandle
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part, { create: true })
    }
    const fileHandle = await dir.getFileHandle(fileName, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(text)
    await writable.close()
  }

  async function readText(filePath) {
    const parts = filePath.split('/')
    const fileName = parts.pop()
    let dir = rootHandle
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part)
    }
    const fh = await dir.getFileHandle(fileName)
    const file = await fh.getFile()
    return await file.text()
  }

  async function exists(filePath) {
    try {
      await readText(filePath)
      return true
    } catch {
      return false
    }
  }

  // Pre-populate from seed mapping path -> string content
  const seedPromises = Object.entries(seed).map(([path, content]) => writeText(path, content))

  const destroy = () => {
    // Simply unregister; the in-memory data will be garbage-collected
    unregisterFixture(fixtureId)
  }

  registerFixture(fixtureId, destroy)

  return {
    rootHandle,
    writeText,
    readText,
    exists,
    destroy,
  }
} 