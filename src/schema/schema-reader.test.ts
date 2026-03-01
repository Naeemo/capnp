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
    
    console.log('Total nodes:', nodes.length);
    
    // 只检查我们关心的节点（通过 ID 匹配）
    // Person @0xed5bcc458b243f52
    // Company @0xb32a009cb334d3c0
    // Status @0xcf10ad07151bc11a
    
    const personNode = nodes.find(n => n.id === 0xed5bcc458b243f52n);
    const companyNode = nodes.find(n => n.id === 0xb32a009cb334d3c0n);
    const statusNode = nodes.find(n => n.id === 0xcf10ad07151bc11an);
    
    console.log('Person node:', personNode ? 'found' : 'not found');
    console.log('Company node:', companyNode ? 'found' : 'not found');
    console.log('Status node:', statusNode ? 'found' : 'not found');
    
    // 检查 Person
    expect(personNode).toBeDefined();
    expect(personNode?.isStruct).toBe(true);
    
    if (personNode?.isStruct) {
      console.log('Person dataWordCount:', personNode.structDataWordCount);
      console.log('Person pointerCount:', personNode.structPointerCount);
      
      const fields = personNode.structFields;
      console.log('Person fields:', fields.length);
      for (const f of fields) {
        console.log(`  - ${f.name}: ${f.slotType?.kind}`);
      }
      
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
      console.log('Company fields:', fields.length);
      expect(fields.length).toBe(2);
      expect(fields[0].name).toBe('name');
      expect(fields[1].name).toBe('employees');
    }
    
    // 检查 Status
    expect(statusNode).toBeDefined();
    expect(statusNode?.isEnum).toBe(true);
    
    if (statusNode?.isEnum) {
      const enumerants = statusNode.enumEnumerants;
      console.log('Status enumerants:', enumerants.length);
      for (const e of enumerants) {
        console.log(`  - ${e.name}`);
      }
      expect(enumerants.length).toBe(3);
      expect(enumerants[0].name).toBe('active');
      expect(enumerants[1].name).toBe('inactive');
      expect(enumerants[2].name).toBe('pending');
    }
  });
});
