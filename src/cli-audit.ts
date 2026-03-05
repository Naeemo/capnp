import { readFileSync } from 'node:fs';
import {
  ElementSize,
  type FarPointer,
  type ListPointer,
  PointerTag,
  type StructPointer,
  decodePointer,
} from './core/pointer.js';
import { Segment, WORD_SIZE } from './core/segment.js';

/**
 * 审计安全选项配置
 */
export interface AuditSecurityOptions {
  /** 最大段数限制（默认64） */
  maxSegments?: number;
  /** 消息总大小限制，单位字节（默认64MB） */
  maxTotalSize?: number;
  /** 严格模式，遇到异常立即抛出而非静默处理（默认false） */
  strictMode?: boolean;
}

/** 默认安全选项 */
const DEFAULT_AUDIT_OPTIONS: Required<AuditSecurityOptions> = {
  maxSegments: 64,
  maxTotalSize: 64 * 1024 * 1024, // 64MB
  strictMode: false,
};

/**
 * 审计问题类型
 */
export type AuditIssueType = 'error' | 'warning' | 'info';

/**
 * 审计问题
 */
export interface AuditIssue {
  /** 问题类型 */
  type: AuditIssueType;
  /** 问题分类 */
  category: string;
  /** 问题描述 */
  message: string;
  /** 问题位置 */
  location: string;
  /** 修复建议 */
  suggestion?: string;
}

/**
 * 审计报告
 */
export interface AuditReport {
  /** 文件路径 */
  filePath: string;
  /** 文件大小 */
  fileSize: number;
  /** 是否通过审计 */
  passed: boolean;
  /** 段数 */
  segmentCount: number;
  /** 总字数 */
  totalWords: number;
  /** 问题列表 */
  issues: AuditIssue[];
  /** 摘要 */
  summary: {
    error: number;
    warning: number;
    info: number;
  };
  /** 扫描的指针数量 */
  pointersScanned: number;
  /** 最大嵌套深度 */
  maxNestingDepth: number;
}

/**
 * Cap'n Proto 消息审计读取器
 * 用于安全审计消息文件
 */
export class AuditReader {
  private segments: Segment[];
  private options: Required<AuditSecurityOptions>;
  private issues: AuditIssue[] = [];
  private visitedPointers = new Set<string>();
  private pointersScanned = 0;
  private maxNestingDepth = 0;

  constructor(
    buffer: ArrayBuffer | Uint8Array,
    options: AuditSecurityOptions = {}
  ) {
    this.options = { ...DEFAULT_AUDIT_OPTIONS, ...options };
    const uint8Array = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;

    // 初始化空段数组
    this.segments = [];

    // 检查最小大小
    if (uint8Array.byteLength < 8) {
      this.addIssue('error', 'invalid_header', '消息太小，无法包含有效的 Cap\'n Proto 头部', 'header', '消息至少需要8字节的头部');
      return;
    }

    // 检查总大小限制
    if (uint8Array.byteLength > this.options.maxTotalSize) {
      this.addIssue(
        'error',
        'size_exceeded',
        `消息大小(${uint8Array.byteLength}字节)超过最大限制(${this.options.maxTotalSize}字节)`,
        'header',
        '减小消息大小或增加 --max-size 限制'
      );
      if (this.options.strictMode) return;
    }

    // 解析消息头
    const view = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);
    const firstWordLow = view.getUint32(0, true);
    const firstWordHigh = view.getUint32(4, true);

    const segmentCount = (firstWordLow & 0xffffffff) + 1;
    const firstSegmentSize = firstWordHigh;

    // 检查段数限制
    if (segmentCount > this.options.maxSegments) {
      this.addIssue(
        'error',
        'segment_count_exceeded',
        `段数(${segmentCount})超过最大限制(${this.options.maxSegments})`,
        'header',
        '减少段数或增加 --max-segments 限制'
      );
      if (this.options.strictMode) return;
    }

