#!/usr/bin/env node
/**
 * Cap'n Proto Unified CLI
 *
 * Usage: capnp <command> [options]
 *
 * Commands:
 *   gen       Generate TypeScript code from schema
 *   json      Convert between Cap'n Proto and JSON
 *   compat    Check schema compatibility
 *   audit     Security audit message files
 *   help      Show help for a command
 */

import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
  },
  allowPositionals: true,
  strict: false,
});

const VERSION = '0.9.0';

function printMainUsage() {
  console.log(`
Cap'n Proto TypeScript CLI v${VERSION}

Usage: capnp <command> [options]

Commands:
  gen       Generate TypeScript code from .capnp schema
  json      Convert between Cap'n Proto binary and JSON
  compat    Check schema compatibility between versions
  audit     Security audit message files

Options:
  -h, --help     Show this help
  -v, --version  Show version

Examples:
  capnp gen schema.capnp -o types.ts
  capnp json to-json -i data.bin -s schema.json
  capnp compat old.json new.json
  capnp audit message.bin

Run 'capnp <command> --help' for more information on a command.
`);
}

async function main() {
  if (values.version) {
    console.log(VERSION);
    process.exit(0);
  }

  if (values.help || positionals.length === 0) {
    printMainUsage();
    process.exit(0);
  }

  const command = positionals[0];
  const args = process.argv.slice(3); // Remove 'capnp' and command

  switch (command) {
    case 'gen':
      await import('./cli-gen.js').then((m) => m.run(args));
      break;
    case 'json':
      await import('./json/cli.js').then((m) => m.run(args));
      break;
    case 'compat':
      await import('./compat/cli.js').then((m) => m.run(args));
      break;
    case 'audit':
      await import('./cli-audit.js').then((m) => m.run(args));
      break;
    case 'help':
      if (positionals[1]) {
        // Show help for specific command
        args.push('--help');
        switch (positionals[1]) {
          case 'gen':
            await import('./cli-gen.js').then((m) => m.run(args));
            break;
          case 'json':
            await import('./json/cli.js').then((m) => m.run(args));
            break;
          case 'compat':
            await import('./compat/cli.js').then((m) => m.run(args));
            break;
          case 'audit':
            await import('./cli-audit.js').then((m) => m.run(args));
            break;
          default:
            console.error(`Unknown command: ${positionals[1]}`);
            process.exit(1);
        }
      } else {
        printMainUsage();
      }
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printMainUsage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
