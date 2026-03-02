import { readFileSync } from 'fs';
import { CodeGeneratorRequestReader } from '../schema/schema-reader.js';

const buffer = readFileSync('/tmp/calculator.bin');
const arrayBuffer = new Uint8Array(buffer).buffer;
const request = CodeGeneratorRequestReader.fromBuffer(arrayBuffer);

console.log('All nodes:');
for (const node of request.nodes) {
  console.log(`  ${node.displayName} (id: ${node.id}, scopeId: ${node.scopeId})`);
}
