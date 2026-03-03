#!/usr/bin/env node

/**
 * Cap'n Proto CLI
 *
 * Usage:
 *   capnp gen schema.capnp -o types.ts
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { type GeneratorOptions, generateFromRequest } from './codegen/generator.js';
import { CodeGeneratorRequestReader } from './schema/schema-reader.js';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    output: { type: 'string', short: 'o' },
    outDir: { type: 'string', short: 'd' },
    runtimePath: { type: 'string', short: 'r' },
    dynamic: { type: 'boolean', short: 'D' },
    interactive: { type: 'boolean', short: 'i' },
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
  },
  allowPositionals: true,
});

const VERSION = '3.0.0';

if (values.version) {
  console.log(VERSION);
  process.exit(0);
}

if (values.help || positionals.length === 0) {
  console.log(`
Cap'n Proto TypeScript Code Generator v3

Usage: capnp-ts-codegen <schema.capnp> [options]

Options:
  -o, --output       Output file (default: stdout for single file)
  -d, --outDir       Output directory for multiple files
  -r, --runtimePath  Runtime library import path (default: @naeemo/capnp)
  -D, --dynamic      Generate dynamic schema loading code
  -i, --interactive  Start interactive schema query tool
  -h, --help         Show this help
  -v, --version      Show version

Examples:
  capnp-ts-codegen schema.capnp -o schema.ts
  capnp-ts-codegen schema.capnp -d ./generated
  capnp-ts-codegen schema.capnp -o schema.ts -r ../runtime
  capnp-ts-codegen schema.capnp -D -o schema-dynamic.ts
  capnp-ts-codegen schema.capnp -i

Features:
  - Struct with all primitive types
  - Enum
  - List<T>
  - Text, Data
  - Nested struct references
  - Union (discriminant handling)
  - Group
  - Default values (XOR encoding)
  - Multi-segment messages
  - Interface (RPC client/server generation)
  - Dynamic schema loading (Phase 7)

Not yet supported:
  - Const
  - Advanced RPC features (Level 2-4)
`);
  process.exit(0);
}

const inputFile = positionals[0];

// Validate input file
if (!existsSync(inputFile)) {
  console.error(`Error: File not found: ${inputFile}`);
  process.exit(1);
}

// Check if capnp tool is available
function checkCapnpTool(): boolean {
  try {
    execSync('capnp --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  // Handle interactive mode
  if (values.interactive) {
    await runInteractiveMode(inputFile);
    return;
  }

  if (!checkCapnpTool()) {
    console.error("Error: capnp tool not found. Please install Cap'n Proto.");
    console.error('  macOS: brew install capnp');
    console.error('  Ubuntu/Debian: apt-get install capnproto');
    console.error('  Other: https://capnproto.org/install.html');
    process.exit(1);
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'capnp-ts-'));
  const binFile = join(tmpDir, 'schema.bin');

  try {
    console.error(`Compiling ${inputFile}...`);

    // Get input file directory as include path
    const inputDir = dirname(inputFile);

    // Compile to binary schema
    execSync(`capnp compile -o- "${inputFile}" > "${binFile}"`, {
      cwd: inputDir,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    console.error('Reading binary schema...');
    const buffer = readFileSync(binFile);
    // Create a proper ArrayBuffer copy to avoid issues with Node.js Buffer pooling
    const arrayBuffer = new Uint8Array(buffer.byteLength);
    arrayBuffer.set(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));

    // Handle dynamic mode
    if (values.dynamic) {
      console.error('Generating dynamic schema loading code...');
      const dynamicCode = generateDynamicLoadingCode(inputFile, arrayBuffer.buffer);

      if (values.output) {
        writeFileSync(values.output, dynamicCode);
        console.error(`Dynamic loading code written to ${values.output}`);
      } else {
        console.log(dynamicCode);
      }
      return;
    }

    console.error('Generating TypeScript code...');
    const request = CodeGeneratorRequestReader.fromBuffer(arrayBuffer.buffer);

    const options: GeneratorOptions = {
      runtimeImportPath: values.runtimePath || '@naeemo/capnp',
    };

    const files = generateFromRequest(request, options);

    // Output handling
    if (values.outDir) {
      // Multi-file output to directory
      mkdirSync(values.outDir, { recursive: true });
      for (const [filename, code] of files) {
        const outPath = join(values.outDir, filename);
        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, code);
        console.error(`Generated: ${outPath}`);
      }
    } else if (values.output) {
      // Single file output
      const firstFile = files.values().next().value;
      if (firstFile) {
        writeFileSync(values.output, firstFile);
        console.error(`Output written to ${values.output}`);
      } else {
        console.error('Error: No files generated');
        process.exit(1);
      }
    } else {
      // Output to stdout
      const firstFile = files.values().next().value;
      if (firstFile) {
        console.log(firstFile);
      } else {
        console.error('Error: No files generated');
        process.exit(1);
      }
    }
  } catch (err: any) {
    console.error('Error:', err.message);
    if (err.stderr) {
      console.error(err.stderr.toString());
    }
    process.exit(1);
  } finally {
    // Cleanup temp files
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();

// =============================================================================
// Phase 7: Dynamic Schema Loading Support
// =============================================================================

/**
 * Generate dynamic schema loading code for the given schema file
 */
