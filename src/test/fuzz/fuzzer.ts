/**
 * Cap'n Proto Fuzzing 框架
 * 随机生成畸形消息进行安全测试
 */

import { MessageReader } from '../../core/message-reader.js';
import { AuditReader } from '../security/audit-reader.js';
import {
  encodeStructPointer,
  encodeListPointer,
  encodeFarPointer,
  PointerTag,
  ElementSize,
} from '../../core/pointer.js';

/**
 * 变异策略类型
 */
export enum MutationStrategy {
  BIT_FLIP = 'bit_flip',
  BYTE_FLIP = 'byte_flip',
  WORD_FLIP = 'word_flip',
  TRUNCATION = 'truncation',
  EXTENSION = 'extension',
  RANDOM_VALUE = 'random_value',
  POINTER_MUTATION = 'pointer_mutation',
  SEGMENT_CORRUPTION = 'segment_corruption',
  INTERESTING_VALUE = 'interesting_value',
}

/**
 * 有趣的值（常用于触发边界条件）
 */
const INTERESTING_VALUES = [
  0x00, 0x01, 0x7f, 0x80, 0xff,
  0x0000, 0x0001, 0x7fff, 0x8000, 0xffff,
  0x00000000, 0x00000001, 0x7fffffff, 0x80000000, 0xffffffff,
  0x40, 0x41, 0x3f, // Around max segment count
];

/**
 * Fuzzer 配置
 */
export interface FuzzerConfig {
  seed?: number;
  maxIterations?: number;
  strategies?: MutationStrategy[];
  timeoutMs?: number;
  onCrash?: (input: Uint8Array, error: Error) => void;
  onFinding?: (input: Uint8Array, result: FuzzResult) => void;
}

/**
 * Fuzz 结果
 */
export interface FuzzResult {
  input: Uint8Array;
  strategy: MutationStrategy;
  iteration: number;
  readerResult?: {
    segmentCount: number;
    success: boolean;
    error?: string;
  };
  auditResult?: {
    valid: boolean;
    issueCount: number;
  };
  crash?: {
    error: string;
    stack?: string;
  };
}

/**
 * 随机数生成器（可重现）
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number = Date.now()) {
    this.seed = seed;
  }

  /**
   * 生成 [0, 1) 的随机数
   */
  next(): number {
    // xorshift
    this.seed ^= this.seed << 13;
    this.seed ^= this.seed >> 17;
    this.seed ^= this.seed << 5;
    return ((this.seed >>> 0) % 1000000) / 1000000;
  }

  /**
   * 生成 [min, max) 的整数
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }

  /**
   * 生成随机布尔值
   */
  nextBool(): boolean {
    return this.next() >= 0.5;
  }

  /**
   * 从数组中随机选择
   */
  pick<T>(array: T[]): T {
    return array[this.nextInt(0, array.length)];
  }
}

/**
 * Cap'n Proto Fuzzer
 */
export class CapnpFuzzer {
  private rng: SeededRandom;
  private config: Required<FuzzerConfig>;
  private iteration = 0;
  private findings: FuzzResult[] = [];

  constructor(config: FuzzerConfig = {}) {
    this.config = {
      seed: config.seed ?? Date.now(),
      maxIterations: config.maxIterations ?? 1000,
      strategies: config.strategies ?? Object.values(MutationStrategy),
      timeoutMs: config.timeoutMs ?? 5000,
      onCrash: config.onCrash ?? (() => {}),
      onFinding: config.onFinding ?? (() => {}),
    };
    this.rng = new SeededRandom(this.config.seed);
  }

  /**
   * 生成随机种子消息
   */
  generateSeed(): Uint8Array {
    const strategies = [
      () => this.generateMinimalMessage(),
      () => this.generateSingleSegmentMessage(),
      () => this.generateMultiSegmentMessage(),
      () => this.generateNestedStructMessage(),
      () => this.generateListMessage(),
      () => this.generateFarPointerMessage(),
    ];
    const generator = this.rng.pick(strategies);
    return generator();
  }

