import { readFileSync } from 'node:fs';
import { generateFromRequest } from '../codegen/generator-v3.js';
import { CodeGeneratorRequestReader } from '../schema/schema-reader.js';

const buffer = readFileSync('/tmp/calculator2.bin');
const arrayBuffer = new Uint8Array(buffer).buffer;
const request = CodeGeneratorRequestReader.fromBuffer(arrayBuffer);
const files = generateFromRequest(request);

console.log('Files generated:', files.size);
const firstFile = files.values().next().value;
console.log(firstFile?.substring(0, 2000));
