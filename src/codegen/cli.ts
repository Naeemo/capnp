#!/usr/bin/env node

/**
 * Cap'n Proto TypeScript Code Generator CLI
 */

import { readFileSync, writeFileSync } from 'fs';
import { parseArgs } from 'util';
import { SchemaParser } from './parser.js';
import { CodeGenerator } from './generator.js';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    output: { type: 'string', short: 'o' },
    help: { type: 'boolean', short: 'h' },
  },
  allowPositionals: true,
});

if (values.help || positionals.length === 0) {
  console.log(`
Cap'n Proto TypeScript Code Generator

Usage: capnp-ts-codegen <schema.capnp> [options]

Options:
  -o, --output    Output file (default: stdout)
  -h, --help      Show this help

Examples:
  capnp-ts-codegen schema.capnp -o schema.ts
  capnp-ts-codegen schema.capnp > schema.ts
`);
  process.exit(0);
}

const inputFile = positionals[0];
const outputFile = values.output;

async function main() {
  console.error(`Reading ${inputFile}...`);
  
  // TODO: 真正解析 .capnp 文件
  // 目前需要调用 capnp compile 生成中间格式
  // 或者用 WASM 绑定 SchemaParser
  
  // 临时：用硬编码示例
  const parser = new SchemaParser();
  parser.addStruct({
    name: 'Person',
    dataWords: 2,
    pointerCount: 2,
    fields: [
      { name: 'id', index: 0, type: 'UInt32', offset: 0, isPointer: false },
      { name: 'name', index: 1, type: 'Text', offset: 0, isPointer: true },
    ],
  });

  const generator = new CodeGenerator();
  const code = generator.generate(parser.getStructs(), parser.getEnums());

  if (outputFile) {
    writeFileSync(outputFile, code);
    console.error(`Output written to ${outputFile}`);
  } else {
    console.log(code);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
