/**
 * Cap'n Proto Security Audit Reader
 * 深度安全扫描实现
 */

import { MessageReader, StructReader } from '../core/message-reader.js';
import {
  ElementSize,
  type FarPointer,
  type ListPointer,
  type Pointer,
  PointerTag,
  type StructPointer,
  decodePointer,
} from '../core/pointer.js';
import { type Segment, WORD_SIZE } from '../core/segment.js';
import {
  type AuditContext,
  type AuditIssue,
  type AuditOptions,
  type AuditReport,
  DEFAULT_AUDIT_OPTIONS,
  type FarPointerChain,
  IssueType,
  type PointerLocation,
  type PointerStats,
  type ResolvedPointerInfo,
  type SegmentStats,
  Severity,
} from './audit-types.js';

/**
 * 位置键生成（用于 Set/Map）
 */
function locationKey(loc: PointerLocation): string {
  return `${loc.segmentIndex}:${loc.wordOffset}`;
}

/**
 * 创建位置对象
 */
function createLocation(segmentIndex: number, wordOffset: number, path?: string): PointerLocation {
  return { segmentIndex, wordOffset, path };
}

/**
 * 安全审计读取器
 * 包装 MessageReader，提供深度安全扫描功能
 */
export class AuditReader {
  private message: MessageReader;
  private segments: Segment[];
  private options: AuditOptions;

  // 审计状态
  private issues: AuditIssue[] = [];
  private pointerStats: PointerStats;
  private segmentStats: SegmentStats[] = [];
  private farPointerChains: FarPointerChain[] = [];
  private maxDetectedDepth = 0;
  private visitedPositions = new Set<string>();
  private farPointerGraph = new Map<string, string[]>();
  private cycleChains: FarPointerChain[] = [];

  constructor(buffer: ArrayBuffer | Uint8Array, options: Partial<AuditOptions> = {}) {
    this.message = new MessageReader(buffer);
    this.options = { ...DEFAULT_AUDIT_OPTIONS, ...options };

    // 提取 segments（通过反射访问私有属性）
    this.segments = (this.message as unknown as { segments: Segment[] }).segments || [];

    // 初始化统计
    this.pointerStats = {
      total: 0,
      struct: 0,
      list: 0,
      far: 0,
      doubleFar: 0,
      null: 0,
      other: 0,
    };
  }

  /**
   * 执行完整的安全审计
   */
  audit(): AuditReport {
    const startTime = Date.now();

    // 重置状态
    this.resetState();

    // 收集段统计
    if (this.options.collectSegmentStats) {
      this.collectSegmentStatistics();
    }

    // 如果消息为空，直接返回
    if (this.segments.length === 0) {
      return this.generateReport(startTime);
    }

    // 扫描所有段中的所有指针
    this.scanAllPointers();

    // 检测 Far Pointer 循环
    if (this.options.detectFarPointerCycles) {
      this.detectFarPointerCycles();
    }

    return this.generateReport(startTime);
  }

  /**
   * 快速检查 - 只检测关键安全问题
   */
  quickCheck(): Pick<AuditReport, 'passed' | 'issues' | 'issueCounts'> {
    const startTime = Date.now();
    this.resetState();

    // 只检查关键问题
    this.options.includeInfoIssues = false;
    this.options.maxNestingDepth = 50; // 降低阈值

    if (this.segments.length > 0) {
      this.scanAllPointers();
      if (this.options.detectFarPointerCycles) {
        this.detectFarPointerCycles();
      }
    }

    const report = this.generateReport(startTime);
    return {
      passed: report.passed,
      issues: report.issues,
      issueCounts: report.issueCounts,
    };
  }

  /**
   * 获取底层 MessageReader
   */
  getMessageReader(): MessageReader {
    return this.message;
  }

  /**
   * 重置审计状态
   */
  private resetState(): void {
    this.issues = [];
    this.pointerStats = {
      total: 0,
      struct: 0,
      list: 0,
      far: 0,
      doubleFar: 0,
      null: 0,
      other: 0,
    };
    this.segmentStats = [];
    this.farPointerChains = [];
    this.maxDetectedDepth = 0;
    this.visitedPositions.clear();
    this.farPointerGraph.clear();
    this.cycleChains = [];
  }

