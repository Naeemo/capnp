import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { CodeGeneratorRequestReader } from '../schema/schema-reader.js';
import { generateFromRequest } from '../codegen/generator-v3.js';

const buffer = readFileSync('/tmp/calculator.bin');
const arrayBuffer = new Uint8Array(buffer).buffer;

describe('Interface Code Generation', () => {
  it('should generate code for interface', () => {
    const request = CodeGeneratorRequestReader.fromBuffer(arrayBuffer);
    const files = generateFromRequest(request);

    expect(files.size).toBeGreaterThan(0);

    const firstFile = files.values().next().value;
    expect(firstFile).toContain('CalculatorInterfaceId');
    expect(firstFile).toContain('CalculatorMethodIds');
    expect(firstFile).toContain('CalculatorServer');
    expect(firstFile).toContain('CalculatorClient');
    expect(firstFile).toContain('evaluate');
    expect(firstFile).toContain('getOperator');
  });
});
