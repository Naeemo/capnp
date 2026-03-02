import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { CodeGeneratorRequestReader } from '../schema/schema-reader.js';
import { generateFromRequest } from '../codegen/generator-v3.js';

// Simulate CLI behavior
const inputFile = '/root/.openclaw/workspace/capnp-ts/examples/calculator/calculator.capnp';
const tmpDir = mkdtempSync(join(tmpdir(), 'capnp-ts-test-'));
const binFile = join(tmpDir, 'schema.bin');

console.log('Temp dir:', tmpDir);
console.log('Bin file:', binFile);

// Compile
execSync(`capnp compile -o- "${inputFile}" > "${binFile}"`);

// Read using same logic as CLI
const buffer = readFileSync(binFile);
console.log('Buffer length:', buffer.length);
console.log('Buffer byteOffset:', buffer.byteOffset);
console.log('Buffer buffer length:', buffer.buffer.byteLength);

// Create ArrayBuffer like CLI does
const arrayBuffer = new Uint8Array(buffer.byteLength);
arrayBuffer.set(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
console.log('ArrayBuffer length:', arrayBuffer.buffer.byteLength);

const request = CodeGeneratorRequestReader.fromBuffer(arrayBuffer.buffer);
console.log('Nodes count:', request.nodes.length);

const files = generateFromRequest(request);
console.log('Files generated:', files.size);

// Cleanup
rmSync(tmpDir, { recursive: true, force: true });
