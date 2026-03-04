/**
 * Cap'n Proto Code Generator CLI
 *
 * Usage: capnp gen <schema.capnp> [options]
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { type GeneratorOptions, generateFromRequest } from './codegen/generator.js';
import { CodeGeneratorRequestReader } from './schema/schema-reader.js';

const VERSION = '3.0.0';

function printUsage() {
  console.log(`
Cap'n Proto TypeScript Code Generator v${VERSION}

Usage: capnp gen <schema.capnp> [options]

Options:
  -o, --output       Output file (default: stdout)
  -d, --outDir       Output directory
  -r, --runtimePath  Runtime library import path (default: @naeemo/capnp)
  -h, --help         Show this help
  -v, --version      Show version

Examples:
  capnp gen schema.capnp -o schema.ts
  capnp gen schema.capnp -d ./generated
`);
}

function checkCapnpTool(): boolean {
  try {
    execSync('capnp --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export async function run(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      output: { type: 'string', short: 'o' },
      outDir: { type: 'string', short: 'd' },
      runtimePath: { type: 'string', short: 'r' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
    allowPositionals: true,
  });

  if (values.version) {
    console.log(VERSION);
    process.exit(0);
  }

  if (values.help || positionals.length === 0) {
    printUsage();
    process.exit(0);
  }

  const inputFile = positionals[0];

  if (!existsSync(inputFile)) {
    console.error(`Error: File not found: ${inputFile}`);
    process.exit(1);
  }

  if (!checkCapnpTool()) {
    console.error("Error: capnp tool not found. Please install Cap'n Proto.");
    process.exit(1);
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'capnp-gen-'));
  const binFile = join(tmpDir, 'schema.bin');

  try {
    // Compile schema to binary format using shell
    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execAsync = promisify(exec);

    await execAsync(`capnp compile -o- "${inputFile}" > "${binFile}"`);

    // Read and parse
    const buffer = readFileSync(binFile);
    const request = CodeGeneratorRequestReader.fromBuffer(buffer.buffer);

    const opts: GeneratorOptions = {
      runtimeImportPath:
        typeof values.runtimePath === 'string' ? values.runtimePath : '@naeemo/capnp',
    };

    const files = generateFromRequest(request, opts);

    if (values.outDir) {
      // Multiple files mode
      for (const [filename, content] of files) {
        const outPath = join(values.outDir, filename);
        writeFileSync(outPath, content);
        console.log(`Generated: ${outPath}`);
      }
    } else if (values.output) {
      // Single file mode
      const content = Array.from(files.values()).join('\n');
      writeFileSync(values.output, content);
      console.log(`Generated: ${values.output}`);
    } else {
      // stdout
      const content = Array.from(files.values()).join('\n');
      console.log(content);
    }
  } catch (err: any) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
