import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Browser environment for UI interaction tests
    environment: 'jsdom', // Fallback, but browser mode will override
    globals: true,
    testTimeout: 30000, // Longer timeout for browser tests
    hookTimeout: 30000,
    include: [
      'tests/browser/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
    ],
    // Browser mode configuration
    browser: {
      enabled: true,
      name: 'chromium',
      provider: 'playwright',
      headless: true,
      // Use the main application HTML as the test entry point
      testerHtmlPath: './src/index.html',
      // Serve the actual application
      api: {
        host: 'localhost',
        port: 3001
      },
      reuseExistingServer: true,   // keep Chromium alive across runs
    },
    // Setup files for browser environment
    setupFiles: ['./tests/browser-setup.js']
  },
  resolve: {
    alias: {
      '@': './src',
      '@js': './src/js',
      '@tests': './tests',
      'pretty-format': './tests/browser/prettyFormatStub.js'
    }
  },
  define: {
    global: 'globalThis'
  },
  // Serve the src directory as static files for browser tests
  server: {
    fs: {
      allow: ['..']
    },
    // Serve static files from src directory
    middlewareMode: false,
    publicDir: 'src'
  }
}) 