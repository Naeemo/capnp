#!/usr/bin/env node

/**
 * Cap'n Proto TypeScript Code Generator CLI
 *
 * Usage:
 *   capnp-ts-codegen schema.capnp -o output.ts
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { generateTypeScript } from '../codegen/generator.js';
import { parseSchema } from '../codegen/parser.js';

interface Options {
  input: string;
  output: string;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const input = args[0];
  const outputIndex = args.indexOf('-o');
  const output = outputIndex >= 0 ? args[outputIndex + 1] : 'output.ts';

  if (!input) {
    console.error('Usage: capnp-ts-codegen <schema.capnp> -o <output.ts>');
    process.exit(1);
  }

  return { input, output };
}

function main() {
  const { input, output } = parseArgs();

  if (!existsSync(input)) {
    console.error(`Error: File not found: ${input}`);
    process.exit(1);
  }

  console.log(`Reading schema from ${input}...`);
  const schemaText = readFileSync(input, 'utf-8');

  console.log('Parsing schema...');
  const schema = parseSchema(schemaText);

  console.log(`Found ${schema.structs.length} structs, ${schema.enums.length} enums`);

  console.log('Generating TypeScript code...');
  const generated = generateTypeScript(schema);

  writeFileSync(output, generated);
  console.log(`✓ Output written to ${output}`);
}

main();
