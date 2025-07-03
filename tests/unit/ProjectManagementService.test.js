import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import ProjectManagementService from '../../src/js/components/services/ProjectManagementService.js'

/**
 * Regression tests for ProjectManagementService.saveProject()
 * Ensures that exported project data is always serialized to JSON before
 * constructing the Blob, regardless of whether `storage.exportData()` returns
 * an object or a pre-stringified JSON string.
 */

describe('ProjectManagementService.saveProject – data serialization', () => {
  let OriginalBlob
  let originalCreateObjectURL
  let originalRevokeObjectURL

  beforeEach(() => {
    // Preserve the original global Blob implementation so it can be restored
    OriginalBlob = global.Blob

    // Preserve original URL methods if they exist
    originalCreateObjectURL = global.URL.createObjectURL
    originalRevokeObjectURL = global.URL.revokeObjectURL

    // Stub Blob constructor to capture constructor arguments for inspection
    global.Blob = vi.fn(function (parts, options) {
      this.parts = parts
      this.options = options
    })

    // Provide stub implementations for URL methods used by saveProject
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock')
    global.URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    // Restore original implementations and clear mocks
    global.Blob = OriginalBlob
    global.URL.createObjectURL = originalCreateObjectURL
    global.URL.revokeObjectURL = originalRevokeObjectURL
    vi.restoreAllMocks()
  })

  it('should JSON.stringify object data before creating Blob', () => {
    const mockDataObject = { foo: 'bar', answer: 42 }

    const storage = {
      exportData: vi.fn().mockReturnValue(mockDataObject),
    }
    const ui = { showToast: vi.fn() }

    const service = new ProjectManagementService({ storage, ui })

    service.saveProject()

    // Ensure Blob constructor was called exactly once
    expect(global.Blob).toHaveBeenCalledTimes(1)

    // Extract the first argument (the parts array) passed to the Blob constructor
    const partsArray = global.Blob.mock.calls[0][0]

    // The first (and only) element in the parts array should be the JSON string
    expect(partsArray[0]).toBe(JSON.stringify(mockDataObject, null, 2))
  })

  it('should not double-stringify data if it is already a string', () => {
    const jsonString = JSON.stringify({ hello: 'world' }, null, 2)

    const storage = {
      exportData: vi.fn().mockReturnValue(jsonString),
    }
    const ui = { showToast: vi.fn() }

    const service = new ProjectManagementService({ storage, ui })

    service.saveProject()

    // Ensure Blob constructor was called exactly once
    expect(global.Blob).toHaveBeenCalledTimes(1)

    const partsArray = global.Blob.mock.calls[0][0]

    // When data is already a string, it should be passed through untouched
    expect(partsArray[0]).toBe(jsonString)
  })
}) 