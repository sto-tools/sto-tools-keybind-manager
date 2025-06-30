// Vitest Browser Mode setup file
import { beforeAll, beforeEach, afterEach } from 'vitest'
import eventBus from '../src/js/core/eventBus.js'

// Import data to ensure STO_DATA is available
import '../src/js/data.js'

// Browser tests run in real browsers, so we don't need to mock browser APIs
// But we can still set up global test helpers and utilities

// ---------------------------------------------------------------------------
//  PERFORMANCE PATCH FOR BROWSER TESTS
//  ----------------------------------
//  The original helpers wait 100-500 ms on many occasions causing the full
//  suite to idle >8 s.  We monkey-patch small setTimeout delays to fire
//  immediately and tighten the polling/sleep intervals to 20 ms so we keep
//  responsiveness without wasting wall-clock time.
// ---------------------------------------------------------------------------

// Helper for short sleeps in polling loops
const nativeSetTimeout = window.setTimeout.bind(window)
globalThis.fastSleep = (t = 0) => new Promise((r) => nativeSetTimeout(r, t))

// Global test utilities for browser tests
globalThis.testUtils = {
  // Wait for element to be visible
  waitForElement: async (selector, timeout = 5000) => {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const element = document.querySelector(selector)
      if (element && element.offsetParent !== null) {
        return element
      }
      await fastSleep(20)
    }
    throw new Error(`Element ${selector} not found within ${timeout}ms`)
  },

  // Wait for element in modal content (more flexible visibility check)
  waitForModalElement: async (selector, timeout = 5000) => {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const element = document.querySelector(selector)
      if (element) {
        // For modal elements, check if the element exists and is not display:none
        const computedStyle = window.getComputedStyle(element)
        const parentModal = element.closest('.modal')

        // If element exists and parent modal is active, consider it found
        if (
          computedStyle.display !== 'none' ||
          (parentModal && parentModal.classList.contains('active'))
        ) {
          return element
        }
      }
      await fastSleep(20)
    }
    throw new Error(`Modal element ${selector} not found within ${timeout}ms`)
  },

  // Wait for element to disappear
  waitForElementToDisappear: async (selector, timeout = 5000) => {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const element = document.querySelector(selector)
      if (!element || element.offsetParent === null) {
        return
      }
      await fastSleep(20)
    }
    throw new Error(`Element ${selector} still visible after ${timeout}ms`)
  },

  // Simulate user input
  typeIntoElement: async (selector, text, delay = 10) => {
    const element = document.querySelector(selector)
    if (!element) throw new Error(`Element ${selector} not found`)

    element.focus()
    element.value = ''

    for (const char of text) {
      element.value += char
      element.dispatchEvent(new Event('input', { bubbles: true }))
      await fastSleep(delay)
    }

    element.dispatchEvent(new Event('change', { bubbles: true }))
  },

  // Click element with optional delay
  clickElement: async (selector, delay = 20) => {
    const element = document.querySelector(selector)
    if (!element) throw new Error(`Element ${selector} not found`)

    element.click()
    await fastSleep(delay)
  },

  // Load test data into localStorage
  loadTestData: (data) => {
    localStorage.setItem('stoKeybindManager', JSON.stringify(data))
  },

  // Clear all application data
  clearAppData: () => {
    localStorage.clear()
    sessionStorage.clear()
  },

  // Get current app state
  getAppState: () => {
    const data = localStorage.getItem('stoKeybindManager')
    return data ? JSON.parse(data) : null
  },

  // Wait for app to initialize
  waitForAppReady: async () => {
    await testUtils.waitForElement('.app-container')
    await testUtils.waitForElement('#appVersion')
    // Give app time to finish initialization
    await new Promise((resolve) => setTimeout(resolve, 500))
  },
}