function generateDynamicLoadingCode(inputFile: string, buffer: ArrayBuffer): string {
  const request = CodeGeneratorRequestReader.fromBuffer(buffer);
  const nodes = request.nodes;

  const runtimePath = values.runtimePath || '@naeemo/capnp';
  const schemaName = basename(inputFile, '.capnp');

  // Collect struct and interface types
  const structTypes: Array<{ id: string; name: string; displayName: string }> = [];
  const interfaceTypes: Array<{ id: string; name: string; displayName: string }> = [];

  for (const node of nodes) {
    const id = node.id;
    const displayName = node.displayName;
    const shortName = displayName.split('.').pop() || displayName;

    if (node.isStruct) {
      structTypes.push({ id: `0x${id.toString(16)}n`, name: shortName, displayName });
    } else if (node.isInterface) {
      interfaceTypes.push({ id: `0x${id.toString(16)}n`, name: shortName, displayName });
    }
  }

  const code = `/**
 * Dynamic Schema Loading for ${schemaName}.capnp
 * 
 * This file provides runtime schema loading capabilities for ${schemaName}.capnp
 * Generated by capnp-ts-codegen --dynamic
 * 
 * Usage:
 *   import { load${toPascalCase(schemaName)}Schema, ${structTypes.map((t) => t.name).join(', ')} } from './${schemaName}-dynamic';
 *   
 *   // Load schema from remote connection
 *   const schema = await load${toPascalCase(schemaName)}Schema(connection);
 *   
 *   // Use dynamic reader
 *   const reader = createDynamicReader(schema.Person, buffer);
 *   console.log(reader.get('name'));
 */

import { 
  RpcConnection,
  createDynamicReader, 
  createDynamicWriter,
  dumpDynamicReader,
  type SchemaNode,
  type SchemaRegistry,
} from '${runtimePath}';

// =============================================================================
// Type IDs
// =============================================================================

${structTypes.map((t) => `/** Type ID for ${t.displayName} */\nexport const ${t.name}TypeId = ${t.id};`).join('\n')}

${interfaceTypes.map((t) => `/** Interface ID for ${t.displayName} */\nexport const ${t.name}InterfaceId = ${t.id};`).join('\n')}

// =============================================================================
// Schema Cache
// =============================================================================

let cachedSchemaRegistry: SchemaRegistry | null = null;

// =============================================================================
// Schema Loading Functions
// =============================================================================

/**
 * Load all schemas for ${schemaName}.capnp from a remote connection.
 * This fetches schema information dynamically and caches it for reuse.
 * 
 * @param connection - The RPC connection to fetch schemas from
 * @returns A registry containing all loaded schemas
 */
export async function load${toPascalCase(schemaName)}Schema(connection: RpcConnection): Promise<SchemaRegistry> {
  if (cachedSchemaRegistry) {
    return cachedSchemaRegistry;
  }

  // Fetch all schemas
  const typeIds = [
    ${structTypes.map((t) => `${t.name}TypeId`).join(',\n    ')}
  ];

  for (const typeId of typeIds) {
    try {
      await connection.getDynamicSchema(typeId);
    } catch (err) {
      console.warn(\`Failed to load schema for type \${typeId}:\`, err);
    }
  }

  cachedSchemaRegistry = connection.getSchemaRegistry();
  return cachedSchemaRegistry;
}

/**
 * Get a specific schema node by type ID.
 * Loads from remote if not already cached.
 * 
 * @param connection - The RPC connection
 * @param typeId - The type ID to fetch
 * @returns The schema node
 */
export async function getSchema(connection: RpcConnection, typeId: bigint): Promise<SchemaNode> {
  return connection.getDynamicSchema(typeId);
}

/**
 * Clear the schema cache.
 * Call this if you need to re-fetch schemas from the remote server.
 */
export function clearSchemaCache(): void {
  cachedSchemaRegistry = null;
}

// =============================================================================
// Dynamic Reader Helpers
// =============================================================================

${structTypes
  .map(
    (t) => `
/**
 * Create a dynamic reader for ${t.name}
 * 
 * @param buffer - The Cap'n Proto message buffer
 * @param registry - Optional schema registry (will use cached if available)
 * @returns A DynamicReader for the message
 */
export function create${toPascalCase(t.name)}Reader(
  buffer: ArrayBuffer | Uint8Array,
  registry?: SchemaRegistry
): DynamicReader {
  const reg = registry || cachedSchemaRegistry;
  if (!reg) {
    throw new Error('Schema registry not loaded. Call load${toPascalCase(schemaName)}Schema first.');
  }
  
  const schema = reg.getNode(${t.name}TypeId);
  if (!schema) {
    throw new Error('Schema for ${t.name} not found in registry');
  }
  
  return createDynamicReader(schema, buffer);
}
`
  )
  .join('\n')}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Dump all fields from a dynamic reader for debugging
 */
export { dumpDynamicReader };

/**
 * List all available types in this schema
 */
export function listTypes(): Array<{ name: string; typeId: string; kind: 'struct' | 'interface' }> {
  return [
    ${structTypes.map((t) => `{ name: '${t.name}', typeId: '${t.id}', kind: 'struct' as const }`).join(',\n    ')},
    ${interfaceTypes.map((t) => `{ name: '${t.name}', typeId: '${t.id}', kind: 'interface' as const }`).join(',\n    ')},
  ];
}
`;

  return code;
}