    let offset = 8;
    const segmentSizes: number[] = [firstSegmentSize];

    // 读取剩余段大小
    for (let i = 1; i < segmentCount; i++) {
      if (offset + 4 > uint8Array.byteLength) {
        this.addIssue(
          'error',
          'truncated_header',
          '段表在段大小信息之前结束',
          `header.segment[${i}]`,
          '消息文件可能已损坏'
        );
        return;
      }
      segmentSizes.push(view.getUint32(offset, true));
      offset += 4;
    }

    // 对齐到 8 字节
    offset = (offset + 7) & ~7;

    if (offset > uint8Array.byteLength) {
      this.addIssue(
        'error',
        'truncated_header',
        '段表头部不完整',
        'header',
        '消息文件可能已损坏'
      );
      return;
    }

    // 创建段
    let totalWords = 0;
    for (let i = 0; i < segmentSizes.length; i++) {
      const size = segmentSizes[i];
      totalWords += size;

      if (offset + size * WORD_SIZE > uint8Array.byteLength) {
        this.addIssue(
          'warning',
          'truncated_segment',
          `段${i}数据不足，声明大小:${size}字，实际可用:${Math.floor((uint8Array.byteLength - offset) / WORD_SIZE)}字`,
          `segment[${i}]`,
          '消息文件可能已损坏或被截断'
        );
        break;
      }
      const segmentBuffer = uint8Array.slice(offset, offset + size * WORD_SIZE);
      this.segments.push(Segment.fromBuffer(segmentBuffer.buffer));
      offset += size * WORD_SIZE;
    }

    if (totalWords > this.options.maxTotalSize / WORD_SIZE) {
      this.addIssue(
        'warning',
        'large_message',
        `消息总字数(${totalWords})较大，可能影响性能`,
        'message',
        '考虑分割大型消息'
      );
    }

