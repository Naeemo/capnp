import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodeGeneratorRequestReader } from '../schema/schema-reader.js';
import { generateFromRequest } from './generator.js';

describe('Code Generator', () => {
  it('should generate TypeScript from binary schema', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'capnp-test-'));
    const schemaFile = join(tempDir, 'test.capnp');
    const binFile = join(tempDir, 'test.bin');

    // 创建测试 schema
    const schema = `
@0xdbb9ad1f14bf0b36;

struct Person {
  name @0 :Text;
  age @1 :UInt32;
}
    `;

    writeFileSync(schemaFile, schema);

    // 编译为二进制 schema
    execSync(`capnp compile -o- "${schemaFile}" > "${binFile}"`, { encoding: 'utf-8' });

    // 读取并生成代码
    const buffer = readFileSync(binFile);
    const reader = new CodeGeneratorRequestReader(buffer);
    const code = generateFromRequest(reader);

    // 验证生成的代码
    expect(code).toContain('class PersonReader');
    expect(code).toContain('class PersonBuilder');
    expect(code).toContain('get name(): string');
    expect(code).toContain('get age(): number');

    // 清理
    rmSync(tempDir, { recursive: true });
  });
});
