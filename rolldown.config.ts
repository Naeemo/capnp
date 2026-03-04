import { defineConfig } from 'rolldown';

export default defineConfig([
  // Main entry
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
    input: 'src/cli-unified.ts',
    output: {
      dir: 'dist',
      entryFileNames: 'cli.js',
      format: 'esm',
      sourcemap: true,
    },
    plugins: [
      {
        name: 'shebang',
        renderChunk(code) {
          return `#!/usr/bin/env node\n${code}`;
        },
      },
    ],
    platform: 'node',
    external: ['node:fs', 'node:path', 'node:child_process', 'node:os', 'node:util'],
  },
]);
