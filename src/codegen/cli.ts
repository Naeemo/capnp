#!/usr/bin/env node

/**
 * Cap'n Proto TypeScript Code Generator CLI (Legacy V2)
 * 
 * ⚠️ DEPRECATED: This is the legacy V2 generator based on regex parsing.
 * Please use `capnp-ts-codegen-v3` instead for full feature support.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { generateCode } from './legacy/generator-v2.js';
import { parseSchemaV2 } from './legacy/parser-v2.js';

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
⚠️  DEPRECATED: Cap'n Proto TypeScript Code Generator v2

This is the legacy version based on regex parsing.
Please use capnp-ts-codegen-v3 for full feature support.

Usage: capnp-ts-codegen <schema.capnp> [options]

Options:
  -o, --output    Output file (default: stdout)
  -h, --help      Show this help

Examples:
  capnp-ts-codegen schema.capnp -o schema.ts
  capnp-ts-codegen schema.capnp > schema.ts

Supported:
  - Struct with all primitive types
  - Enum
  - List<T>
  - Text, Data
  - Nested struct references

Not supported:
  - Union
  - Group
  - Interface
  - Const
  - Default values
`);
  process.exit(0);
}

const inputFile = positionals[0];
const outputFile = values.output;

async function main() {
  console.error('⚠️  Warning: Using deprecated V2 generator. Please migrate to V3.');
  console.error(`Reading ${inputFile}...`);
  const source = readFileSync(inputFile, 'utf-8');

  console.error('Parsing schema...');
  const schema = parseSchemaV2(source);

  console.error('Generating TypeScript code...');
  const code = generateCode(schema);

  if (outputFile) {
    writeFileSync(outputFile, code);
    console.error(`Output written to ${outputFile}`);
  } else {
    console.log(code);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
