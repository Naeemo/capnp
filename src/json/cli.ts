#!/usr/bin/env node
/**
 * JSON Codec CLI
 *
 * Convert between Cap'n Proto binary and JSON
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { MessageReader } from '../core/index.js';
import type { SchemaNode } from '../rpc/schema-types.js';
import { CapnpToJson } from './index.js';

function printUsage() {
  console.log(`
Cap'n Proto JSON Codec

Usage: capnp-json <command> [options]

Commands:
  to-json     Convert Cap'n Proto binary to JSON
  from-json   Convert JSON to Cap'n Proto binary

Options:
  -i, --input    Input file path
  -o, --output   Output file path
  -s, --schema   Schema file path (JSON format)
  -p, --pretty   Pretty print JSON output
  --preserve-names  Preserve original field names (don't convert to camelCase)
  --include-nulls   Include null fields in JSON output

Examples:
  capnp-json to-json -i data.bin -o data.json -s schema.json
  capnp-json from-json -i data.json -o data.bin -s schema.json
  capnp-json to-json -i data.bin -o - -s schema.json -p
`);
}

function parseArgs(args: string[]) {
  const options: {
    command?: string;
    input?: string;
    output?: string;
    schema?: string;
    pretty?: boolean;
    preserveNames?: boolean;
    includeNulls?: boolean;
  } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case 'to-json':
      case 'from-json':
        options.command = arg;
        break;
      case '-i':
      case '--input':
        options.input = args[++i];
        break;
      case '-o':
      case '--output':
        options.output = args[++i];
        break;
      case '-s':
      case '--schema':
        options.schema = args[++i];
        break;
      case '-p':
      case '--pretty':
        options.pretty = true;
        break;
      case '--preserve-names':
        options.preserveNames = true;
        break;
      case '--include-nulls':
        options.includeNulls = true;
        break;
      case '-h':
      case '--help':
        printUsage();
        process.exit(0);
    }
  }

  return options;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  const options = parseArgs(args);

  if (!options.command) {
    console.error('Error: No command specified');
    printUsage();
    process.exit(1);
  }

  if (!options.input) {
    console.error('Error: No input file specified');
    process.exit(1);
  }

  if (options.command === 'to-json') {
    try {
      // Read binary input
      const buffer = readFileSync(options.input);
      const _reader = new MessageReader(buffer);

      // TODO: Load schema from file
      // For now, output raw hex dump
      console.log('JSON conversion requires schema support');
      console.log('Input file size:', buffer.length, 'bytes');
      console.log('First 32 bytes:', buffer.slice(0, 32).toString('hex'));
    } catch (err) {
      console.error('Error:', err);
      process.exit(1);
    }
  } else if (options.command === 'from-json') {
    console.log('from-json not yet implemented');
    process.exit(1);
  }
}

main();