    // 扫描所有指针
    this.scanAllPointers();
  }

  /**
   * 添加审计问题
   */
  private addIssue(
    type: AuditIssueType,
    category: string,
    message: string,
    location: string,
    suggestion?: string
  ): void {
    this.issues.push({ type, category, message, location, suggestion });
  }

  /**
   * 获取段
   */
  private getSegment(index: number): Segment | undefined {
    return this.segments[index];
  }

  /**
   * 扫描所有指针
   */
  private scanAllPointers(): void {
    if (this.segments.length === 0) return;

    // 从根段开始扫描
    for (let segIdx = 0; segIdx < this.segments.length; segIdx++) {
      const segment = this.segments[segIdx];
      const wordCount = segment.wordCount;

      for (let wordIdx = 0; wordIdx < wordCount; wordIdx++) {
        const ptrValue = segment.getWord(wordIdx);
        if (ptrValue === 0n) continue; // 空指针

        this.scanPointer(segIdx, wordIdx, ptrValue, 0);
      }
    }
  }

  /**
   * 扫描单个指针
   */
  private scanPointer(
    segmentIndex: number,
    wordOffset: number,
    ptrValue: bigint,
    depth: number
  ): void {
    this.pointersScanned++;
    this.maxNestingDepth = Math.max(this.maxNestingDepth, depth);

    // 检查循环引用
    const ptrKey = `${segmentIndex}:${wordOffset}`;
    if (this.visitedPointers.has(ptrKey)) {
      this.addIssue(
        'warning',
        'circular_reference',
        `检测到可能的循环引用 at segment[${segmentIndex}].word[${wordOffset}]`,
        `segment[${segmentIndex}].word[${wordOffset}]`,
        '检查消息结构是否存在循环'
      );
      return;
    }
    this.visitedPointers.add(ptrKey);

    // 检查嵌套深度
    if (depth > 100) {
      this.addIssue(
        'error',
        'nesting_too_deep',
        `指针嵌套深度超过100，可能存在恶意构造的消息`,
        `segment[${segmentIndex}].word[${wordOffset}]`,
        '检查消息是否被恶意构造'
      );
      return;
    }

    const ptr = decodePointer(ptrValue);
    const segment = this.getSegment(segmentIndex);
    if (!segment) return;

    switch (ptr.tag) {
      case PointerTag.STRUCT: {
        const structPtr = ptr as StructPointer;
        const targetOffset = wordOffset + 1 + structPtr.offset;

        // 检查目标范围
        if (targetOffset < 0 || targetOffset + structPtr.dataWords + structPtr.pointerCount > segment.wordCount) {
          this.addIssue(
            'error',
            'out_of_bounds',
            `Struct指针目标超出段范围: offset=${structPtr.offset}, dataWords=${structPtr.dataWords}, pointerCount=${structPtr.pointerCount}`,
            `segment[${segmentIndex}].word[${wordOffset}]`,
            '消息可能已损坏或被篡改'
          );
        }

        // 检查指针区域中的指针
        const pointerStart = targetOffset + structPtr.dataWords;
        for (let i = 0; i < structPtr.pointerCount; i++) {
          const ptrIdx = pointerStart + i;
          if (ptrIdx < segment.wordCount) {
            const nestedPtr = segment.getWord(ptrIdx);
            if (nestedPtr !== 0n) {
              this.scanPointer(segmentIndex, ptrIdx, nestedPtr, depth + 1);
            }
          }
        }
        break;
      }

      case PointerTag.LIST: {
        const listPtr = ptr as ListPointer;

        if (listPtr.elementSize === ElementSize.COMPOSITE) {
          // 需要读取tag word
          const tagOffset = wordOffset + 1 + listPtr.offset;
          if (tagOffset >= 0 && tagOffset < segment.wordCount) {
            const tagWord = segment.getWord(tagOffset);
            const elementCount = Number(tagWord & BigInt(0xffffffff));
            const dataWords = Number((tagWord >> BigInt(32)) & BigInt(0xffff));
            const pointerCount = Number((tagWord >> BigInt(48)) & BigInt(0xffff));

            if (elementCount > 1000000) {
              this.addIssue(
                'warning',
                'large_list',
                `复合列表元素数量异常: ${elementCount}`,
                `segment[${segmentIndex}].word[${wordOffset}]`,
                '检查列表大小是否合理'
              );
            }

            // 检查每个元素中的指针
            const elementSize = dataWords + pointerCount;
            const dataStart = tagOffset + 1;
            for (let i = 0; i < elementCount; i++) {
              for (let j = 0; j < pointerCount; j++) {
                const ptrIdx = dataStart + i * elementSize + dataWords + j;
                if (ptrIdx < segment.wordCount) {
                  const nestedPtr = segment.getWord(ptrIdx);
                  if (nestedPtr !== 0n) {
                    this.scanPointer(segmentIndex, ptrIdx, nestedPtr, depth + 1);
                  }
                }
              }
            }
          }
        } else if (listPtr.elementSize === ElementSize.POINTER) {
          // 指针列表
          const targetOffset = wordOffset + 1 + listPtr.offset;
          for (let i = 0; i < listPtr.elementCount; i++) {
            const ptrIdx = targetOffset + i;
            if (ptrIdx < segment.wordCount) {
              const nestedPtr = segment.getWord(ptrIdx);
              if (nestedPtr !== 0n) {
                this.scanPointer(segmentIndex, ptrIdx, nestedPtr, depth + 1);
              }
            }
          }
        }
        break;
      }

      case PointerTag.FAR: {
        const farPtr = ptr as FarPointer;

        if (farPtr.targetSegment >= this.segments.length) {
          this.addIssue(
            'error',
            'invalid_far_pointer',
            `Far指针引用不存在的段: ${farPtr.targetSegment}`,
            `segment[${segmentIndex}].word[${wordOffset}]`,
            '消息可能已损坏'
          );
        } else {
          const targetSegment = this.getSegment(farPtr.targetSegment);
          if (targetSegment && farPtr.targetOffset >= targetSegment.wordCount) {
            this.addIssue(
              'error',
              'invalid_far_pointer',
              `Far指针目标偏移超出范围: segment=${farPtr.targetSegment}, offset=${farPtr.targetOffset}`,
              `segment[${segmentIndex}].word[${wordOffset}]`,
              '消息可能已损坏'
            );
          }

          if (farPtr.doubleFar) {
            // 检查 double-far  landing pad
            if (targetSegment && farPtr.targetOffset < targetSegment.wordCount) {
              const landingPadPtr = targetSegment.getWord(farPtr.targetOffset);
              if (landingPadPtr !== 0n) {
                this.scanPointer(farPtr.targetSegment, farPtr.targetOffset, landingPadPtr, depth + 1);
              }
            }
          }
        }
        break;
      }

      case PointerTag.CAPABILITY:
        // Capability 指针在序列化消息中不应出现
        this.addIssue(
          'warning',
          'capability_in_message',
          '序列化消息中发现 Capability 指针',
          `segment[${segmentIndex}].word[${wordOffset}]`,
          'Capability 通常不应在序列化消息中'
        );
        break;
    }
  }

  /**
   * 生成审计报告
   */
  generateReport(filePath: string, fileSize: number): AuditReport {
    const errors = this.issues.filter((i) => i.type === 'error').length;
    const warnings = this.issues.filter((i) => i.type === 'warning').length;
    const infos = this.issues.filter((i) => i.type === 'info').length;

    return {
      filePath,
      fileSize,
      passed: errors === 0,
      segmentCount: this.segments.length,
      totalWords: this.segments.reduce((sum, s) => sum + s.wordCount, 0),
      issues: this.issues,
      summary: {
        error: errors,
        warning: warnings,
        info: infos,
      },
      pointersScanned: this.pointersScanned,
      maxNestingDepth: this.maxNestingDepth,
    };
  }
}

