import { describe, expect, it } from 'vitest';
import { parseSchemaV2 } from './parser-v2.js';

describe('Parser v2', () => {
  it('should parse simple struct', () => {
    const schema = `
      struct Person {
        id @0 :UInt32;
        name @1 :Text;
      }
    `;

    const ast = parseSchemaV2(schema);

    expect(ast.structs).toHaveLength(1);
    expect(ast.structs[0].name).toBe('Person');
    expect(ast.structs[0].fields).toHaveLength(2);
    expect(ast.structs[0].fields[0].name).toBe('id');
    expect(ast.structs[0].fields[0].type).toBe('UInt32');
  });

  it('should parse enum', () => {
    const schema = `
      enum Status {
        pending @0;
        active @1;
      }
    `;

    const ast = parseSchemaV2(schema);

    expect(ast.enums).toHaveLength(1);
    expect(ast.enums[0].name).toBe('Status');
    expect(ast.enums[0].values).toHaveLength(2);
  });

  it('should parse List type', () => {
    const schema = `
      struct Container {
        items @0 :List(UInt32);
      }
    `;

    const ast = parseSchemaV2(schema);

    expect(ast.structs[0].fields[0].type).toEqual({
      kind: 'list',
      elementType: 'UInt32',
    });
  });
});
