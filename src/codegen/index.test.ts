import { describe, expect, it } from 'vitest';
import { generateCode } from './generator-v2.js';
import { parseSchemaV2 } from './parser-v2.js';

describe('Code Generator', () => {
  it('should parse simple schema', () => {
    const schema = `
      struct Person {
        name @0 :Text;
        age @1 :UInt32;
      }
    `;

    const result = parseSchemaV2(schema);
    expect(result.structs).toHaveLength(1);
    expect(result.structs[0].name).toBe('Person');
    expect(result.structs[0].fields).toHaveLength(2);
  });

  it('should parse enum', () => {
    const schema = `
      enum Status {
        active @0;
        inactive @1;
        pending @2;
      }
    `;

    const result = parseSchemaV2(schema);
    expect(result.enums).toHaveLength(1);
    expect(result.enums[0].name).toBe('Status');
    expect(result.enums[0].values).toHaveLength(3);
  });

  it('should generate TypeScript code', () => {
    const schema = `
      struct Person {
        name @0 :Text;
        age @1 :UInt32;
      }
    `;

    const parsed = parseSchemaV2(schema);
    const generated = generateCode(parsed);

    expect(generated).toContain('class PersonReader');
    expect(generated).toContain('class PersonBuilder');
  });
});
