import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodeGeneratorRequestReader } from './schema-reader.js';

describe('Schema Reader', () => {
  it('should read binary schema file', () => {
    // 创建临时测试 schema
    const tmpDir = mkdtempSync(join(tmpdir(), 'capnp-test-'));
    const testSchema = `
@0xdbb9ad1f14bf0b36;

struct Person {
  name @0 :Text;
  age @1 :UInt32;
  email @2 :Text;
}

struct Company {
  name @0 :Text;
  employees @1 :List(Person);
}

enum Status {
  active @0;
  inactive @1;
  pending @2;
}
`;
    
    writeFileSync(join(tmpDir, 'test.capnp'), testSchema);
    execSync('capnp compile -o- test.capnp > test.capnp.bin', { cwd: tmpDir });
    
    const buffer = readFileSync(join(tmpDir, 'test.capnp.bin'));
    const request = CodeGeneratorRequestReader.fromBuffer(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    
    const nodes = request.nodes;
    expect(nodes.length).toBeGreaterThan(0);
    
    // 通过 ID 查找节点
    const personNode = nodes.find(n => n.id === 0xed5bcc458b243f52n);
    const companyNode = nodes.find(n => n.id === 0xb32a009cb334d3c0n);
    const statusNode = nodes.find(n => n.id === 0xcf10ad07151bc11an);
    
    // 检查 Person
    expect(personNode).toBeDefined();
    expect(personNode?.isStruct).toBe(true);
    
    if (personNode?.isStruct) {
      expect(personNode.structDataWordCount).toBe(1);
      expect(personNode.structPointerCount).toBe(2);
      
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
    
    // 清理
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
