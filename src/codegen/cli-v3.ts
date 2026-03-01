#!/usr/bin/env node

/**
 * Cap'n Proto TypeScript Code Generator CLI v3
 * 
 * 使用官方 capnp 编译器生成的 binary schema 来生成 TypeScript 代码
 * 这是推荐的生产环境方案
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, basename, dirname } from 'node:path';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { CodeGeneratorRequestReader } from '../schema/schema-reader.js';
import { generateFromRequest, type GeneratorOptions } from './generator-v3.js';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    output: { type: 'string', short: 'o' },
    outDir: { type: 'string', short: 'd' },
    runtimePath: { type: 'string', short: 'r' },
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
  },
  allowPositionals: true,
});

const VERSION = '3.0.0';

if (values.version) {
  console.log(VERSION);
  process.exit(0);
}

if (values.help || positionals.length === 0) {
  console.log(`
Cap'n Proto TypeScript Code Generator v3

Usage: capnp-ts-codegen <schema.capnp> [options]

Options:
  -o, --output       Output file (default: stdout for single file)
  -d, --outDir       Output directory for multiple files
  -r, --runtimePath  Runtime library import path (default: @naeemo/capnp)
  -h, --help         Show this help
  -v, --version      Show version

Examples:
  capnp-ts-codegen schema.capnp -o schema.ts
  capnp-ts-codegen schema.capnp -d ./generated
  capnp-ts-codegen schema.capnp -o schema.ts -r ../runtime

Features:
  - Struct with all primitive types
  - Enum
  - List<T>
  - Text, Data
  - Nested struct references
  - Union (discriminant handling)

Not yet supported:
  - Group
  - Interface
  - Const
  - Default values
  - RPC
`);
  process.exit(0);
}

const inputFile = positionals[0];

// 验证输入文件
if (!existsSync(inputFile)) {
  console.error(`Error: File not found: ${inputFile}`);
  process.exit(1);
}

// 检查 capnp 工具是否可用
function checkCapnpTool(): boolean {
  try {
    execSync('capnp --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!checkCapnpTool()) {
    console.error('Error: capnp tool not found. Please install Cap\'n Proto.');
    console.error('  macOS: brew install capnp');
    console.error('  Ubuntu/Debian: apt-get install capnproto');
    console.error('  Other: https://capnproto.org/install.html');
    process.exit(1);
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'capnp-ts-'));
  const binFile = join(tmpDir, 'schema.bin');

  try {
    console.error(`Compiling ${inputFile}...`);
    
    // 获取输入文件所在目录作为 include path
    const inputDir = dirname(inputFile);
    
    // 编译为 binary schema
    execSync(`capnp compile -o- "${inputFile}" > "${binFile}"`, {
      cwd: inputDir,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    console.error('Reading binary schema...');
    const buffer = readFileSync(binFile);
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );

    console.error('Generating TypeScript code...');
    const request = CodeGeneratorRequestReader.fromBuffer(arrayBuffer);

    const options: GeneratorOptions = {
      runtimeImportPath: values.runtimePath || '@naeemo/capnp',
    };

    const files = generateFromRequest(request, options);

    // 输出处理
    if (values.outDir) {
      // 多文件输出到目录
      mkdirSync(values.outDir, { recursive: true });
      for (const [filename, code] of files) {
        const outPath = join(values.outDir, filename);
        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, code);
        console.error(`Generated: ${outPath}`);
      }
    } else if (values.output) {
      // 单文件输出
      const firstFile = files.values().next().value;
      if (firstFile) {
        writeFileSync(values.output, firstFile);
        console.error(`Output written to ${values.output}`);
      } else {
        console.error('Error: No files generated');
        process.exit(1);
      }
    } else {
      // 输出到 stdout
      const firstFile = files.values().next().value;
      if (firstFile) {
        console.log(firstFile);
      } else {
        console.error('Error: No files generated');
        process.exit(1);
      }
    }
  } catch (err: any) {
    console.error('Error:', err.message);
    if (err.stderr) {
      console.error(err.stderr.toString());
    }
    process.exit(1);
  } finally {
    // 清理临时文件
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();
