/**
 * Cap'n Proto Security Audit Types
 * 安全审计类型定义
 */

import type { PointerTag, ElementSize } from '../core/pointer.js';

/**
 * 问题严重程度
 */
export enum Severity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * 问题类型
 */
export enum IssueType {
  // 嵌套深度问题
  NESTING_DEPTH_EXCEEDED = 'nesting_depth_exceeded',
  
  // Far Pointer 循环引用
  FAR_POINTER_CYCLE = 'far_pointer_cycle',
  
  // 无效指针
  INVALID_POINTER = 'invalid_pointer',
  NULL_POINTER = 'null_pointer',
  
  // 段相关问题
  INVALID_SEGMENT_INDEX = 'invalid_segment_index',
  SEGMENT_OUT_OF_BOUNDS = 'segment_out_of_bounds',
  
  // 结构相关问题
  INVALID_STRUCT_SIZE = 'invalid_struct_size',
  INVALID_LIST_SIZE = 'invalid_list_size',
  
  // 双重 Far Pointer 问题
  INVALID_DOUBLE_FAR = 'invalid_double_far',
  
  // 其他
  UNKNOWN_POINTER_TYPE = 'unknown_pointer_type',
  MALFORMED_MESSAGE = 'malformed_message',
}

/**
 * 指针位置信息
 */
export interface PointerLocation {
  /** 段索引 */
  segmentIndex: number;
  /** 字偏移 */
  wordOffset: number;
  /** 人类可读的路径描述 */
  path?: string;
}

/**
 * 审计发现的问题
 */
export interface AuditIssue {
  /** 问题类型 */
  type: IssueType;
  /** 严重程度 */
  severity: Severity;
  /** 问题描述 */
  message: string;
  /** 问题位置 */
  location: PointerLocation;
  /** 当前嵌套深度 */
  nestingDepth: number;
  /** 指针链（从根到当前位置） */
  pointerChain: PointerLocation[];
  /** 额外上下文信息 */
  context?: Record<string, unknown>;
}

/**
 * 指针统计信息
 */
export interface PointerStats {
  /** 总指针数量 */
  total: number;
  /** Struct 指针数量 */
  struct: number;
  /** List 指针数量 */
  list: number;
  /** Far 指针数量 */
  far: number;
  /** 双重 Far 指针数量 */
  doubleFar: number;
  /** 空指针数量 */
  null: number;
  /** 其他/未知类型 */
  other: number;
}

/**
 * 段统计信息
 */
export interface SegmentStats {
  /** 段索引 */
  index: number;
  /** 字数 */
  wordCount: number;
  /** 字节数 */
  byteLength: number;
  /** 被引用的次数 */
  referenceCount: number;
}

/**
 * Far Pointer 链信息
 */
export interface FarPointerChain {
  /** 链的唯一标识 */
  id: string;
  /** 链中的指针位置 */
  locations: PointerLocation[];
  /** 是否形成循环 */
  hasCycle: boolean;
  /** 循环起始点（如果有） */
  cycleStart?: PointerLocation;
}

/**
 * 审计报告
 */
export interface AuditReport {
  /** 是否通过审计（无 ERROR 或 CRITICAL 级别问题） */
  passed: boolean;
  
  /** 发现的问题列表 */
  issues: AuditIssue[];
  
  /** 按严重程度分组的问题数量 */
  issueCounts: {
    info: number;
    warning: number;
    error: number;
    critical: number;
  };
  
  /** 统计信息 */
  statistics: {
    /** 段数量 */
    segmentCount: number;
    /** 总字数 */
    totalWords: number;
    /** 指针统计 */
    pointers: PointerStats;
    /** 段详细信息 */
    segments: SegmentStats[];
    /** 最大嵌套深度 */
    maxNestingDepth: number;
    /** 实际检测到的最深嵌套 */
    detectedMaxDepth: number;
    /** Far Pointer 链数量 */
    farPointerChainCount: number;
    /** 检测到的循环数量 */
    cycleCount: number;
  };
  
  /** Far Pointer 链详细信息 */
  farPointerChains: FarPointerChain[];
  
  /** 审计时间 */
  auditTime: Date;
  /** 审计耗时（毫秒） */
  durationMs: number;
}

/**
 * 审计配置选项
 */
export interface AuditOptions {
  /** 最大嵌套深度限制（默认：100） */
  maxNestingDepth: number;
  /** 是否检测 Far Pointer 循环 */
  detectFarPointerCycles: boolean;
  /** 是否追踪指针链 */
  trackPointerChains: boolean;
  /** 是否统计空指针 */
  countNullPointers: boolean;
  /** 是否收集段统计信息 */
  collectSegmentStats: boolean;
  /** 是否包含 INFO 级别问题 */
  includeInfoIssues: boolean;
}

/**
 * 默认审计配置
 */
export const DEFAULT_AUDIT_OPTIONS: AuditOptions = {
  maxNestingDepth: 100,
  detectFarPointerCycles: true,
  trackPointerChains: true,
  countNullPointers: true,
  collectSegmentStats: true,
  includeInfoIssues: false,
};

/**
 * 审计上下文（内部使用）
 */
export interface AuditContext {
  /** 当前段索引 */
  segmentIndex: number;
  /** 当前字偏移 */
  wordOffset: number;
  /** 当前嵌套深度 */
  depth: number;
  /** 指针链 */
  chain: PointerLocation[];
  /** 已访问的位置（用于循环检测） */
  visited: Set<string>;
  /** Far Pointer 访问记录（用于循环检测） */
  farPointerVisited: Map<string, PointerLocation>;
}

/**
 * 解析的指针信息
 */
export interface ResolvedPointerInfo {
  tag: PointerTag;
  segmentIndex: number;
  wordOffset: number;
  originalSegmentIndex: number;
  originalWordOffset: number;
  /** 是否通过 Far Pointer 解析 */
  isFarPointer: boolean;
  /** Far Pointer 链 */
  farChain?: PointerLocation[];
}
