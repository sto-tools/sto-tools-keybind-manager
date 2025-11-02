import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import ProjectManagementService from '../../../src/js/components/services/ProjectManagementService.js'
import { createServiceFixture } from '../../fixtures/index.js'

describe('ProjectManagementService.restoreFromProjectContent', () => {
  let fixture
  let service

  beforeEach(() => {
    fixture = createServiceFixture()
    service = new ProjectManagementService({
      eventBus: fixture.eventBus,
      storage: fixture.storage,
      i18n: { t: (key) => (key === 'backup_restored_successfully' ? 'Restored!' : key) }
    })
    service.ui = { showToast: vi.fn() }
    service.init()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fixture.destroy()
  })

  it('delegates restore to ImportService and emits success events', async () => {
    const requestMock = vi.spyOn(service, 'request').mockImplementation(async (topic, payload) => {
      if (topic === 'import:project-file') {
        expect(payload).toEqual({ content: '{"fake":true}' })
        return { success: true, currentProfile: 'profile-42', imported: { profiles: 2 } }
      }
      if (topic === 'data:reload-state') {
        return { success: true }
      }
      if (topic === 'data:switch-profile') {
        expect(payload).toEqual({ profileId: 'profile-42' })
        return { success: true }
      }
      return { success: true }
    })
    const emitSpy = vi.spyOn(service, 'emit')

    const result = await service.restoreFromProjectContent('{"fake":true}', 'backup.json')

    expect(requestMock).toHaveBeenCalledWith('import:project-file', { content: '{"fake":true}' })
    expect(requestMock).toHaveBeenCalledWith('data:reload-state')
    expect(requestMock).toHaveBeenCalledWith('data:switch-profile', { profileId: 'profile-42' })
    expect(service.ui.showToast).toHaveBeenCalledWith('Application state restored successfully', 'success')
    expect(emitSpy).toHaveBeenCalledWith('project-backup-restored', {
      filename: 'backup.json',
      currentProfile: 'profile-42',
      imported: { profiles: 2 }
    }, { synchronous: true })
    expect(result).toEqual({ success: true, currentProfile: 'profile-42', imported: { profiles: 2 } })
  })

  it('propagates import errors without emitting success side effects', async () => {
    const requestMock = vi.spyOn(service, 'request').mockImplementation(async (topic) => {
      if (topic === 'import:project-file') {
        return { success: false, error: 'project_invalid', params: { reason: 'corrupt' } }
      }
      throw new Error(`Unexpected request for topic ${topic}`)
    })
    const emitSpy = vi.spyOn(service, 'emit')

    const result = await service.restoreFromProjectContent('bad-data', 'broken.json')

    expect(result).toEqual({ success: false, error: 'project_invalid: corrupt' })
    expect(service.ui.showToast).not.toHaveBeenCalled()
    expect(emitSpy).not.toHaveBeenCalledWith('project-backup-restored', expect.anything(), expect.anything())
    expect(requestMock).toHaveBeenCalledTimes(1)
  })
})
