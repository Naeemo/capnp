/**
 * 默认值代码生成测试
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CodeGeneratorRequestReader } from '../schema/schema-reader.js';
import { generateFromRequest } from './generator.js';

const __dirname = new URL('.', import.meta.url).pathname;

describe('Generator V3 - Default Values', () => {
  it('should generate code with default values', () => {
    const fs = require('node:fs');
    const path = require('node:path');

    // 创建测试 schema，包含默认值
    const testSchema = `
@0xdbb9ad1f14bf0b36;

struct Config {
  sampleRate @0 :UInt32 = 44100;
  channels @1 :UInt8 = 2;
  enabled @2 :Bool = true;
  volume @3 :Float32 = 1.0;
  name @4 :Text = "default";
}
`;

    const tmpDir = '/tmp/capnp-default-test';
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

    // 验证生成的代码包含 XOR 辅助函数
    expect(testTs).toContain('xorFloat32');
    expect(testTs).toContain('xorFloat64');

    // 验证生成的代码包含默认值处理
    expect(testTs).toContain('44100');
    expect(testTs).toContain('Config');

    console.log('Generated code:');
    console.log(testTs);

    // 清理
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
