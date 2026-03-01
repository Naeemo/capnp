import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CodeGeneratorRequestReader } from './schema-reader.js';

const __dirname = new URL('.', import.meta.url).pathname;

describe('Schema Reader', () => {
  it('should read binary schema file', () => {
    const buffer = readFileSync(join(__dirname, '../../test-schema.capnp.bin'));
    const request = CodeGeneratorRequestReader.fromBuffer(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));

    const nodes = request.nodes;
    expect(nodes.length).toBeGreaterThan(0);

    // 只检查我们关心的节点（通过 ID 匹配）
    // Person @0xf43297c220fd1f3f
    // Company @0x88007c9f2f9f703e
    // Status @0xed561085a4a66264

    const personNode = nodes.find(n => n.id === 0xf43297c220fd1f3fn);
    const companyNode = nodes.find(n => n.id === 0x88007c9f2f9f703en);
    const statusNode = nodes.find(n => n.id === 0xed561085a4a66264n);

    // 检查 Person
    expect(personNode).toBeDefined();
    expect(personNode?.isStruct).toBe(true);

    if (personNode?.isStruct) {
      const fields = personNode.structFields;
      expect(fields.length).toBe(3);
      expect(fields[0].name).toBe('name');
      expect(fields[1].name).toBe('age');
      expect(fields[2].name).toBe('email');
    }

    // 检查 Company
    expect(companyNode).toBeDefined();
    expect(companyNode?.isStruct).toBe(true);

    if (companyNode?.isStruct) {
      const fields = companyNode.structFields;
      expect(fields.length).toBe(2);
      expect(fields[0].name).toBe('name');
      expect(fields[1].name).toBe('employees');
    }

    // 检查 Status
    expect(statusNode).toBeDefined();
    expect(statusNode?.isEnum).toBe(true);

    if (statusNode?.isEnum) {
      const enumerants = statusNode.enumEnumerants;
      expect(enumerants.length).toBe(3);
      expect(enumerants[0].name).toBe('active');
      expect(enumerants[1].name).toBe('inactive');
      expect(enumerants[2].name).toBe('pending');
    }
  });
});