  /**
   * 收集段统计信息
   */
  private collectSegmentStatistics(): void {
    this.segmentStats = this.segments.map((segment, index) => ({
      index,
      wordCount: segment.wordCount,
      byteLength: segment.byteLength,
      referenceCount: 0,
    }));
  }

  /**
   * 扫描所有指针
   * 从根指针开始，递归扫描所有可达的指针
   */
  private scanAllPointers(): void {
    // 从根开始扫描
    const rootContext: AuditContext = {
      segmentIndex: 0,
      wordOffset: 0,
      depth: 0,
      chain: [],
      visited: new Set(),
      farPointerVisited: new Map(),
    };

    // 只扫描根指针，然后递归扫描从根可达的所有指针
    const firstSegment = this.segments[0];
    if (firstSegment && firstSegment.wordCount > 0) {
      this.scanPointerAt(0, 0, rootContext, true);
    }
  }

  /**
   * 扫描特定位置的指针
   * @param segmentIndex - 段索引
   * @param wordOffset - 字偏移
   * @param context - 审计上下文
   * @param isPointerLocation - 如果为 true，表示此位置应该是一个指针；如果为 false，表示这是数据位置（如 struct 的数据部分）
   */
  private scanPointerAt(
    segmentIndex: number,
    wordOffset: number,
    context: AuditContext,
    isPointerLocation = true
  ): void {
    const segment = this.segments[segmentIndex];
    if (!segment) return;

    if (wordOffset < 0 || wordOffset >= segment.wordCount) return;

    // 更新最大检测深度
    if (context.depth > this.maxDetectedDepth) {
      this.maxDetectedDepth = context.depth;
    }

    // 检查嵌套深度
    if (context.depth > this.options.maxNestingDepth) {
      this.addIssue({
        type: IssueType.NESTING_DEPTH_EXCEEDED,
        severity: Severity.ERROR,
        message: `Nesting depth ${context.depth} exceeds maximum ${this.options.maxNestingDepth}`,
        location: createLocation(segmentIndex, wordOffset),
        nestingDepth: context.depth,
        pointerChain: [...context.chain],
        context: { maxAllowed: this.options.maxNestingDepth },
      });
      return;
    }

    const location = createLocation(segmentIndex, wordOffset);
    const locationKeyStr = locationKey(location);

    // 如果已经访问过，跳过（防止循环）
    if (this.visitedPositions.has(locationKeyStr)) {
      return;
    }

    // 解析指针
    const ptrValue = segment.getWord(wordOffset);

    // 如果不是指针位置（如 struct 的数据部分），直接返回
    if (!isPointerLocation) {
      return;
    }

    // 记录已访问
    this.visitedPositions.add(locationKeyStr);

    // 空指针
    if (ptrValue === 0n) {
      if (this.options.countNullPointers) {
        this.pointerStats.null++;
        this.pointerStats.total++;
      }
      return;
    }

    // 解码指针
    const ptr = decodePointer(ptrValue);

    // 更新指针统计
    this.updatePointerStats(ptr);

    // 创建新的上下文
    const newContext: AuditContext = {
      ...context,
      depth: context.depth + 1,
      chain: [...context.chain, location],
    };

    // 根据指针类型处理
    switch (ptr.tag) {
      case PointerTag.STRUCT:
        this.scanStructPointer(segmentIndex, wordOffset, ptr as StructPointer, newContext);
        break;
      case PointerTag.LIST:
        this.scanListPointer(segmentIndex, wordOffset, ptr as ListPointer, newContext);
        break;
      case PointerTag.FAR:
        this.scanFarPointer(segmentIndex, wordOffset, ptr as FarPointer, context);
        break;
      case PointerTag.OTHER:
        this.scanOtherPointer(segmentIndex, wordOffset, ptr, newContext);
        break;
    }
  }