  /**
   * 生成最小消息
   */
  private generateMinimalMessage(): Uint8Array {
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);

    // Header: 1 segment, 1 word
    view.setUint32(0, 0, true);
    view.setUint32(4, 1, true);

    // Empty struct pointer
    view.setBigUint64(8, 0n, true);

    return new Uint8Array(buffer);
  }

  /**
   * 生成单段消息
   */
  private generateSingleSegmentMessage(): Uint8Array {
    const dataWords = this.rng.nextInt(0, 10);
    const pointerCount = this.rng.nextInt(0, 5);
    const totalWords = 1 + dataWords + pointerCount;

    const buffer = new ArrayBuffer(8 + totalWords * 8);
    const view = new DataView(buffer);

    view.setUint32(0, 0, true);
    view.setUint32(4, totalWords, true);

    // Struct pointer
    const ptr = encodeStructPointer(0, dataWords, pointerCount);
    view.setBigUint64(8, ptr, true);

    // Random data
    for (let i = 0; i < dataWords + pointerCount; i++) {
      const value = BigInt.asUintN(64, BigInt(this.rng.nextInt(0, Number.MAX_SAFE_INTEGER)));
      view.setBigUint64(16 + i * 8, value, true);
    }

    return new Uint8Array(buffer);
  }

  /**
   * 生成多段消息
   */
  private generateMultiSegmentMessage(): Uint8Array {
    const segmentCount = this.rng.nextInt(2, 5);
    const segmentSizes: number[] = [];

    for (let i = 0; i < segmentCount; i++) {
      segmentSizes.push(this.rng.nextInt(1, 10));
    }

    const headerSize = 8 + (segmentCount - 1) * 4;
    const alignedHeaderSize = (headerSize + 7) & ~7;
    const totalSize = alignedHeaderSize + segmentSizes.reduce((a, b) => a + b * 8, 0);

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);

    view.setUint32(0, segmentCount - 1, true);
    view.setUint32(4, segmentSizes[0], true);

    let offset = 8;
    for (let i = 1; i < segmentCount; i++) {
      view.setUint32(offset, segmentSizes[i], true);
      offset += 4;
    }

    offset = alignedHeaderSize;
    for (let i = 0; i < segmentCount; i++) {
      for (let j = 0; j < segmentSizes[i]; j++) {
        const value = BigInt.asUintN(64, BigInt(this.rng.nextInt(0, Number.MAX_SAFE_INTEGER)));
        view.setBigUint64(offset + j * 8, value, true);
      }
      offset += segmentSizes[i] * 8;
    }

    return new Uint8Array(buffer);
  }

  /**
   * 生成嵌套结构消息
   */
  private generateNestedStructMessage(): Uint8Array {
    const depth = this.rng.nextInt(1, 10);
    const wordsPerLayer = 2;
    const totalWords = 1 + depth * wordsPerLayer;

    const buffer = new ArrayBuffer(8 + totalWords * 8);
    const view = new DataView(buffer);

    view.setUint32(0, 0, true);
    view.setUint32(4, totalWords, true);

    // Root pointer
    const rootPtr = encodeStructPointer(1, 0, 1);
    view.setBigUint64(8, rootPtr, true);

    let currentOffset = 2;
    for (let i = 0; i < depth; i++) {
      if (i < depth - 1) {
        const nextPtr = encodeStructPointer(1, 0, 1);
        view.setBigUint64(currentOffset * 8, nextPtr, true);
      }
      currentOffset += wordsPerLayer;
    }

    return new Uint8Array(buffer);
  }

  /**
   * 生成列表消息
   */
  private generateListMessage(): Uint8Array {
    const elementCount = this.rng.nextInt(0, 20);
    const elementSize = this.rng.pick([
      ElementSize.VOID,
      ElementSize.BIT,
      ElementSize.BYTE,
      ElementSize.TWO_BYTES,
      ElementSize.FOUR_BYTES,
      ElementSize.EIGHT_BYTES,
    ]);

    let elementWords = 1;
    switch (elementSize) {
      case ElementSize.VOID:
      case ElementSize.BIT:
        elementWords = 0;
        break;
      case ElementSize.BYTE:
        elementWords = Math.ceil(elementCount / 8);
        break;
      case ElementSize.TWO_BYTES:
        elementWords = Math.ceil(elementCount / 4);
        break;
      case ElementSize.FOUR_BYTES:
        elementWords = Math.ceil(elementCount / 2);
        break;
      case ElementSize.EIGHT_BYTES:
        elementWords = elementCount;
        break;
    }

    const totalWords = 1 + elementWords;
    const buffer = new ArrayBuffer(8 + totalWords * 8);
    const view = new DataView(buffer);

    view.setUint32(0, 0, true);
    view.setUint32(4, totalWords, true);

    const ptr = encodeListPointer(0, elementSize, elementCount);
    view.setBigUint64(8, ptr, true);

    return new Uint8Array(buffer);
  }

  /**
   * 生成 Far Pointer 消息
   */
  private generateFarPointerMessage(): Uint8Array {
    const buffer = new ArrayBuffer(48);
    const view = new DataView(buffer);

    view.setUint32(0, 1, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, 2, true);

    const farPtr = encodeFarPointer(1, 0, false);
    view.setBigUint64(16, farPtr, true);

    const structPtr = encodeStructPointer(0, 1, 0);
    view.setBigUint64(32, structPtr, true);

    return new Uint8Array(buffer);
  }

  /**
   * 变异输入
   */
  mutate(input: Uint8Array): { output: Uint8Array; strategy: MutationStrategy } {
    const strategy = this.rng.pick(this.config.strategies);
    const output = new Uint8Array(input);

    switch (strategy) {
      case MutationStrategy.BIT_FLIP:
        return { output: this.bitFlip(output), strategy };
      case MutationStrategy.BYTE_FLIP:
        return { output: this.byteFlip(output), strategy };
      case MutationStrategy.WORD_FLIP:
        return { output: this.wordFlip(output), strategy };
      case MutationStrategy.TRUNCATION:
        return { output: this.truncate(output), strategy };
      case MutationStrategy.EXTENSION:
        return { output: this.extend(output), strategy };
      case MutationStrategy.RANDOM_VALUE:
        return { output: this.randomValue(output), strategy };
      case MutationStrategy.POINTER_MUTATION:
        return { output: this.pointerMutation(output), strategy };
      case MutationStrategy.SEGMENT_CORRUPTION:
        return { output: this.segmentCorruption(output), strategy };
      case MutationStrategy.INTERESTING_VALUE:
        return { output: this.interestingValue(output), strategy };
      default:
        return { output, strategy };
    }
  }

  /**
   * 位翻转
   */
  private bitFlip(input: Uint8Array): Uint8Array {
    if (input.length === 0) return input;
    const pos = this.rng.nextInt(0, input.length);
    const bit = this.rng.nextInt(0, 8);
    input[pos] ^= 1 << bit;
    return input;
  }

  /**
   * 字节翻转
   */
  private byteFlip(input: Uint8Array): Uint8Array {
    if (input.length < 2) return input;
    const pos1 = this.rng.nextInt(0, input.length);
    const pos2 = this.rng.nextInt(0, input.length);
    const temp = input[pos1];
    input[pos1] = input[pos2];
    input[pos2] = temp;
    return input;
  }

  /**
   * 字翻转（64位）
   */
  private wordFlip(input: Uint8Array): Uint8Array {
    if (input.length < 16) return input;
    const wordCount = Math.floor(input.length / 8);
    const pos1 = this.rng.nextInt(0, wordCount);
    const pos2 = this.rng.nextInt(0, wordCount);

    for (let i = 0; i < 8; i++) {
      const temp = input[pos1 * 8 + i];
      input[pos1 * 8 + i] = input[pos2 * 8 + i];
      input[pos2 * 8 + i] = temp;
    }
    return input;
  }

  /**
   * 截断
   */
  private truncate(input: Uint8Array): Uint8Array {
    if (input.length <= 1) return input;
    const newLength = this.rng.nextInt(1, input.length);
    return input.slice(0, newLength);
  }

  /**
   * 扩展
   */
  private extend(input: Uint8Array): Uint8Array {
    const extension = new Uint8Array(this.rng.nextInt(1, 100));
    for (let i = 0; i < extension.length; i++) {
      extension[i] = this.rng.nextInt(0, 256);
    }
    const result = new Uint8Array(input.length + extension.length);
    result.set(input);
    result.set(extension, input.length);
    return result;
  }

  /**
   * 随机值
   */
  private randomValue(input: Uint8Array): Uint8Array {
    if (input.length === 0) return input;
    const pos = this.rng.nextInt(0, input.length);
    input[pos] = this.rng.nextInt(0, 256);
    return input;
  }

  /**
   * 指针变异
   */
  private pointerMutation(input: Uint8Array): Uint8Array {
    if (input.length < 16) return input;
    const view = new DataView(input.buffer, input.byteOffset, input.byteLength);

    // 修改指针字段
    const ptrOffset = this.rng.nextInt(1, Math.floor(input.length / 8));
    const mutation = this.rng.nextInt(0, 5);

    switch (mutation) {
      case 0: // 改变偏移量
        view.setUint32(ptrOffset * 8, this.rng.nextInt(0, 0xffffffff), true);
        break;
      case 1: // 改变 tag
        view.setUint8(ptrOffset * 8, this.rng.nextInt(0, 3));
        break;
      case 2: // 设置巨大值
        view.setBigUint64(ptrOffset * 8, BigInt('0xFFFFFFFFFFFFFFFF'), true);
        break;
      case 3: // 设置为零
        view.setBigUint64(ptrOffset * 8, 0n, true);
        break;
      case 4: // 设置为 far pointer
        const farPtr = encodeFarPointer(
          this.rng.nextInt(0, 100),
          this.rng.nextInt(0, 100),
          this.rng.nextBool()
        );
        view.setBigUint64(ptrOffset * 8, farPtr, true);
        break;
    }

    return input;
  }

  /**
   * 段头损坏
   */
  private segmentCorruption(input: Uint8Array): Uint8Array {
    if (input.length < 8) return input;
    const view = new DataView(input.buffer, input.byteOffset, input.byteLength);

    const mutation = this.rng.nextInt(0, 4);
    switch (mutation) {
      case 0: // 极大段数
        view.setUint32(0, 0xffffffff, true);
        break;
      case 1: // 极大段大小
        view.setUint32(4, 0xffffffff, true);
        break;
      case 2: // 段数为0
        view.setUint32(0, 0, true);
        break;
      case 3: // 负段大小
        view.setInt32(4, -1, true);
        break;
    }

    return input;
  }

  /**
   * 有趣的值
   */
  private interestingValue(input: Uint8Array): Uint8Array {
    if (input.length < 8) return input;
    const value = this.rng.pick(INTERESTING_VALUES);
    const size = this.rng.pick([1, 2, 4]);
    const pos = this.rng.nextInt(0, input.length - size + 1);
    const view = new DataView(input.buffer, input.byteOffset, input.byteLength);

    switch (size) {
      case 1:
        view.setUint8(pos, value & 0xff);
        break;
      case 2:
        view.setUint16(pos, value & 0xffff, true);
        break;
      case 4:
        view.setUint32(pos, value & 0xffffffff, true);
        break;
    }

    return input;
  }

  /**
   * 运行 fuzzing
   */
  run(): FuzzResult[] {
    this.findings = [];
    const startTime = Date.now();

    for (this.iteration = 0; this.iteration < this.config.maxIterations; this.iteration++) {
      if (Date.now() - startTime > this.config.timeoutMs) {
        break;
      }

      const seed = this.generateSeed();
      const { output: mutated, strategy } = this.mutate(seed);

      const result = this.testInput(mutated, strategy);

      if (result.crash || (result.auditResult && !result.auditResult.valid)) {
        this.findings.push(result);
        this.config.onFinding(mutated, result);
      }
    }

    return this.findings;
  }

  /**
   * 测试单个输入
   */
  private testInput(input: Uint8Array, strategy: MutationStrategy): FuzzResult {
    const result: FuzzResult = {
      input,
      strategy,
      iteration: this.iteration,
    };

    // 测试 MessageReader
    try {
      const reader = new MessageReader(input);
      result.readerResult = {
        segmentCount: reader.segmentCount,
        success: true,
      };

      // 尝试获取根（可能抛出）
      try {
        reader.getRoot(0, 0);
      } catch (e) {
        // 预期行为，不一定是崩溃
      }
    } catch (error) {
      result.readerResult = {
        segmentCount: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
      result.crash = {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      };
      this.config.onCrash(input, error instanceof Error ? error : new Error(String(error)));
    }

    // 测试 AuditReader
    try {
      const auditor = new AuditReader();
      const auditResult = auditor.audit(input);
      result.auditResult = {
        valid: auditResult.valid,
        issueCount: auditResult.issues.length,
      };
    } catch (error) {
      result.crash = {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      };
      this.config.onCrash(input, error instanceof Error ? error : new Error(String(error)));
    }

    return result;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    iterations: number;
    findings: number;
    crashes: number;
    strategyDistribution: Record<MutationStrategy, number>;
  } {
    const strategyDistribution = {} as Record<MutationStrategy, number>;
    for (const strategy of Object.values(MutationStrategy)) {
      strategyDistribution[strategy] = this.findings.filter((f) => f.strategy === strategy).length;
    }

    return {
      iterations: this.iteration,
      findings: this.findings.length,
      crashes: this.findings.filter((f) => f.crash).length,
      strategyDistribution,
    };
  }
}

