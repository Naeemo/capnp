import { describe, it, expect } from 'vitest';
import { parseSchema } from './parser.js';
import { generateTypeScript } from './generator.js';

describe('Code Generator', () => {
  it('should parse simple schema', () => {
    const schema = `
      struct Person {
        name @0 :Text;
        age @1 :UInt32;
      }
    `;

    const result = parseSchema(schema);
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

    const result = parseSchema(schema);
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

    const parsed = parseSchema(schema);
    const generated = generateTypeScript(parsed);

    expect(generated).toContain('class Person_Reader');
    expect(generated).toContain('class Person_Builder');
    expect(generated).toContain('get name(): string');
    expect(generated).toContain('get age(): number');
  });
});