/**
 * 格式化审计报告为可读文本
 */
export function formatAuditReport(report: AuditReport): string {
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push('CAP\'N PROTO SECURITY AUDIT REPORT');
  lines.push('='.repeat(60));
  lines.push('');

  // 文件信息
  lines.push('File Information:');
  lines.push(`  Path: ${report.filePath}`);
  lines.push(`  Size: ${report.fileSize.toLocaleString()} bytes`);
  lines.push(`  Segments: ${report.segmentCount}`);
  lines.push(`  Total Words: ${report.totalWords.toLocaleString()}`);
  lines.push(`  Pointers Scanned: ${report.pointersScanned.toLocaleString()}`);
  lines.push(`  Max Nesting Depth: ${report.maxNestingDepth}`);
  lines.push('');

  // 状态
  if (report.passed) {
    lines.push('✅ AUDIT PASSED');
  } else {
    lines.push('❌ AUDIT FAILED');
  }
  lines.push('');

  // 摘要
  lines.push('Summary:');
  lines.push(`  Errors:   ${report.summary.error}`);
  lines.push(`  Warnings: ${report.summary.warning}`);
  lines.push(`  Info:     ${report.summary.info}`);
  lines.push('');

  // 问题详情
  if (report.issues.length > 0) {
    lines.push('Issues:');
    lines.push('-'.repeat(60));

    // 按类型分组
    const errors = report.issues.filter((i) => i.type === 'error');
    const warnings = report.issues.filter((i) => i.type === 'warning');
    const infos = report.issues.filter((i) => i.type === 'info');

    if (errors.length > 0) {
      lines.push('');
      lines.push('❌ ERRORS:');
      for (const issue of errors) {
        lines.push(`  [${issue.category}] ${issue.message}`);
        lines.push(`    Location: ${issue.location}`);
        if (issue.suggestion) {
          lines.push(`    💡 ${issue.suggestion}`);
        }
        lines.push('');
      }
    }

    if (warnings.length > 0) {
      lines.push('');
      lines.push('⚠️  WARNINGS:');
      for (const issue of warnings) {
        lines.push(`  [${issue.category}] ${issue.message}`);
        lines.push(`    Location: ${issue.location}`);
        if (issue.suggestion) {
          lines.push(`    💡 ${issue.suggestion}`);
        }
        lines.push('');
      }
    }

    if (infos.length > 0) {
      lines.push('');
      lines.push('ℹ️  INFO:');
      for (const issue of infos) {
        lines.push(`  [${issue.category}] ${issue.message}`);
        lines.push(`    Location: ${issue.location}`);
        lines.push('');
      }
    }
  } else {
    lines.push('No issues found.');
  }

  lines.push('');
  lines.push('='.repeat(60));

  return lines.join('\n');
}

