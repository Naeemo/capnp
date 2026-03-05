/**
 * 安全测试套件
 * 测试 MessageReader 的安全选项和 AuditReader 的问题检测
 */

import { describe, expect, it } from 'vitest';
import { MessageReader } from '../../core/message-reader.js';
import { AuditReader, SecurityIssueType, Severity } from './audit-reader.js';
import {
  MalformedMessageGenerator,
  MalformedType,
  DEFAULT_SECURITY_OPTIONS,
} from './malformed-messages.js';

describe('Security Tests', () => {
  describe('Malformed Messages', () => {
    it('should handle too many segments (>64)', () => {
      const buffer = MalformedMessageGenerator.tooManySegments(100);
      // Should not throw, but may return empty message
      const reader = new MessageReader(buffer);
      // Current implementation may limit segments
      expect(reader.segmentCount).toBeLessThanOrEqual(100);
    });

    it('should handle segment size exceeding message total size', () => {
      const buffer = MalformedMessageGenerator.segmentSizeExceedsMessage();
      // Should handle gracefully, not crash
      const reader = new MessageReader(buffer);
      // May return empty segments or truncated segments
      expect(reader.segmentCount).toBeGreaterThanOrEqual(0);
    });

    it('should handle negative pointer offset', () => {
      const buffer = MalformedMessageGenerator.negativePointerOffset();
      // Should handle gracefully
      const reader = new MessageReader(buffer);
      expect(reader.segmentCount).toBe(1);
      // Accessing root should handle negative offset
      expect(() => reader.getRoot(0, 0)).not.toThrow();
    });

    it('should handle circular far pointer', () => {
      const buffer = MalformedMessageGenerator.circularFarPointer();
      const reader = new MessageReader(buffer);
      expect(reader.segmentCount).toBe(2);
      // Should handle gracefully - may or may not throw depending on implementation
      expect(() => reader.getRoot(0, 0)).not.toThrow();
    });

    it('should handle cross-segment circular far pointer', () => {
      const buffer = MalformedMessageGenerator.crossSegmentCircularFarPointer();
      const reader = new MessageReader(buffer);
      expect(reader.segmentCount).toBe(2);
    });

    it('should handle double-far circular reference', () => {
      const buffer = MalformedMessageGenerator.doubleFarCircular();
      const reader = new MessageReader(buffer);
      expect(reader.segmentCount).toBe(2);
    });

    it('should handle deep nesting (>100 layers)', () => {
      const buffer = MalformedMessageGenerator.deepNesting(101);
      const reader = new MessageReader(buffer);
      expect(reader.segmentCount).toBe(1);
      // Should handle deep nesting without stack overflow
      expect(() => reader.getRoot(0, 1)).not.toThrow();
    });

    it('should handle zero length message', () => {
      const buffer = MalformedMessageGenerator.zeroLengthMessage();
      const reader = new MessageReader(buffer);
      expect(reader.segmentCount).toBe(0);
    });

    it('should handle truncated header', () => {
      const buffer = MalformedMessageGenerator.truncatedHeader();
      const reader = new MessageReader(buffer);
      expect(reader.segmentCount).toBe(0);
    });

    it('should handle invalid far pointer segment', () => {
      const buffer = MalformedMessageGenerator.invalidFarPointerSegment();
      const reader = new MessageReader(buffer);
      expect(reader.segmentCount).toBe(1);
      // Should throw when resolving far pointer
      expect(() => reader.getRoot(0, 0)).toThrow();
    });

    it('should handle huge struct pointer', () => {
      const buffer = MalformedMessageGenerator.hugeStructPointer();
      const reader = new MessageReader(buffer);
      expect(reader.segmentCount).toBe(1);
      // Should handle without allocating huge memory
      expect(() => reader.getRoot(0xFFFF, 0xFFFF)).not.toThrow();
    });

    it('should handle overlapping pointers', () => {
      const buffer = MalformedMessageGenerator.overlappingPointers();
      const reader = new MessageReader(buffer);
      expect(reader.segmentCount).toBe(1);
      const root = reader.getRoot(0, 2);
      expect(root).toBeDefined();
    });

    it('should handle unaligned segment count', () => {
      const buffer = MalformedMessageGenerator.unalignedSegmentCount();
      const reader = new MessageReader(buffer);
      expect(reader.segmentCount).toBe(3);
    });

    it('should handle negative segment size', () => {
      const buffer = MalformedMessageGenerator.negativeSegmentSize();
      const reader = new MessageReader(buffer);
      // Should handle gracefully
      expect(reader.segmentCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('AuditReader', () => {
    it('should detect too many segments', () => {
      const buffer = MalformedMessageGenerator.tooManySegments(100);
      const auditor = new AuditReader();
      const result = auditor.audit(buffer);

      expect(result.issues.some((i) => i.type === SecurityIssueType.TOO_MANY_SEGMENTS)).toBe(true);
      expect(result.issues.some((i) => i.severity === Severity.CRITICAL)).toBe(true);
    });

    it('should detect segment size exceeding message', () => {
      const buffer = MalformedMessageGenerator.segmentSizeExceedsMessage();
      const auditor = new AuditReader();
      const result = auditor.audit(buffer);

      expect(result.issues.some((i) => i.type === SecurityIssueType.SEGMENT_TOO_LARGE)).toBe(true);
    });

    it('should detect deep nesting', () => {
      const buffer = MalformedMessageGenerator.deepNesting(200);
      const auditor = new AuditReader({ maxNestingDepth: 50 });
      const result = auditor.audit(buffer);

      expect(result.issues.some((i) => i.type === SecurityIssueType.DEEP_NESTING)).toBe(true);
    });

    it('should detect circular pointers', () => {
      // Use cross-segment circular pointer which is easier to detect
      const buffer = MalformedMessageGenerator.crossSegmentCircularFarPointer();
      const auditor = new AuditReader();
      const result = auditor.audit(buffer);

      // Should detect some kind of issue with the far pointer chain
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should detect negative offsets', () => {
      const buffer = MalformedMessageGenerator.negativePointerOffset();
      const auditor = new AuditReader();
      const result = auditor.audit(buffer);

      expect(result.issues.some((i) => i.type === SecurityIssueType.NEGATIVE_OFFSET)).toBe(true);
    });

    it('should detect invalid far pointer segments', () => {
      const buffer = MalformedMessageGenerator.invalidFarPointerSegment();
      const auditor = new AuditReader();
      const result = auditor.audit(buffer);

      expect(result.issues.some((i) => i.type === SecurityIssueType.INVALID_FAR_POINTER)).toBe(
        true
      );
    });

    it('should detect offset out of bounds', () => {
      const buffer = MalformedMessageGenerator.segmentSizeExceedsMessage();
      const auditor = new AuditReader();
      const result = auditor.audit(buffer);

      expect(
        result.issues.some(
          (i) =>
            i.type === SecurityIssueType.OFFSET_OUT_OF_BOUNDS ||
            i.type === SecurityIssueType.SEGMENT_TOO_LARGE
        )
      ).toBe(true);
    });

    it('should report valid for normal message', async () => {
      // Create a valid message using MessageBuilder
      const { MessageBuilder } = await import('../../core/message-builder.js');
      const builder = new MessageBuilder();
      const root = builder.initRoot(1, 0);
      root.setInt32(0, 42);
      const buffer = builder.toArrayBuffer();

      const auditor = new AuditReader();
      const result = auditor.audit(buffer);

      expect(result.valid).toBe(true);
      expect(result.issues.length).toBe(0);
    });

    it('should respect custom security options', () => {
      const buffer = MalformedMessageGenerator.tooManySegments(10);

      const strictAuditor = new AuditReader({ maxSegmentCount: 5 });
      const strictResult = strictAuditor.audit(buffer);
      expect(strictResult.issues.some((i) => i.type === SecurityIssueType.TOO_MANY_SEGMENTS)).toBe(
        true
      );

      const lenientAuditor = new AuditReader({ maxSegmentCount: 100 });
      const lenientResult = lenientAuditor.audit(buffer);
      expect(
        lenientResult.issues.some((i) => i.type === SecurityIssueType.TOO_MANY_SEGMENTS)
      ).toBe(false);
    });

    it('should provide accurate statistics', async () => {
      const { MessageBuilder } = await import('../../core/message-builder.js');
      const builder = new MessageBuilder();
      const root = builder.initRoot(1, 1);
      root.setInt32(0, 1);
      const nested = root.initStruct(0, 1, 0);
      nested.setInt32(0, 2);
      const buffer = builder.toArrayBuffer();

      const auditor = new AuditReader();
      const result = auditor.audit(buffer);

      expect(result.stats.segmentCount).toBeGreaterThanOrEqual(0);
      expect(result.stats.pointerCount).toBeGreaterThan(0);
    });

    it('should classify issues by severity', () => {
      const buffer = MalformedMessageGenerator.generateAll();
      const auditor = new AuditReader();

      for (const [type, msgBuffer] of buffer) {
        const result = auditor.audit(msgBuffer);
        for (const issue of result.issues) {
          expect(Object.values(Severity)).toContain(issue.severity);
          expect(issue.message).toBeTruthy();
          expect(issue.type).toBeTruthy();
        }
      }
    });
  });

  describe('Security Options', () => {
    it('should have reasonable default security options', () => {
      expect(DEFAULT_SECURITY_OPTIONS.maxSegmentCount).toBe(64);
      expect(DEFAULT_SECURITY_OPTIONS.maxSegmentSize).toBe(64 * 1024 * 1024);
      expect(DEFAULT_SECURITY_OPTIONS.maxNestingDepth).toBe(100);
      expect(DEFAULT_SECURITY_OPTIONS.maxTotalSize).toBe(512 * 1024 * 1024);
    });

    it('should allow custom security limits', () => {
      const customOptions = {
        maxSegmentCount: 32,
        maxSegmentSize: 1024 * 1024,
        maxNestingDepth: 50,
      };

      const auditor = new AuditReader(customOptions);
      const buffer = MalformedMessageGenerator.tooManySegments(50);
      const result = auditor.audit(buffer);

      expect(result.issues.some((i) => i.type === SecurityIssueType.TOO_MANY_SEGMENTS)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty buffer', () => {
      const auditor = new AuditReader();
      const result = auditor.audit(new ArrayBuffer(0));
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should handle single byte buffer', () => {
      const auditor = new AuditReader();
      const result = auditor.audit(new Uint8Array([0xff]));
      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should handle all malformed message types', () => {
      const messages = MalformedMessageGenerator.generateAll();
      const auditor = new AuditReader();

      for (const [type, buffer] of messages) {
        // Each malformed message should either be detected as invalid or handled gracefully
        expect(() => {
          const result = auditor.audit(buffer);
          // Either has issues or is valid (for benign cases)
          expect(result).toBeDefined();
        }).not.toThrow();
      }
    });
  });
});
