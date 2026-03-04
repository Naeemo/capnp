/**
 * JSON Codec CLI
 *
 * Convert between Cap'n Proto binary and JSON
 *
 * Usage: capnp json <command> [options]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { MessageReader } from '../core/index.js';
import type { SchemaNode } from '../rpc/schema-types.js';
import { SchemaNodeType } from '../rpc/schema-types.js';
import { CapnpToJson, JsonToCapnp } from './index.js';

const VERSION = '0.7.0';

function printUsage() {
  console.log(`
Cap'n Proto JSON Codec v${VERSION}

Usage: capnp json <command> [options]

Commands:
  to-json     Convert Cap'n Proto binary to JSON
  from-json   Convert JSON to Cap'n Proto binary

Options:
  -i, --input     Input file path (required)
  -o, --output    Output file path (default: stdout for to-json, required for from-json)
  -s, --schema    Schema file path (JSON format, required)
  -p, --pretty    Pretty print JSON output (to-json only)
  --preserve-names   Preserve original field names (don't convert to camelCase)
  --include-nulls    Include null fields in JSON output (to-json only)
  -h, --help      Show this help

Examples:
  capnp json to-json -i data.bin -s schema.json -o data.json
  capnp json to-json -i data.bin -s schema.json -p
  capnp json from-json -i data.json -s schema.json -o data.bin
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

async function toJsonCommand(options: ReturnType<typeof parseArgs>) {
  // Load schema
  const schema = loadSchema(options.schema!);

  // Read binary input
  const buffer = readFileSync(options.input!);
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
}

async function fromJsonCommand(options: ReturnType<typeof parseArgs>) {
  // Load schema
  const schema = loadSchema(options.schema!);

  // Read JSON input
  const jsonContent = readFileSync(options.input!, 'utf-8');

  // Convert to Cap'n Proto
  const schemaRegistry = new Map<bigint, SchemaNode>();
  schemaRegistry.set(schema.id, schema);

  const converter = new JsonToCapnp(schemaRegistry, {
    preserveFieldNames: options.preserveNames,
  });

  const messageBuilder = converter.parse(jsonContent, schema);

  // Output
  const buffer = Buffer.from(messageBuilder.toArrayBuffer());

  if (options.output) {
    writeFileSync(options.output, buffer);
    console.error(`Written to ${options.output} (${buffer.length} bytes)`);
  } else {
    console.error('Error: Output file required for from-json (use -o)');
    process.exit(1);
  }
}

export async function run(args: string[]): Promise<void> {
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

  try {
    if (options.command === 'to-json') {
      await toJsonCommand(options);
    } else if (options.command === 'from-json') {
      await fromJsonCommand(options);
    } else {
      console.error(`Error: Unknown command: ${options.command}`);
      printUsage();
      process.exit(1);
    }
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
