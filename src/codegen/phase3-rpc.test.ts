/**
 * Phase 3 RPC Code Generation Tests
 *
 * Tests for the enhanced RPC code generation features.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CodeGeneratorRequestReader } from '../schema/schema-reader.js';
import { generateFromRequest } from './generator-v3.js';

const buffer = readFileSync('/tmp/calculator.bin');
const arrayBuffer = new Uint8Array(buffer).buffer;

describe('Phase 3 RPC Code Generation', () => {
  it('should generate Server Interface', () => {
    const request = CodeGeneratorRequestReader.fromBuffer(arrayBuffer);
    const files = generateFromRequest(request);

    const firstFile = files.values().next().value;
    expect(firstFile).toContain('export interface CalculatorServer');
    expect(firstFile).toContain('evaluate(context: CallContext');
    expect(firstFile).toContain('getOperator(context: CallContext');
  });

  it('should generate Server Stub', () => {
    const request = CodeGeneratorRequestReader.fromBuffer(arrayBuffer);
    const files = generateFromRequest(request);

    const firstFile = files.values().next().value;
    expect(firstFile).toContain('export class CalculatorStub');
    expect(firstFile).toContain('private server: CalculatorServer');
    expect(firstFile).toContain('async dispatch(methodId: number');
    expect(firstFile).toContain('isValidMethod(methodId: number)');
  });

  it('should generate Client Class with PipelineClient', () => {
    const request = CodeGeneratorRequestReader.fromBuffer(arrayBuffer);
    const files = generateFromRequest(request);

    const firstFile = files.values().next().value;
    expect(firstFile).toContain('export class CalculatorClient extends BaseCapabilityClient');
    expect(firstFile).toContain('PipelineClient<');
    expect(firstFile).toContain('static readonly interfaceId');
  });

  it('should generate Method ID constants', () => {
    const request = CodeGeneratorRequestReader.fromBuffer(arrayBuffer);
    const files = generateFromRequest(request);

    const firstFile = files.values().next().value;
    expect(firstFile).toContain('export const CalculatorInterfaceId');
    expect(firstFile).toContain('export const CalculatorMethodIds');
    expect(firstFile).toContain('evaluate: 0');
    expect(firstFile).toContain('getOperator: 1');
  });

  it('should use correct Reader/Builder types in method signatures', () => {
    const request = CodeGeneratorRequestReader.fromBuffer(arrayBuffer);
    const files = generateFromRequest(request);

    const firstFile = files.values().next().value;
    // Server interface should use Reader for params and Builder for results
    expect(firstFile).toContain('CallContext<EvaluateParamsReader, EvaluateResultsBuilder>');
    expect(firstFile).toContain('CallContext<GetOperatorParamsReader, GetOperatorResultsBuilder>');
  });
});
