import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateFromRequest } from '../codegen/generator.js';
import { CodeGeneratorRequestReader } from '../schema/schema-reader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read the binary schema
const buffer = readFileSync('/tmp/rpc-schema.bin');
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
const request = CodeGeneratorRequestReader.fromBuffer(arrayBuffer);
const files = generateFromRequest(request, { runtimeImportPath: '@naeemo/capnp' });

for (const [name, code] of files) {
  const outPath = join(__dirname, name);
  writeFileSync(outPath, code);
  console.log('Generated:', outPath);
}
