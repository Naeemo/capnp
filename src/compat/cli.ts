/**
 * Schema Compatibility Checker CLI
 *
 * Check compatibility between Cap'n Proto schema versions
 *
 * Usage: capnp compat <old-schema> <new-schema> [options]
 */

import { readFileSync } from 'node:fs';
import type { SchemaNode } from '../rpc/schema-types.js';
import { checkCompatibility, formatReport } from './index.js';

const VERSION = '0.9.0';

function printUsage() {
  console.log(`
Cap'n Proto Schema Compatibility Checker v${VERSION}

Usage: capnp compat <old-schema> <new-schema> [options]

Arguments:
  old-schema    Path to old schema JSON file
  new-schema    Path to new schema JSON file

Options:
  --strict-renames      Treat field renames as breaking
  --allow-remove-dep    Allow removing deprecated fields
  --json                Output as JSON
  --quiet               Only output errors
  -h, --help            Show this help

Examples:
  capnp compat schema-v1.json schema-v2.json
  capnp compat old.json new.json --json
  capnp compat old.json new.json --strict-renames
`);
}

function parseArgs(args: string[]) {
  const options: {
    oldSchema?: string;
    newSchema?: string;
    strictRenames?: boolean;
    allowRemoveDeprecated?: boolean;
    json?: boolean;
    quiet?: boolean;
  } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--strict-renames') {
      options.strictRenames = true;
    } else if (arg === '--allow-remove-dep') {
      options.allowRemoveDeprecated = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--quiet') {
      options.quiet = true;
    } else if (!arg.startsWith('-')) {
      if (!options.oldSchema) {
        options.oldSchema = arg;
      } else if (!options.newSchema) {
        options.newSchema = arg;
      }
    }
  }

  return options;
}

function loadSchema(path: string): SchemaNode | SchemaNode[] {
  const content = readFileSync(path, 'utf-8');
  const parsed = JSON.parse(content);

  // Handle array or single object
  const nodes = Array.isArray(parsed) ? parsed : [parsed];

  // Convert string IDs to bigints
  return nodes.map((node: Record<string, unknown>) => ({
    ...node,
    id: typeof node.id === 'string' ? BigInt(node.id) : node.id,
    scopeId: typeof node.scopeId === 'string' ? BigInt(node.scopeId) : (node.scopeId ?? 0n),
  })) as SchemaNode[];
}

export async function run(args: string[]): Promise<void> {
  const options = parseArgs(args);

  if (!options.oldSchema || !options.newSchema) {
    console.error('Error: Both old and new schema files are required');
    printUsage();
    process.exit(1);
  }

  try {
    const oldSchema = loadSchema(options.oldSchema);
    const newSchema = loadSchema(options.newSchema);

    const report = checkCompatibility(oldSchema, newSchema, {
      strictRenames: options.strictRenames,
      allowRemoveDeprecated: options.allowRemoveDeprecated,
    });

    if (options.json) {
      console.log(JSON.stringify(report, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
    } else if (!options.quiet) {
      console.log(formatReport(report));
    }

    // Exit with error code if not compatible
    process.exit(report.compatible ? 0 : 1);
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : err);
    process.exit(2);
  }
}