/**
 * 简单的 fuzzing 运行器
 */
export async function runFuzzing(options?: FuzzerConfig): Promise<FuzzResult[]> {
  const fuzzer = new CapnpFuzzer(options);
  return fuzzer.run();
}

/**
 * 持续 fuzzing（直到手动停止）
 */
export async function runContinuousFuzzing(
  options?: Omit<FuzzerConfig, 'maxIterations'> & { maxFindings?: number }
): Promise<FuzzResult[]> {
  const findings: FuzzResult[] = [];
  let iteration = 0;

  const fuzzer = new CapnpFuzzer({
    ...options,
    maxIterations: Number.MAX_SAFE_INTEGER,
    onFinding: (input, result) => {
      findings.push(result);
      options?.onFinding?.(input, result);
    },
  });

  const startTime = Date.now();
  const timeoutMs = options?.timeoutMs ?? 60000;
  const maxFindings = (options as { maxFindings?: number })?.maxFindings ?? Number.MAX_SAFE_INTEGER;

  return new Promise((resolve) => {
    const runIteration = () => {
      if (Date.now() - startTime > timeoutMs || findings.length >= maxFindings) {
        resolve(findings);
        return;
      }

      // Run batch of iterations
      for (let i = 0; i < 100; i++) {
        iteration++;
        const seed = fuzzer['generateSeed']();
        const { output: mutated, strategy } = fuzzer['mutate'](seed);
        const result = fuzzer['testInput'](mutated, strategy);

        if (result.crash || (result.auditResult && !result.auditResult.valid)) {
          findings.push(result);
          options?.onFinding?.(mutated, result);
        }
      }

      // Schedule next batch
      setImmediate(runIteration);
    };

    runIteration();
  });
}
