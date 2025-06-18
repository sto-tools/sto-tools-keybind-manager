import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  // Unit tests configuration (jsdom environment)
  {
    test: {
      name: 'unit',
      environment: 'jsdom',
      globals: true,
      setupFiles: ['vitest-localstorage-mock', './tests/setup.js'],
      mockReset: false,
      testTimeout: 10000,
      include: [
        'tests/unit/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
        'tests/integration/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
      ],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: [
          'node_modules/',
          'tests/',
          'src/styles.css',
          '**/*.config.js'
        ],
        include: ['src/js/**/*.js']
      }
    },
    resolve: {
      alias: {
        '@': './src',
        '@js': './src/js',
        '@tests': './tests'
      }
    },
    define: {
      global: 'globalThis'
    }
  },
  // Browser tests configuration (chromium environment)
  {
    test: {
      name: 'browser',
      environment: 'happy-dom', // Fallback, browser mode will override
      globals: true,
      testTimeout: 30000,
      include: [
        'tests/browser/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
      ],
      browser: {
        enabled: true,
        name: 'chromium',
        provider: 'playwright',
        headless: true,
        testerHtmlPath: './src/index.html',
        api: {
          host: 'localhost',
          port: 3001
        }
      },
      coverage: {
        provider: 'istanbul',
        reporter: ['text', 'json', 'html'],
        exclude: [
          'node_modules/',
          'tests/',
          'src/styles.css',
          '**/*.config.js'
        ],
        include: ['src/js/**/*.js']
      },
      setupFiles: ['./tests/browser-setup.js']
    },
    resolve: {
      alias: {
        '@': './src',
        '@js': './src/js',
        '@tests': './tests'
      }
    },
    define: {
      global: 'globalThis'
    },
    server: {
      fs: {
        allow: ['..']
      },
      middlewareMode: false,
      publicDir: 'src'
    }
  }
]) 