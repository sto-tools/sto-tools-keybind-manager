import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
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
      provider: 'istanbul',
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
      '@tests': './tests',
      'pretty-format': './tests/browser/prettyFormatStub.js'
    }
  },
  define: {
    global: 'globalThis'
  },
  optimizeDeps: {
    exclude: [
      "chromium-bidi/lib/cjs/bidiMapper/BidiMapper",
      "chromium-bidi/lib/cjs/cdp/CdpConnection"
    ]
  },
  build: {
    rollupOptions: {
      external: [
        "chromium-bidi/lib/cjs/bidiMapper/BidiMapper",
        "chromium-bidi/lib/cjs/cdp/CdpConnection"
      ]
    }
  }
}) 