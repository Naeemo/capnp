import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { CodeGeneratorRequestReader } from '../schema/schema-reader.js';

const buffer = readFileSync('/tmp/calculator.bin');
const arrayBuffer = new Uint8Array(buffer).buffer;

describe('Interface Schema Reading', () => {
  it('should read interface methods correctly', () => {
    const request = CodeGeneratorRequestReader.fromBuffer(arrayBuffer);
    const nodes = request.nodes;

    // Find Calculator interface
    const calculatorNode = nodes.find(n => n.displayName.includes('Calculator') && n.isInterface);
    expect(calculatorNode).toBeDefined();
    expect(calculatorNode?.isInterface).toBe(true);

    // Check methods
    const methods = calculatorNode!.interfaceMethods;
    expect(methods).toHaveLength(2);

    // Check evaluate method
    const evaluate = methods.find(m => m.name === 'evaluate');
    expect(evaluate).toBeDefined();
    expect(evaluate?.codeOrder).toBe(0);
    expect(evaluate?.paramStructType).toBe(15157145340895459229n);
    expect(evaluate?.resultStructType).toBe(11729076027486137858n);

    // Check getOperator method
    const getOperator = methods.find(m => m.name === 'getOperator');
    expect(getOperator).toBeDefined();
    expect(getOperator?.codeOrder).toBe(1);
  });
});