  /**
   * 扫描 Struct 指针
   */
  private scanStructPointer(
    segmentIndex: number,
    wordOffset: number,
    ptr: StructPointer,
    context: AuditContext
  ): void {
    const targetOffset = wordOffset + 1 + ptr.offset;
    const segment = this.segments[segmentIndex];

    if (!segment) return;

    // 检查结构大小是否有效
    if (ptr.dataWords < 0 || ptr.pointerCount < 0) {
      this.addIssue({
        type: IssueType.INVALID_STRUCT_SIZE,
        severity: Severity.ERROR,
        message: `Invalid struct size: dataWords=${ptr.dataWords}, pointerCount=${ptr.pointerCount}`,
        location: createLocation(segmentIndex, wordOffset),
        nestingDepth: context.depth,
        pointerChain: [...context.chain],
        context: { dataWords: ptr.dataWords, pointerCount: ptr.pointerCount },
      });
      return;
    }

    // 检查目标位置是否在段内
    const structEnd = targetOffset + ptr.dataWords + ptr.pointerCount;
    if (targetOffset < 0 || structEnd > segment.wordCount) {
      this.addIssue({
        type: IssueType.SEGMENT_OUT_OF_BOUNDS,
        severity: Severity.CRITICAL,
        message: `Struct target at offset ${targetOffset} (size ${structEnd - targetOffset}) exceeds segment bounds (${segment.wordCount})`,
        location: createLocation(segmentIndex, wordOffset),
        nestingDepth: context.depth,
        pointerChain: [...context.chain],
        context: {
          targetOffset,
          dataWords: ptr.dataWords,
          pointerCount: ptr.pointerCount,
          segmentWords: segment.wordCount,
        },
      });
      return;
    }

    // 扫描结构中的指针部分
    for (let i = 0; i < ptr.pointerCount; i++) {
      const ptrOffset = targetOffset + ptr.dataWords + i;
      if (ptrOffset < segment.wordCount) {
        this.scanPointerAt(segmentIndex, ptrOffset, context);
      }
    }
  }

  /**
   * 扫描 List 指针
   */
  private scanListPointer(
    segmentIndex: number,
    wordOffset: number,
    ptr: ListPointer,
    context: AuditContext
  ): void {
    const targetOffset = wordOffset + 1 + ptr.offset;
    const segment = this.segments[segmentIndex];

    if (!segment) return;

    // 检查列表大小
    if (ptr.elementCount < 0) {
      this.addIssue({
        type: IssueType.INVALID_LIST_SIZE,
        severity: Severity.ERROR,
        message: `Invalid list element count: ${ptr.elementCount}`,
        location: createLocation(segmentIndex, wordOffset),
        nestingDepth: context.depth,
        pointerChain: [...context.chain],
        context: { elementCount: ptr.elementCount },
      });
      return;
    }

    // 计算列表占用空间
    let listWords = 0;
    switch (ptr.elementSize) {
      case ElementSize.VOID:
        listWords = 0;
        break;
      case ElementSize.BIT:
        listWords = Math.ceil(ptr.elementCount / 64);
        break;
      case ElementSize.BYTE:
        listWords = Math.ceil(ptr.elementCount / 8);
        break;
      case ElementSize.TWO_BYTES:
        listWords = Math.ceil(ptr.elementCount / 4);
        break;
      case ElementSize.FOUR_BYTES:
        listWords = Math.ceil(ptr.elementCount / 2);
        break;
      case ElementSize.EIGHT_BYTES:
      case ElementSize.POINTER:
        listWords = ptr.elementCount;
        break;
      case ElementSize.INLINE_COMPOSITE:
        // 需要在目标位置读取 tag word
        if (targetOffset >= 0 && targetOffset < segment.wordCount) {
          const tagWord = segment.getWord(targetOffset);
          const elementCount = Number(tagWord & BigInt(0xffffffff));
          const dataWords = Number((tagWord >> BigInt(32)) & BigInt(0xffff));
          const pointerCount = Number((tagWord >> BigInt(48)) & BigInt(0xffff));
          listWords = 1 + elementCount * (dataWords + pointerCount);

          // 扫描 inline composite 中的指针
          for (let i = 0; i < elementCount; i++) {
            const elemOffset = targetOffset + 1 + i * (dataWords + pointerCount);
            for (let p = 0; p < pointerCount; p++) {
              const ptrOffset = elemOffset + dataWords + p;
              if (ptrOffset < segment.wordCount) {
                this.scanPointerAt(segmentIndex, ptrOffset, context);
              }
            }
          }
        }
        break;
    }

    // 检查边界
    const listEnd = targetOffset + listWords;
    if (targetOffset < 0 || listEnd > segment.wordCount) {
      this.addIssue({
        type: IssueType.SEGMENT_OUT_OF_BOUNDS,
        severity: Severity.CRITICAL,
        message: `List target at offset ${targetOffset} (size ${listWords}) exceeds segment bounds (${segment.wordCount})`,
        location: createLocation(segmentIndex, wordOffset),
        nestingDepth: context.depth,
        pointerChain: [...context.chain],
        context: { targetOffset, listWords, segmentWords: segment.wordCount },
      });
      return;
    }

    // 扫描指针列表中的元素
    if (ptr.elementSize === ElementSize.POINTER) {
      for (let i = 0; i < ptr.elementCount; i++) {
        const elemOffset = targetOffset + i;
        if (elemOffset < segment.wordCount) {
          this.scanPointerAt(segmentIndex, elemOffset, context);
        }
      }
    }
  }

