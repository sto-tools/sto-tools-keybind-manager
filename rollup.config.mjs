import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import json from '@rollup/plugin-json';

export default {
  input: 'src/js/main.js',
  output: {
    file: 'src/dist/bundle.js',
    format: 'esm',
    sourcemap: true,
  },
  plugins: [
    nodeResolve(),
    json(),
    terser({
      compress: {
        drop_console: false, // Keep console logs for debugging
        drop_debugger: true,
        pure_funcs: ['console.debug'],
        passes: 2
      },
      mangle: {
        properties: {
          regex: /^_/
        }
      },
      format: {
        comments: false
      }
    })
  ]
};
