#!/usr/bin/env node

/**
 * Cap'n Proto TypeScript Code Generator CLI v2
 * 
 * 使用方法:
 *   capnp-ts-codegen schema.capnp -o output.ts
 *   capnp-ts-codegen schema.capnp > output.ts
 * 
 * 注意: 代码生成器目前处于实验阶段，建议直接使用底层 API
 */

import { readFileSync, writeFileSync } from 'fs';
import { parseArgs } from 'util';

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
Cap'n Proto TypeScript Code Generator v2 (Experimental)

Usage: capnp-ts-codegen <schema.capnp> [options]

Options:
  -o, --output    Output file (default: stdout)
  -h, --help      Show this help

Examples:
  capnp-ts-codegen schema.capnp -o schema.ts
  capnp-ts-codegen schema.capnp > schema.ts

Status: Code generation is experimental. For production use, 
please use the low-level API directly as shown in the README.

See: https://github.com/Naeemo/capnp#quick-start
`);
  process.exit(0);
}

const inputFile = positionals[0];
const outputFile = values.output;

async function main() {
  console.error(`Reading ${inputFile}...`);
  
  // TODO: Implement full code generation
  // For now, output a placeholder with instructions
  
  const code = `// Code generation is currently experimental.
// Please use the low-level API directly.
// See: https://github.com/Naeemo/capnp#quick-start

import { MessageBuilder, MessageReader } from '@naeemo/capnp';

// Example usage:
// const builder = new MessageBuilder();
// const root = builder.initRoot(2, 1);
// root.setInt32(0, 42);
// root.setText(0, 'hello');
`;
  
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
