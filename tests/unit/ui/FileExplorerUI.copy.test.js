import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import FileExplorerUI from '../../../src/js/components/ui/FileExplorerUI.js'
import { createUIComponentFixture } from '../../fixtures/ui/component.js'

describe('FileExplorerUI – copy preview content', () => {
  let fixture
  let component
  let showToastSpy
  const originalI18next = globalThis.i18next

  beforeEach(() => {
    globalThis.i18next = {
      t: vi.fn((key) => key)
    }
    fixture = createUIComponentFixture(FileExplorerUI, { autoInit: false })
    component = fixture.component
    showToastSpy = vi.spyOn(component, 'showToast')
    component.init()
    showToastSpy.mockClear()
  })

  afterEach(() => {
    if (component?.destroy) {
      component.destroy()
    }
    globalThis.i18next = originalI18next
    vi.restoreAllMocks()
  })

  function getCopyHandler() {
    const calls = fixture.eventBus.onDom.mock.calls
    const match = calls.find(call => call[0] === 'copyFileContentBtn')
    return match ? match[3] : null
  }

  it('requests clipboard copy and shows success toast on success', async () => {
    component.request = vi.fn().mockResolvedValue({
      success: true,
      message: 'content_copied_to_clipboard'
    })

    const handler = getCopyHandler()
    expect(handler).toBeTypeOf('function')
    component.document = {
      getElementById: vi.fn((id) => (id === component.contentId ? { textContent: 'example content' } : null))
    }

    await handler()

    expect(component.request).toHaveBeenCalledWith('utility:copy-to-clipboard', { text: 'example content' })
    const successCall = showToastSpy.mock.calls.find(call => call[0] === 'content_copied_to_clipboard')
    expect(successCall).toEqual(['content_copied_to_clipboard', 'success'])
  })

  it('shows error toast when clipboard copy fails', async () => {
    component.request = vi.fn().mockResolvedValue({
      success: false,
      message: 'failed_to_copy_to_clipboard'
    })

    const handler = getCopyHandler()
    expect(handler).toBeTypeOf('function')
    component.document = {
      getElementById: vi.fn((id) => (id === component.contentId ? { textContent: 'other content' } : null))
    }

    await handler()

    expect(component.request).toHaveBeenCalledWith('utility:copy-to-clipboard', { text: 'other content' })
    const errorCall = showToastSpy.mock.calls.find(call => call[0] === 'failed_to_copy_to_clipboard')
    expect(errorCall).toEqual(['failed_to_copy_to_clipboard', 'error'])
  })

  it('shows warning toast when preview content is empty', async () => {
    const handler = getCopyHandler()
    expect(handler).toBeTypeOf('function')

    component.document = {
      getElementById: vi.fn((id) => (id === component.contentId ? { textContent: '   ' } : null))
    }

    await handler()

    expect(showToastSpy).toHaveBeenCalledWith('nothing_to_copy', 'warning')
  })
})