  /**
   * 扫描 Far Pointer
   */
  private scanFarPointer(
    segmentIndex: number,
    wordOffset: number,
    ptr: FarPointer,
    context: AuditContext
  ): void {
    const location = createLocation(segmentIndex, wordOffset);
    const locationKeyStr = locationKey(location);

    // 检查目标段是否存在
    if (ptr.targetSegment < 0 || ptr.targetSegment >= this.segments.length) {
      this.addIssue({
        type: IssueType.INVALID_SEGMENT_INDEX,
        severity: Severity.CRITICAL,
        message: `Far pointer references non-existent segment ${ptr.targetSegment}`,
        location,
        nestingDepth: context.depth,
        pointerChain: [...context.chain],
        context: { targetSegment: ptr.targetSegment, maxSegment: this.segments.length - 1 },
      });
      return;
    }

    const targetSegment = this.segments[ptr.targetSegment];

    // 检查目标偏移
    if (ptr.targetOffset < 0 || ptr.targetOffset >= targetSegment.wordCount) {
      this.addIssue({
        type: IssueType.SEGMENT_OUT_OF_BOUNDS,
        severity: Severity.CRITICAL,
        message: `Far pointer target offset ${ptr.targetOffset} exceeds segment ${ptr.targetSegment} bounds (${targetSegment.wordCount})`,
        location,
        nestingDepth: context.depth,
        pointerChain: [...context.chain],
        context: {
          targetSegment: ptr.targetSegment,
          targetOffset: ptr.targetOffset,
          segmentWords: targetSegment.wordCount,
        },
      });
      return;
    }

    // 记录 Far Pointer 图
    const targetKey = `${ptr.targetSegment}:${ptr.targetOffset}`;
    if (!this.farPointerGraph.has(locationKeyStr)) {
      this.farPointerGraph.set(locationKeyStr, []);
    }
    this.farPointerGraph.get(locationKeyStr)!.push(targetKey);

    // 更新段引用计数
    if (this.segmentStats[ptr.targetSegment]) {
      this.segmentStats[ptr.targetSegment].referenceCount++;
    }

    // 双重 Far Pointer
    if (ptr.doubleFar) {
      this.pointerStats.doubleFar++;

      // 解析 landing pad
      const landingPadPtr = decodePointer(targetSegment.getWord(ptr.targetOffset));

      if (landingPadPtr.tag !== PointerTag.FAR) {
        this.addIssue({
          type: IssueType.INVALID_DOUBLE_FAR,
          severity: Severity.ERROR,
          message: 'Double-far landing pad is not a far pointer',
          location,
          nestingDepth: context.depth,
          pointerChain: [...context.chain],
          context: { landingPadTag: landingPadPtr.tag },
        });
        return;
      }

      const innerFarPtr = landingPadPtr as FarPointer;

      // 检查内层 Far Pointer
      if (innerFarPtr.targetSegment < 0 || innerFarPtr.targetSegment >= this.segments.length) {
        this.addIssue({
          type: IssueType.INVALID_DOUBLE_FAR,
          severity: Severity.CRITICAL,
          message: `Double-far inner pointer references non-existent segment ${innerFarPtr.targetSegment}`,
          location,
          nestingDepth: context.depth,
          pointerChain: [...context.chain],
          context: { targetSegment: innerFarPtr.targetSegment },
        });
        return;
      }

      // 递归扫描目标
      this.scanPointerAt(innerFarPtr.targetSegment, innerFarPtr.targetOffset, context);
    } else {
      // Single-far: landing pad 是实际的 struct/list 指针
      this.scanPointerAt(ptr.targetSegment, ptr.targetOffset, context);
    }
  }

