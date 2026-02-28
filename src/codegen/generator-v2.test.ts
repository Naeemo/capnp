import { describe, it, expect } from 'vitest';
import { parseSchemaV2 } from './parser-v2.js';
import { generateCode } from './generator-v2.js';

describe('Code Generator v2', () => {
  it('should generate code for simple struct', () => {
    const schema = `
      struct Person {
        id @0 :UInt32;
        name @1 :Text;
      }
    `;

    const ast = parseSchemaV2(schema);
    const code = generateCode(ast);

    expect(code).toContain('export interface Person');
    expect(code).toContain('export class PersonReader');
    expect(code).toContain('export class PersonBuilder');
    expect(code).toContain('get id(): number');
    expect(code).toContain('get name(): string');
  });

  it('should generate code for enum', () => {
    const schema = `
      enum Status {
        pending @0;
        active @1;
      }
    `;

    const ast = parseSchemaV2(schema);
    const code = generateCode(ast);

    expect(code).toContain('export enum Status');
    expect(code).toContain('pending = 0');
  });
});
