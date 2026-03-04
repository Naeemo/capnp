/**
 * Schema Compatibility Checker
 *
 * Detect breaking changes between Cap'n Proto schema versions.
 */

import type { SchemaField, SchemaNode } from '../rpc/schema-types.js';
import { SchemaNodeType } from '../rpc/schema-types.js';

export interface CompatibilityOptions {
  /** Treat field renames as breaking (default: false) */
  strictRenames?: boolean;
  /** Allow removing deprecated fields (default: false) */
  allowRemoveDeprecated?: boolean;
  /** Check union changes (default: true) */
  checkUnions?: boolean;
}

export interface CompatibilityIssue {
  /** Type of compatibility issue */
  type: 'breaking' | 'warning' | 'info';
  /** Category of the issue */
  category:
    | 'field_removed'
    | 'field_type_changed'
    | 'field_default_changed'
    | 'struct_removed'
    | 'enum_value_removed'
    | 'union_changed'
    | 'capability_added'
    | 'field_added_optional'
    | 'field_added_required';
  /** Human-readable description */
  message: string;
  /** Path to the affected element */
  path: string;
  /** Suggested fix */
  suggestion?: string;
}

export interface CompatibilityReport {
  /** Whether schemas are compatible */
  compatible: boolean;
  /** List of all issues */
  issues: CompatibilityIssue[];
  /** Summary counts */
  summary: {
    breaking: number;
    warning: number;
    info: number;
  };
  /** Old schema version info */
  oldVersion?: {
    id: bigint;
    displayName: string;
  };
  /** New schema version info */
  newVersion?: {
    id: bigint;
    displayName: string;
  };
}

/**
 * Check compatibility between two schemas
 */
export function checkCompatibility(
  oldSchema: SchemaNode | SchemaNode[],
  newSchema: SchemaNode | SchemaNode[],
  options?: CompatibilityOptions
): CompatibilityReport {
  const opts = {
    strictRenames: false,
    allowRemoveDeprecated: false,
    checkUnions: true,
    ...options,
  };

  const issues: CompatibilityIssue[] = [];

  // Normalize to arrays
  const oldNodes = Array.isArray(oldSchema) ? oldSchema : [oldSchema];
  const newNodes = Array.isArray(newSchema) ? newSchema : [newSchema];

  // Build maps for quick lookup
  const oldMap = new Map(oldNodes.map((n) => [n.id, n]));
  const newMap = new Map(newNodes.map((n) => [n.id, n]));

  // Check each old node
  for (const oldNode of oldNodes) {
    const newNode = newMap.get(oldNode.id);

    if (!newNode) {
      // Node was removed
      if (oldNode.type === SchemaNodeType.STRUCT) {
        issues.push({
          type: 'breaking',
          category: 'struct_removed',
          message: `Struct '${oldNode.displayName}' was removed`,
          path: oldNode.displayName,
          suggestion: 'Consider deprecating before removing',
        });
      }
      continue;
    }

    // Compare same-id nodes
    compareNodes(oldNode, newNode, issues, opts);
  }

  // Check for new required fields (also breaking)
  for (const newNode of newNodes) {
    const oldNode = oldMap.get(newNode.id);
    if (oldNode) {
      checkNewRequiredFields(oldNode, newNode, issues);
    }
  }

  const breaking = issues.filter((i) => i.type === 'breaking').length;
  const warning = issues.filter((i) => i.type === 'warning').length;
  const info = issues.filter((i) => i.type === 'info').length;

  return {
    compatible: breaking === 0,
    issues,
    summary: { breaking, warning, info },
    oldVersion: oldNodes[0]
      ? { id: oldNodes[0].id, displayName: oldNodes[0].displayName }
      : undefined,
    newVersion: newNodes[0]
      ? { id: newNodes[0].id, displayName: newNodes[0].displayName }
      : undefined,
  };
}

function compareNodes(
  oldNode: SchemaNode,
  newNode: SchemaNode,
  issues: CompatibilityIssue[],
  options: Required<CompatibilityOptions>
): void {
  // Check type hasn't changed
  if (oldNode.type !== newNode.type) {
    issues.push({
      type: 'breaking',
      category: 'field_type_changed',
      message: `Node '${oldNode.displayName}' type changed from ${SchemaNodeType[oldNode.type]} to ${SchemaNodeType[newNode.type]}`,
      path: oldNode.displayName,
    });
    return;
  }

  // Compare structs
  if (oldNode.type === SchemaNodeType.STRUCT && newNode.type === SchemaNodeType.STRUCT) {
    compareStructs(oldNode, newNode, issues, options);
  }

  // Compare enums
  if (oldNode.type === SchemaNodeType.ENUM && newNode.type === SchemaNodeType.ENUM) {
    compareEnums(oldNode, newNode, issues);
  }
}

