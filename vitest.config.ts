import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: [
      'node_modules/',
      'dist/',
      'wasm/',
      // 排除非核心文件
      'src/cli*.ts',
      'examples/**',
      'docs/**',
      'src/bench/**',
      'src/codegen/**',
      'src/schema/**',
      'src/compat/**',
      'src/proxy/**',
      'src/test/**',
    ],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'wasm/',
        // 排除非核心文件
        'src/cli*.ts',
        'examples/**',
        'docs/**',
        'src/bench/**',
        'src/codegen/**',
        'src/schema/**',
        'src/compat/**',
        'src/proxy/**',
        'src/test/**',
        '**/*.test.ts',
        '**/*.config.ts',
      ],
    },
  },
});