  /**
   * 扫描其他类型指针
   */
  private scanOtherPointer(
    segmentIndex: number,
    wordOffset: number,
    ptr: Pointer,
    context: AuditContext
  ): void {
    // 只在启用 INFO 级别时报告
    if (this.options.includeInfoIssues) {
      this.addIssue({
        type: IssueType.UNKNOWN_POINTER_TYPE,
        severity: Severity.INFO,
        message: 'Unknown or reserved pointer type encountered',
        location: createLocation(segmentIndex, wordOffset),
        nestingDepth: context.depth,
        pointerChain: [...context.chain],
        context: { pointerTag: ptr.tag },
      });
    }
  }

  /**
   * 更新指针统计
   */
  private updatePointerStats(ptr: Pointer): void {
    this.pointerStats.total++;

    switch (ptr.tag) {
      case PointerTag.STRUCT:
        this.pointerStats.struct++;
        break;
      case PointerTag.LIST:
        this.pointerStats.list++;
        break;
      case PointerTag.FAR:
        this.pointerStats.far++;
        break;
      case PointerTag.OTHER:
        this.pointerStats.other++;
        break;
    }
  }

  /**
   * 检测 Far Pointer 循环
   */
  private detectFarPointerCycles(): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (node: string, path: PointerLocation[]): boolean => {
      visited.add(node);
      recursionStack.add(node);

      const [segIdx, wordOff] = node.split(':').map(Number);
      path.push(createLocation(segIdx, wordOff));

      const neighbors = this.farPointerGraph.get(node) || [];

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor, path)) {
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          // 发现循环
          const [nSegIdx, nWordOff] = neighbor.split(':').map(Number);
          const cycleStart = createLocation(nSegIdx, nWordOff);

          const chain: FarPointerChain = {
            id: `cycle-${this.cycleChains.length}`,
            locations: [...path, cycleStart],
            hasCycle: true,
            cycleStart,
          };

          this.cycleChains.push(chain);

          // 添加问题
          this.addIssue({
            type: IssueType.FAR_POINTER_CYCLE,
            severity: Severity.CRITICAL,
            message: `Far pointer cycle detected at ${neighbor}`,
            location: cycleStart,
            nestingDepth: path.length,
            pointerChain: path,
            context: { cycleStart: neighbor },
          });

          return true;
        }
      }

      path.pop();
      recursionStack.delete(node);
      return false;
    };

    // 遍历所有节点
    for (const node of this.farPointerGraph.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }

    this.farPointerChains = [...this.cycleChains];
  }

  /**
   * 添加问题
   */
  private addIssue(issue: AuditIssue): void {
    this.issues.push(issue);
  }

  /**
   * 生成审计报告
   */
  private generateReport(startTime: number): AuditReport {
    const duration = Date.now() - startTime;

    // 统计问题数量
    const issueCounts = {
      info: this.issues.filter((i) => i.severity === Severity.INFO).length,
      warning: this.issues.filter((i) => i.severity === Severity.WARNING).length,
      error: this.issues.filter((i) => i.severity === Severity.ERROR).length,
      critical: this.issues.filter((i) => i.severity === Severity.CRITICAL).length,
    };

    // 计算总字数
    const totalWords = this.segments.reduce((sum, seg) => sum + seg.wordCount, 0);

    return {
      passed: issueCounts.error === 0 && issueCounts.critical === 0,
      issues: this.issues,
      issueCounts,
      statistics: {
        segmentCount: this.segments.length,
        totalWords,
        pointers: this.pointerStats,
        segments: this.segmentStats,
        maxNestingDepth: this.options.maxNestingDepth,
        detectedMaxDepth: this.maxDetectedDepth,
        farPointerChainCount: this.farPointerChains.length,
        cycleCount: this.cycleChains.length,
      },
      farPointerChains: this.farPointerChains,
      auditTime: new Date(startTime),
      durationMs: duration,
    };
  }
}

export type { AuditOptions, AuditReport, AuditIssue };
export { Severity, IssueType };
