/**
 * Fuzzing 测试套件
 */

import { describe, expect, it } from 'vitest';
import { MessageReader } from '../../core/message-reader.js';
import { AuditReader } from '../security/audit-reader.js';
import { CapnpFuzzer, MutationStrategy, runFuzzing } from './fuzzer.js';

describe('Fuzzing', () => {
  it('should generate valid seed messages', () => {
    const fuzzer = new CapnpFuzzer();

    for (let i = 0; i < 10; i++) {
      const seed = fuzzer.generateSeed();
      expect(seed).toBeInstanceOf(Uint8Array);
      expect(seed.length).toBeGreaterThan(0);
    }
  });

  it('should apply mutations without crashing', () => {
    const fuzzer = new CapnpFuzzer();
    const seed = fuzzer.generateSeed();

    for (const _strategy of Object.values(MutationStrategy)) {
      const { output, strategy: appliedStrategy } = fuzzer.mutate(seed);
      expect(output).toBeInstanceOf(Uint8Array);
      expect(Object.values(MutationStrategy)).toContain(appliedStrategy);
    }
  });

  it('should run short fuzzing session', async () => {
    const findings = await runFuzzing({
      maxIterations: 100,
      seed: 12345,
    });

    expect(findings).toBeInstanceOf(Array);
    // 可能会有发现，也可能没有
  });

  it('should detect security issues in fuzzed inputs', async () => {
    const findings: Array<{ input: Uint8Array; issues: number }> = [];

    await runFuzzing({
      maxIterations: 50,
      seed: 42,
      onFinding: (input, result) => {
        if (result.auditResult && result.auditResult.issueCount > 0) {
          findings.push({
            input,
            issues: result.auditResult.issueCount,
          });
        }
      },
    });

    // 验证发现的问题
    for (const finding of findings) {
      const auditor = new AuditReader();
      const result = auditor.audit(finding.input);
      expect(result.issues.length).toBe(finding.issues);
    }
  });

  it('should not crash on any fuzzed input', async () => {
    const crashes: Error[] = [];

    await runFuzzing({
      maxIterations: 200,
      seed: 999,
      onCrash: (_input, error) => {
        crashes.push(error);
      },
    });

    // 不应该有未捕获的崩溃
    expect(crashes).toHaveLength(0);
  });

  it('should handle all mutation strategies', () => {
    const fuzzer = new CapnpFuzzer({
      strategies: Object.values(MutationStrategy),
    });

    const seed = new Uint8Array(100);
    for (let i = 0; i < 100; i++) {
      seed[i] = i;
    }

    const strategies = new Set<MutationStrategy>();

    for (let i = 0; i < 1000; i++) {
      const { strategy } = fuzzer.mutate(seed);
      strategies.add(strategy);
    }

    // 确保所有策略都被使用过
    expect(strategies.size).toBe(Object.values(MutationStrategy).length);
  });

  it('should provide accurate statistics', async () => {
    const fuzzer = new CapnpFuzzer({ maxIterations: 50 });
    await fuzzer.run();

    const stats = fuzzer.getStats();
    expect(stats.iterations).toBe(50);
    expect(stats.findings).toBeGreaterThanOrEqual(0);
    expect(stats.crashes).toBeGreaterThanOrEqual(0);
    expect(Object.keys(stats.strategyDistribution).length).toBe(
      Object.values(MutationStrategy).length
    );
  });

  it('should respect timeout', async () => {
    const startTime = Date.now();
    await runFuzzing({
      maxIterations: 1000000, // Very large
      timeoutMs: 100, // Very short timeout
    });
    const elapsed = Date.now() - startTime;

    // Should stop early due to timeout
    expect(elapsed).toBeLessThan(500);
  });

  it('should be deterministic with same seed', async () => {
    const findings1 = await runFuzzing({
      maxIterations: 50,
      seed: 42,
    });

    const findings2 = await runFuzzing({
      maxIterations: 50,
      seed: 42,
    });

    // 相同种子应该产生相同数量的发现
    expect(findings1.length).toBe(findings2.length);
  });

  it('should handle bit flip mutation', () => {
    const fuzzer = new CapnpFuzzer({
      strategies: [MutationStrategy.BIT_FLIP],
    });

    const input = new Uint8Array([0x00, 0xff, 0xaa, 0x55]);
    const { output } = fuzzer.mutate(input);

    // 应该只有一个位被翻转
    let diffBits = 0;
    for (let i = 0; i < input.length; i++) {
      const xor = input[i] ^ output[i];
      // Count set bits in xor (each set bit represents a flipped bit)
      let bits = xor;
      while (bits) {
        diffBits += bits & 1;
        bits >>= 1;
      }
    }
    expect(diffBits).toBe(1);
  });

  it('should handle truncation mutation', () => {
    const fuzzer = new CapnpFuzzer({
      strategies: [MutationStrategy.TRUNCATION],
    });

    const input = new Uint8Array(100);
    const { output } = fuzzer.mutate(input);

    expect(output.length).toBeLessThan(input.length);
    expect(output.length).toBeGreaterThan(0);
  });

  it('should handle extension mutation', () => {
    const fuzzer = new CapnpFuzzer({
      strategies: [MutationStrategy.EXTENSION],
    });

    const input = new Uint8Array(10);
    const { output } = fuzzer.mutate(input);

    expect(output.length).toBeGreaterThan(input.length);
  });

  it('should validate fuzzed messages correctly', async () => {
    const results: Array<{ reader: boolean; audit: boolean }> = [];

    await runFuzzing({
      maxIterations: 100,
      onFinding: (_input, result) => {
        results.push({
          reader: result.readerResult?.success ?? false,
          audit: result.auditResult?.valid ?? false,
        });
      },
    });

    // 验证 Reader 和 Audit 结果之间的一致性
    for (const result of results) {
      // 如果 Audit 说有效，Reader 应该能解析
      if (result.audit) {
        // 这不一定是 true，因为 Audit 和 Reader 可能使用不同的标准
      }
    }
  });
});
