#!/usr/bin/env node

/**
 * Cap'n Proto CLI
 * 
 * Usage:
 *   capnp gen schema.capnp -o types.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { parseArgs } from 'util';
import { parseSchemaV2 } from './codegen/parser-v2.js';
import { generateCode } from './codegen/generator-v2.js';

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
Cap'n Proto TypeScript CLI

Usage:
  capnp gen <schema.capnp> [options]    Generate TypeScript from schema
  capnp --help                          Show this help

Options:
  -o, --output    Output file (default: stdout)
  -h, --help      Show this help

Examples:
  npx @naeemo/capnp gen schema.capnp -o types.ts
  capnp gen schema.capnp > types.ts
`);
  process.exit(0);
}

const command = positionals[0];

if (command !== 'gen') {
  console.error(`Unknown command: ${command}`);
  console.error('Run "capnp --help" for usage');
  process.exit(1);
}

const inputFile = positionals[1];
if (!inputFile) {
  console.error('Error: Missing input file');
  console.error('Usage: capnp gen <schema.capnp>');
  process.exit(1);
}

const outputFile = values.output;

async function main() {
  const source = readFileSync(inputFile, 'utf-8');
  const schema = parseSchemaV2(source);
  const code = generateCode(schema);
  
  if (outputFile) {
    writeFileSync(outputFile, code);
    console.error(`Generated: ${outputFile}`);
  } else {
    console.log(code);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
