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
    external: ['node:fs', 'node:path', 'node:url'],
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
    external: ['node:fs', 'node:path', 'node:url'],
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