/**
 * Run interactive schema query tool
 */
async function runInteractiveMode(inputFile: string): Promise<void> {
  if (!checkCapnpTool()) {
    console.error("Error: capnp tool not found. Please install Cap'n Proto.");
    process.exit(1);
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'capnp-ts-'));
  const binFile = join(tmpDir, 'schema.bin');

  try {
    console.log(`\n🔍 Loading schema: ${inputFile}...\n`);

    const inputDir = dirname(inputFile);
    execSync(`capnp compile -o- "${inputFile}" > "${binFile}"`, {
      cwd: inputDir,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    const buffer = readFileSync(binFile);
    const arrayBuffer = new Uint8Array(buffer.byteLength);
    arrayBuffer.set(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));

    const request = CodeGeneratorRequestReader.fromBuffer(arrayBuffer.buffer);
    const nodes = request.nodes;

    // Build type index
    const typeIndex = new Map<
      string,
      { id: bigint; displayName: string; kind: string; node: unknown }
    >();

    for (const node of nodes) {
      const id = node.id;
      const displayName = node.displayName;
      const shortName = displayName.split('.').pop() || displayName;

      let kind = 'unknown';
      if (node.isStruct) kind = 'struct';
      else if (node.isInterface) kind = 'interface';
      else if (node.isEnum) kind = 'enum';
      else if (node.isConst) kind = 'const';

      typeIndex.set(shortName, { id, displayName, kind, node });
      typeIndex.set(displayName, { id, displayName, kind, node });
      typeIndex.set(id.toString(16), { id, displayName, kind, node });
    }

    console.log('📋 Available types:');
    console.log('─'.repeat(60));

    const structs: string[] = [];
    const interfaces: string[] = [];
    const enums: string[] = [];

    for (const [name, info] of typeIndex) {
      if (name.includes('.')) continue; // Skip full names for summary

      if (info.kind === 'struct') structs.push(name);
      else if (info.kind === 'interface') interfaces.push(name);
      else if (info.kind === 'enum') enums.push(name);
    }

    if (structs.length > 0) {
      console.log('\n🏗️  Structs:');
      structs.sort().forEach((name) => {
        const info = typeIndex.get(name)!;
        console.log(`   ${name.padEnd(30)} (0x${info.id.toString(16)})`);
      });
    }

    if (interfaces.length > 0) {
      console.log('\n🔌 Interfaces:');
      interfaces.sort().forEach((name) => {
        const info = typeIndex.get(name)!;
        console.log(`   ${name.padEnd(30)} (0x${info.id.toString(16)})`);
      });
    }

    if (enums.length > 0) {
      console.log('\n📊 Enums:');
      enums.sort().forEach((name) => {
        const info = typeIndex.get(name)!;
        console.log(`   ${name.padEnd(30)} (0x${info.id.toString(16)})`);
      });
    }

    console.log(`\n${'─'.repeat(60)}`);
    console.log('💡 Commands:');
    console.log('   inspect <type>  - Show detailed information about a type');
    console.log('   ids             - List all type IDs');
    console.log('   export          - Export schema info as JSON');
    console.log('   quit            - Exit interactive mode');
    console.log('');

    // Simple command loop using stdin
    const stdin = process.stdin;
    const stdout = process.stdout;

    stdin.setEncoding('utf8');
    stdin.resume();

    stdout.write('> ');

    stdin.on('data', (data: string) => {
      const line = data.trim();
      const parts = line.split(/\s+/);
      const command = parts[0];
      const arg = parts[1];

      switch (command) {
        case 'quit':
        case 'exit':
        case 'q':
          console.log('👋 Goodbye!');
          process.exit(0);
          break;

        case 'inspect':
          if (!arg) {
            console.log('❌ Usage: inspect <type-name>');
          } else {
            const info = typeIndex.get(arg);
            if (info) {
              console.log(`\n🔍 ${info.displayName}`);
              console.log(`   ${'─'.repeat(50)}`);
              console.log(`   Type ID: 0x${info.id.toString(16)}`);
              console.log(`   Kind: ${info.kind}`);

              // In a full implementation, we'd show field details here
              // by parsing the node structure more deeply

              console.log('');
            } else {
              console.log(`❌ Type "${arg}" not found`);
            }
          }
          break;

        case 'ids':
          console.log('\n📋 All Type IDs:');
          console.log(`   ${'─'.repeat(50)}`);
          for (const [name, info] of typeIndex) {
            if (name.includes('.')) continue;
            console.log(`   0x${info.id.toString(16).padStart(16, '0')}  ${info.displayName}`);
          }
          console.log('');
          break;

        case 'export': {
          const exportData = {
            sourceFile: inputFile,
            types: Array.from(typeIndex.entries())
              .filter(([name]) => !name.includes('.'))
              .map(([name, info]) => ({
                name,
                displayName: info.displayName,
                typeId: `0x${info.id.toString(16)}`,
                kind: info.kind,
              })),
          };
          console.log(JSON.stringify(exportData, null, 2));
          break;
        }

        case 'help':
        case 'h':
          console.log('\n💡 Commands:');
          console.log('   inspect <type>  - Show detailed information about a type');
          console.log('   ids             - List all type IDs');
          console.log('   export          - Export schema info as JSON');
          console.log('   quit            - Exit interactive mode');
          console.log('');
          break;

        default:
          if (line) {
            console.log(`❌ Unknown command: ${command}`);
            console.log('   Type "help" for available commands');
          }
      }

      stdout.write('> ');
    });

    // Keep the process alive
    await new Promise(() => {});
  } catch (err: any) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Convert string to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}
