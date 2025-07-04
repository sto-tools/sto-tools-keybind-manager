// Browser test setup file (chromium with playwright)
import { beforeEach, afterEach } from 'vitest'

// Browser-specific setup
beforeEach(async () => {
  // Wait for app to be ready
  await new Promise(resolve => {
    if (window.eventBus) {
      window.eventBus.on('sto-app-ready', resolve)
    } else {
      // Fallback: wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', resolve)
      } else {
        resolve()
      }
    }
  })
})

afterEach(async () => {
  // Clean up any open modals
  const modals = document.querySelectorAll('.modal.active')
  modals.forEach(modal => {
    modal.classList.remove('active')
  })
  
  const overlay = document.getElementById('modalOverlay')
  if (overlay) {
    overlay.classList.remove('active')
  }
  
  document.body.classList.remove('modal-open')
  
  // Reset any form inputs
  const inputs = document.querySelectorAll('input, textarea, select')
  inputs.forEach(input => {
    if (input.type === 'checkbox' || input.type === 'radio') {
      input.checked = false
    } else {
      input.value = ''
    }
  })
  
  // Clear any toast notifications
  const toasts = document.querySelectorAll('.toast')
  toasts.forEach(toast => {
    toast.remove()
  })
  
  // Reset localStorage to clean state if needed
  if (window.storageService && window.storageService.clearAllData) {
    window.storageService.clearAllData()
  }
}) 