// Function to load application HTML and scripts
async function loadApplication() {
  if (window.app) return // Already loaded

  // First, load the HTML structure
  try {
    const response = await fetch('/src/index.html')
    const htmlText = await response.text()

    // Extract the body content (everything between <body> and </body>)
    const bodyMatch = htmlText.match(/<body[^>]*>([\s\S]*)<\/body>/i)
    if (bodyMatch) {
      // Clear current body and inject app HTML
      document.body.innerHTML = bodyMatch[1]

      // Also inject any stylesheets
      const styleMatch = htmlText.match(/<link[^>]*href="styles\.css"[^>]*>/i)
      if (styleMatch) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = '/src/styles.css'
        document.head.appendChild(link)
      }

      // Add Font Awesome
      const fontAwesome = document.createElement('link')
      fontAwesome.rel = 'stylesheet'
      fontAwesome.href =
        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
      document.head.appendChild(fontAwesome)
    }
  } catch (error) {
    console.warn('Failed to load HTML structure:', error)
  }

  // Then load the main ES module bundle
  await new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.type = 'module'
    script.src = '/src/js/main.js'
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })

  // Ensure modalManager hides overlays during tests
  if (window.modalManager) {
    window.modalManager.hide = (id) => {
      const modal = typeof id === 'string' ? document.getElementById(id) : id
      const overlay = document.getElementById('modalOverlay')
      if (modal && overlay) {
        modal.classList.remove('active')
        overlay.classList.remove('active')
        document.body.classList.remove('modal-open')
        return true
      }
      return false
    }
  }
}

// Set up clean environment before each test
beforeEach(async () => {
  // Clear all storage
  localStorage.clear()
  sessionStorage.clear()

  // Clear cookies
  document.cookie.split(';').forEach((c) => {
    document.cookie = c
      .replace(/^ +/, '')
      .replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/')
  })

  // Load application HTML and scripts if not already loaded
  await loadApplication()

  // Wait for app initialization
  if (window.app && typeof window.app.init === 'function') {
    try {
      await window.app.init()
    } catch (error) {
      console.warn('App init failed:', error)
    }
  }
})

// Clean up after each test
afterEach(async () => {
  // Clear any remaining modals or overlays
  const modals = document.querySelectorAll('.modal, .overlay, .dropdown-menu')
  modals.forEach((modal) => {
    if (modal.style.display !== 'none') {
      modal.style.display = 'none'
    }
  })

  // Clear any toast notifications
  const toasts = document.querySelectorAll('.toast')
  toasts.forEach((toast) => toast.remove())

  // Reset any global app state
  if (window.stoKeybindManager) {
    // Reset app if it has a reset method
    if (typeof window.stoKeybindManager.resetApp === 'function') {
      window.stoKeybindManager.resetApp()
    }
  }
})

// -------------------------------------------------------------
// Global one-time setup – load the application before test suites
// -------------------------------------------------------------
beforeAll(async () => {
  // Ensure the application HTML and main script are loaded once
  try {
    await loadApplication()
  } catch (err) {
    console.warn('[browser-setup] loadApplication failed in beforeAll:', err)
  }
})

// Browser test setup
// This runs before each browser test

// Wait for the STO app to be fully initialized
export async function waitForAppReady() {
  return new Promise((resolve) => {
    // If app is already ready
    if (window.app && window.app.initialized) {
      console.log('App already initialized')
      resolve()
      return
    }

    // Listen for the app ready event
    const handleAppReady = () => {
      console.log('App ready event received')
      eventBus.off('sto-app-ready', handleAppReady)
      clearInterval(poll)
      clearTimeout(timeout)
      resolve()
    }

    eventBus.on('sto-app-ready', handleAppReady)

    // In case the event fired before we attached, poll for the flag
    const poll = setInterval(() => {
      if (window.app && window.app.initialized) {
        console.log('App ready detected via polling')
        eventBus.off('sto-app-ready', handleAppReady)
        clearInterval(poll)
        clearTimeout(timeout)
        resolve()
      }
    }, 250)

    // Fallback timeout
    const timeout = setTimeout(() => {
      console.warn('App ready timeout - proceeding anyway')
      eventBus.off('sto-app-ready', handleAppReady)
      clearInterval(poll)
      resolve()
    }, 10000)
  })
}

// Global setup that runs before all tests
export default async function setup() {
  console.log('Browser setup starting...')

  // Wait for the application to be ready
  await waitForAppReady()

  console.log('Browser setup complete')
  console.log('Available globals:', {
    app: !!window.app,
    COMMANDS: !!window.COMMANDS,
    storageService: !!window.storageService,
    stoUI: !!window.stoUI,
  })
}