/**
 * 审计消息文件
 */
export function auditMessageFile(
  filePath: string,
  options: AuditSecurityOptions = {}
): AuditReport {
  const buffer = readFileSync(filePath);
  const reader = new AuditReader(buffer, options);
  return reader.generateReport(filePath, buffer.byteLength);
}

const CLI_VERSION = '0.9.0';

function printUsage() {
  console.log(`
Cap'n Proto Security Audit CLI v${CLI_VERSION}

Usage: capnp audit <file> [options]

Arguments:
  file          Path to Cap'n Proto message binary file

Options:
  --strict              Strict mode, fail on warnings
  --json                Output as JSON
  -o, --output <file>   Write report to file
  --max-segments <n>    Maximum allowed segments (default: 64)
  --max-size <bytes>    Maximum message size in bytes (default: 64MB)
  -h, --help            Show this help

Examples:
  capnp audit message.bin
  capnp audit message.bin --strict
  capnp audit message.bin --json -o report.json
  capnp audit message.bin --max-segments 128 --max-size 134217728
`);
}

function parseArgs(args: string[]) {
  const options: {
    file?: string;
    strict?: boolean;
    json?: boolean;
    output?: string;
    maxSegments?: number;
    maxSize?: number;
  } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--strict') {
      options.strict = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '-o' || arg === '--output') {
      options.output = args[++i];
    } else if (arg === '--max-segments') {
      const val = parseInt(args[++i], 10);
      if (isNaN(val) || val <= 0) {
        console.error('Error: --max-segments must be a positive integer');
        process.exit(1);
      }
      options.maxSegments = val;
    } else if (arg === '--max-size') {
      const val = parseInt(args[++i], 10);
      if (isNaN(val) || val <= 0) {
        console.error('Error: --max-size must be a positive integer');
        process.exit(1);
      }
      options.maxSize = val;
    } else if (!arg.startsWith('-')) {
      if (!options.file) {
        options.file = arg;
      }
    }
  }

  return options;
}

export async function run(args: string[]): Promise<void> {
  const options = parseArgs(args);

  if (!options.file) {
    console.error('Error: File path is required');
    printUsage();
    process.exit(1);
  }

  try {
    const auditOptions: AuditSecurityOptions = {
      strictMode: options.strict,
      maxSegments: options.maxSegments,
      maxTotalSize: options.maxSize,
    };

    const report = auditMessageFile(options.file, auditOptions);

    let output: string;
    if (options.json) {
      output = JSON.stringify(report, null, 2);
    } else {
      output = formatAuditReport(report);
    }

    if (options.output) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(options.output, output, 'utf-8');
      console.log(`Report written to: ${options.output}`);
    } else {
      console.log(output);
    }

    // Exit with error code if audit failed or strict mode has warnings
    const shouldFail = !report.passed || (options.strict && report.summary.warning > 0);
    process.exit(shouldFail ? 1 : 0);
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : err);
    process.exit(2);
  }
}
