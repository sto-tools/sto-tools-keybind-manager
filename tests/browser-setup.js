// Vitest Browser Mode setup file
import { beforeEach, afterEach } from 'vitest'

// Browser tests run in real browsers, so we don't need to mock browser APIs
// But we can still set up global test helpers and utilities

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
      await new Promise(resolve => setTimeout(resolve, 100))
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
        if (computedStyle.display !== 'none' || (parentModal && parentModal.classList.contains('active'))) {
          return element
        }
      }
      await new Promise(resolve => setTimeout(resolve, 100))
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
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error(`Element ${selector} still visible after ${timeout}ms`)
  },

  // Simulate user input
  typeIntoElement: async (selector, text, delay = 50) => {
    const element = document.querySelector(selector)
    if (!element) throw new Error(`Element ${selector} not found`)
    
    element.focus()
    element.value = ''
    
    for (const char of text) {
      element.value += char
      element.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise(resolve => setTimeout(resolve, delay))
    }
    
    element.dispatchEvent(new Event('change', { bubbles: true }))
  },

  // Click element with optional delay
  clickElement: async (selector, delay = 100) => {
    const element = document.querySelector(selector)
    if (!element) throw new Error(`Element ${selector} not found`)
    
    element.click()
    await new Promise(resolve => setTimeout(resolve, delay))
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
    await new Promise(resolve => setTimeout(resolve, 500))
  }
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
      fontAwesome.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
      document.head.appendChild(fontAwesome)
    }
  } catch (error) {
    console.warn('Failed to load HTML structure:', error)
  }
  
  // Then load the scripts
  const scripts = [
    '/src/js/constants.js',
    '/src/js/errors.js',
    '/src/js/version.js',
    '/src/js/data.js',
    '/src/js/vertigo_data.js',
    '/src/js/storage.js',
    '/src/js/modalManager.js',
    '/src/js/ui.js',
    '/src/js/commands.js',
    '/src/js/keybinds.js',
    '/src/js/profiles.js',
    '/src/js/aliases.js',
    '/src/js/export.js',
    '/src/js/app.js'
  ]
  
  for (const src of scripts) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = src
      script.onload = resolve
      script.onerror = reject
      document.head.appendChild(script)
    })
  }

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
  document.cookie.split(";").forEach((c) => {
    document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/")
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
  modals.forEach(modal => {
    if (modal.style.display !== 'none') {
      modal.style.display = 'none'
    }
  })
  
  // Clear any toast notifications
  const toasts = document.querySelectorAll('.toast')
  toasts.forEach(toast => toast.remove())
  
  // Reset any global app state
  if (window.stoKeybindManager) {
    // Reset app if it has a reset method
    if (typeof window.stoKeybindManager.resetApp === 'function') {
      window.stoKeybindManager.resetApp()
    }
  }
})

// Browser test setup
// This runs before each browser test

// Wait for the STO app to be fully initialized
export async function waitForAppReady() {
  return new Promise((resolve) => {
    // If app is already ready
    if (window.app && window.app.initialized) {
      console.log('App already initialized');
      resolve();
      return;
    }

    // Listen for the app ready event
    const handleAppReady = () => {
      console.log('App ready event received');
      window.removeEventListener('sto-app-ready', handleAppReady);
      resolve();
    };

    window.addEventListener('sto-app-ready', handleAppReady);
    
    // Fallback timeout
    setTimeout(() => {
      console.log('App ready timeout - checking globals');
      window.removeEventListener('sto-app-ready', handleAppReady);
      resolve();
    }, 10000);
  });
}

// Global setup that runs before all tests
export default async function setup() {
  console.log('Browser setup starting...');
  
  // Wait for the application to be ready
  await waitForAppReady();
  
  console.log('Browser setup complete');
  console.log('Available globals:', {
    app: !!window.app,
    COMMANDS: !!window.COMMANDS,
    stoStorage: !!window.stoStorage,
    stoUI: !!window.stoUI
  });
} 