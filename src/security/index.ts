/**
 * Cap'n Proto Security Audit Module
 * 安全审计模块公共 API
 *
 * 提供深度安全扫描功能，包括：
 * - 最大嵌套深度检查
 * - Far Pointer 循环引用检测
 * - 指针链追踪
 * - 详细的安全审计报告
 *
 * @example
 * ```typescript
 * import { AuditReader } from './security/index.js';
 *
 * const buffer = ...; // Cap'n Proto 消息
 * const auditReader = new AuditReader(buffer);
 * const report = auditReader.audit();
 *
 * if (!report.passed) {
 *   console.log('Security issues found:', report.issues);
 * }
 * ```
 */

// 核心审计类
export { AuditReader } from './audit-reader.js';

// 类型定义
export type {
  // 主要类型
  AuditReport,
  AuditIssue,
  AuditOptions,
  // 位置和链类型
  PointerLocation,
  PointerStats,
  SegmentStats,
  FarPointerChain,
  AuditContext,
  ResolvedPointerInfo,
} from './audit-types.js';

// 枚举值
export { Severity, IssueType, DEFAULT_AUDIT_OPTIONS } from './audit-types.js';

// 便捷函数

/**
 * 快速审计便利函数
 * 对给定的 Cap'n Proto 消息执行快速安全检查
 *
 * @param buffer - Cap'n Proto 消息缓冲区
 * @returns 简化版的审计报告（仅包含通过状态、问题和计数）
 *
 * @example
 * ```typescript
 * import { quickAudit } from './security/index.js';
 *
 * const result = quickAudit(buffer);
 * if (!result.passed) {
 *   console.error('Security check failed');
 * }
 * ```
 */
export function quickAudit(buffer: ArrayBuffer | Uint8Array): {
  passed: boolean;
  issues: import('./audit-types.js').AuditIssue[];
  issueCounts: {
    info: number;
    warning: number;
    error: number;
    critical: number;
  };
} {
  const { AuditReader } = require('./audit-reader.js');
  const reader = new AuditReader(buffer);
  return reader.quickCheck();
}

/**
 * 完整审计便利函数
 * 对给定的 Cap'n Proto 消息执行完整的安全审计
 *
 * @param buffer - Cap'n Proto 消息缓冲区
 * @param options - 审计配置选项
 * @returns 完整的审计报告
 *
 * @example
 * ```typescript
 * import { auditMessage, Severity } from './security/index.js';
 *
 * const report = auditMessage(buffer, {
 *   maxNestingDepth: 50,
 *   detectFarPointerCycles: true,
 * });
 *
 * // 过滤关键问题
 * const criticalIssues = report.issues.filter(
 *   i => i.severity === Severity.CRITICAL
 * );
 * ```
 */
export function auditMessage(
  buffer: ArrayBuffer | Uint8Array,
  options?: Partial<import('./audit-types.js').AuditOptions>
): import('./audit-types.js').AuditReport {
  const { AuditReader } = require('./audit-reader.js');
  const reader = new AuditReader(buffer, options);
  return reader.audit();
}