function compareStructs(
  oldNode: SchemaNode,
  newNode: SchemaNode,
  issues: CompatibilityIssue[],
  options: Required<CompatibilityOptions>
): void {
  if (!oldNode.structInfo || !newNode.structInfo) return;

  const oldFields = new Map(oldNode.structInfo.fields.map((f) => [f.name, f]));
  const newFields = new Map(newNode.structInfo.fields.map((f) => [f.name, f]));

  // Check for removed fields
  for (const [name, oldField] of oldFields) {
    if (!newFields.has(name)) {
      issues.push({
        type: 'breaking',
        category: 'field_removed',
        message: `Field '${oldNode.displayName}.${name}' was removed`,
        path: `${oldNode.displayName}.${name}`,
        suggestion: 'Consider deprecating before removing',
      });
      continue;
    }

    // Compare field types
    const newField = newFields.get(name)!;
    compareFields(oldField, newField, oldNode.displayName, issues);
  }

  // Check union changes
  if (options.checkUnions) {
    const oldUnionCount = oldNode.structInfo.discriminantCount;
    const newUnionCount = newNode.structInfo.discriminantCount;

    if (oldUnionCount !== newUnionCount) {
      issues.push({
        type: 'breaking',
        category: 'union_changed',
        message: `Union in '${oldNode.displayName}' changed`,
        path: oldNode.displayName,
        suggestion: 'Avoid changing union structure',
      });
    }
  }
}

function compareFields(
  oldField: SchemaField,
  newField: SchemaField,
  structName: string,
  issues: CompatibilityIssue[]
): void {
  // Check type changes
  const oldType = oldField.type.kind.type;
  const newType = newField.type.kind.type;

  if (oldType !== newType) {
    issues.push({
      type: 'breaking',
      category: 'field_type_changed',
      message: `Field '${structName}.${oldField.name}' type changed from ${oldType} to ${newType}`,
      path: `${structName}.${oldField.name}`,
      suggestion: 'Create new field with different name instead of changing type',
    });
    return;
  }

  // Check for required -> optional (safe) vs optional -> required (breaking)
  // This is handled in checkNewRequiredFields
}

function compareEnums(
  oldNode: SchemaNode,
  newNode: SchemaNode,
  issues: CompatibilityIssue[]
): void {
  if (!oldNode.enumInfo || !newNode.enumInfo) return;

  const newValues = new Set(newNode.enumInfo.enumerants.map((e) => e.name));

  for (const oldValue of oldNode.enumInfo.enumerants) {
    if (!newValues.has(oldValue.name)) {
      issues.push({
        type: 'breaking',
        category: 'enum_value_removed',
        message: `Enum value '${oldNode.displayName}.${oldValue.name}' was removed`,
        path: `${oldNode.displayName}.${oldValue.name}`,
        suggestion: 'Reserve enum values instead of removing them',
      });
    }
  }
}

function checkNewRequiredFields(
  oldNode: SchemaNode,
  newNode: SchemaNode,
  issues: CompatibilityIssue[]
): void {
  if (!oldNode.structInfo || !newNode.structInfo) return;

  const oldFields = new Set(oldNode.structInfo.fields.map((f) => f.name));

  for (const newField of newNode.structInfo.fields) {
    if (!oldFields.has(newField.name)) {
      // This is a new field
      // In Cap'n Proto, all fields are effectively optional (have defaults)
      // So adding fields is safe
      issues.push({
        type: 'info',
        category: 'field_added_optional',
        message: `New field '${newNode.displayName}.${newField.name}' added`,
        path: `${newNode.displayName}.${newField.name}`,
      });
    }
  }
}

/**
 * Format compatibility report as human-readable text
 */
export function formatReport(report: CompatibilityReport): string {
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push('SCHEMA COMPATIBILITY REPORT');
  lines.push('='.repeat(60));
  lines.push('');

  if (report.compatible) {
    lines.push('✅ Schemas are compatible');
  } else {
    lines.push('❌ Schemas are NOT compatible');
  }
  lines.push('');

  lines.push('Summary:');
  lines.push(`  Breaking: ${report.summary.breaking}`);
  lines.push(`  Warnings: ${report.summary.warning}`);
  lines.push(`  Info: ${report.summary.info}`);
  lines.push('');

  if (report.issues.length > 0) {
    lines.push('Issues:');
    lines.push('-'.repeat(60));

    for (const issue of report.issues) {
      const icon = issue.type === 'breaking' ? '❌' : issue.type === 'warning' ? '⚠️' : 'ℹ️';
      lines.push(`${icon} [${issue.type.toUpperCase()}] ${issue.category}`);
      lines.push(`   Path: ${issue.path}`);
      lines.push(`   ${issue.message}`);
      if (issue.suggestion) {
        lines.push(`   💡 ${issue.suggestion}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
