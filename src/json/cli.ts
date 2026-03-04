#!/usr/bin/env node
/**
 * JSON Codec CLI
 *
 * Convert between Cap'n Proto binary and JSON
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { MessageReader } from '../core/index.js';
import type { SchemaNode } from '../rpc/schema-types.js';
import { SchemaNodeType } from '../rpc/schema-types.js';
import { CapnpToJson } from './index.js';

function printUsage() {
  console.log(`
Cap'n Proto JSON Codec v0.7.0

Usage: capnp-json <command> [options]

Commands:
  to-json     Convert Cap'n Proto binary to JSON

Options:
  -i, --input     Input file path (required)
  -o, --output    Output file path (default: stdout)
  -s, --schema    Schema file path (JSON format, required)
  -p, --pretty    Pretty print JSON output
  --preserve-names   Preserve original field names (don't convert to camelCase)
  --include-nulls    Include null fields in JSON output
  -h, --help      Show this help

Examples:
  # Convert binary to JSON
  capnp-json to-json -i data.bin -s schema.json -o data.json
  
  # Pretty print to stdout
  capnp-json to-json -i data.bin -s schema.json -p
  
  # Preserve field names
  capnp-json to-json -i data.bin -s schema.json --preserve-names
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

function loadSchema(schemaPath: string): SchemaNode {
  const schemaJson = readFileSync(schemaPath, 'utf-8');
  const schema = JSON.parse(schemaJson) as SchemaNode;

  // Convert string ID to bigint if needed
  if (typeof schema.id === 'string') {
    schema.id = BigInt(schema.id);
  }

  // Validate it's a struct schema
  if (schema.type !== SchemaNodeType.STRUCT) {
    throw new Error(`Schema must be a struct type, got: ${schema.type}`);
  }

  return schema;
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
    console.error('Error: No input file specified (use -i)');
    process.exit(1);
  }

  if (!options.schema) {
    console.error('Error: No schema file specified (use -s)');
    process.exit(1);
  }

  if (options.command === 'to-json') {
    try {
      // Load schema
      const schema = loadSchema(options.schema);

      // Read binary input
      const buffer = readFileSync(options.input);
      const messageReader = new MessageReader(buffer);

      // Get root struct
      const structReader = messageReader.getRoot(
        schema.structInfo?.dataWordCount ?? 0,
        schema.structInfo?.pointerCount ?? 0
      );

      // Convert to JSON
      const schemaRegistry = new Map<bigint, SchemaNode>();
      schemaRegistry.set(schema.id, schema);

      const converter = new CapnpToJson(schemaRegistry, {
        pretty: options.pretty,
        preserveFieldNames: options.preserveNames,
        includeNulls: options.includeNulls,
      });

      const json = converter.stringify(structReader, schema);

      // Output
      if (options.output && options.output !== '-') {
        writeFileSync(options.output, json);
        console.error(`Written to ${options.output}`);
      } else {
        console.log(json);
      }
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  } else {
    console.error(`Error: Unknown command: ${options.command}`);
    printUsage();
    process.exit(1);
  }
}

main();
