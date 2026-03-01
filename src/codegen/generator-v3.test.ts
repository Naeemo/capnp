import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CodeGeneratorRequestReader } from '../schema/schema-reader.js';
import { generateFromRequest } from './generator-v3.js';

const __dirname = new URL('.', import.meta.url).pathname;

describe('Generator V3', () => {
  it('should generate TypeScript from binary schema', () => {
    const fs = require('node:fs');
    const path = require('node:path');

    // 创建临时测试 schema
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

    const tmpDir = '/tmp/capnp-test';
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'test.capnp'), testSchema);

    // 编译为 binary schema
    execSync('capnp compile -o- test.capnp > test.capnp.bin', { cwd: tmpDir });

    // 读取 binary schema
    const buffer = fs.readFileSync(path.join(tmpDir, 'test.capnp.bin'));
    const request = CodeGeneratorRequestReader.fromBuffer(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    );

    // 生成 TypeScript 代码
    const files = generateFromRequest(request);

    // 检查生成的代码
    const testTs = files.get('test.ts');
    expect(testTs).toBeDefined();

    // 验证生成的代码包含预期的内容
    expect(testTs).toContain('export interface Person');
    expect(testTs).toContain('export class PersonReader');
    expect(testTs).toContain('export enum Status');
    expect(testTs).toContain('active = 0');

    // 清理
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
