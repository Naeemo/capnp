import { defineConfig } from 'rolldown';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig([
  // Main entry - Node.js/Bun/Deno
  {
    input: 'src/index.ts',
    output: {
      dir: 'dist',
      format: 'esm',
      entryFileNames: 'index.js',
      sourcemap: true,
    },
    platform: 'node',
    external: ['node:fs', 'node:path', 'node:url', 'node:child_process', '../../wasm/dist/capnp_ts_wasm.js'],
  },
  // CJS build
  {
    input: 'src/index.ts',
    output: {
      dir: 'dist',
      format: 'cjs',
      entryFileNames: 'index.cjs',
      sourcemap: true,
    },
    platform: 'node',
    external: ['node:fs', 'node:path', 'node:url', 'node:child_process', '../../wasm/dist/capnp_ts_wasm.js'],
  },
  // Browser entry
  {
    input: 'src/browser.ts',
    output: {
      dir: 'dist',
      format: 'esm',
      entryFileNames: 'index.browser.js',
      sourcemap: true,
    },
    platform: 'browser',
    external: ['../../wasm/dist/capnp_ts_wasm.js'],
  },
  // WASM bridge
  {
    input: 'src/wasm/index.ts',
    output: {
      dir: 'dist/wasm',
      format: 'esm',
      entryFileNames: 'index.js',
      sourcemap: true,
    },
    platform: 'neutral',
    external: ['../../wasm/dist/capnp_ts_wasm.js'],
  },
  // CLI
  {
    input: 'src/cli/codegen.ts',
    output: {
      dir: 'dist/cli',
      format: 'esm',
      entryFileNames: 'codegen.js',
      sourcemap: true,
      banner: '#!/usr/bin/env node',
    },
    platform: 'node',
    external: ['node:fs', 'node:path', 'node:child_process'],
  },
]);
