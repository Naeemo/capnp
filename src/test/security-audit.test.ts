/**
 * Security Audit Module Tests
 */

import { describe, expect, it } from 'vitest';
import { MessageBuilder } from '../core/message-builder.js';
import { AuditReader, IssueType, Severity } from '../security/index.js';

describe('AuditReader', () => {
  describe('Basic Audit', () => {
    it('should audit an empty message', () => {
      const emptyBuffer = new ArrayBuffer(8);
      const view = new DataView(emptyBuffer);
      view.setUint32(0, 0, true); // 1 segment
      view.setUint32(4, 0, true); // 0 words

      const reader = new AuditReader(emptyBuffer);
      const report = reader.audit();

      expect(report.passed).toBe(true);
      expect(report.statistics.segmentCount).toBeGreaterThanOrEqual(0);
    });

    it('should audit a simple struct message', () => {
      // Create a simple message with a struct
      const builder = new MessageBuilder();
      const root = builder.initRoot(2, 1); // 2 data words, 1 pointer
      root.setUint32(0, 42);
      root.setUint32(4, 100);

      const buffer = builder.toArrayBuffer();
      const reader = new AuditReader(buffer);
      const report = reader.audit();

      expect(report.passed).toBe(true);
      expect(report.statistics.pointers.struct).toBeGreaterThan(0);
    });

    it('should detect nesting depth', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);

      // Create nested structs
      let current = root;
      for (let i = 0; i < 10; i++) {
        const next = current.initStruct(0, 0, 1);
        current = next;
      }

      const buffer = builder.toArrayBuffer();
      const reader = new AuditReader(buffer, { maxNestingDepth: 5 });
      const report = reader.audit();

      expect(report.passed).toBe(false);
      expect(report.issues.some((i) => i.type === IssueType.NESTING_DEPTH_EXCEEDED)).toBe(true);
    });
  });

  describe('Quick Check', () => {
    it('should perform quick check', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(1, 0);
      root.setUint32(0, 123);

      const buffer = builder.toArrayBuffer();
      const reader = new AuditReader(buffer);
      const result = reader.quickCheck();

      expect(typeof result.passed).toBe('boolean');
      expect(Array.isArray(result.issues)).toBe(true);
      expect(result.issueCounts).toBeDefined();
    });
  });

  describe('Statistics', () => {
    it('should count pointers correctly', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 3); // 3 pointers

      // Set some pointers
      root.setText(0, 'hello');
      root.setText(1, 'world');
      // Leave third pointer as null

      const buffer = builder.toArrayBuffer();
      const reader = new AuditReader(buffer);
      const report = reader.audit();

      expect(report.statistics.pointers.total).toBeGreaterThan(0);
      expect(report.statistics.pointers.null).toBeGreaterThanOrEqual(0);
    });

    it('should track segment stats', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(2, 0);
      root.setUint64(0, BigInt(999));

      const buffer = builder.toArrayBuffer();
      const reader = new AuditReader(buffer);
      const report = reader.audit();

      expect(report.statistics.segments.length).toBeGreaterThan(0);
      expect(report.statistics.segmentCount).toBe(report.statistics.segments.length);
    });
  });

  describe('Severity Levels', () => {
    it('should categorize issues by severity', () => {
      // Create a message that will trigger nesting depth issue
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);

      let current = root;
      for (let i = 0; i < 20; i++) {
        const next = current.initStruct(0, 0, 1);
        current = next;
      }

      const buffer = builder.toArrayBuffer();
      const reader = new AuditReader(buffer, { maxNestingDepth: 5 });
      const report = reader.audit();

      expect(report.issueCounts.error).toBeGreaterThan(0);
      expect(report.issues.every((i) => i.severity === Severity.ERROR)).toBe(true);
    });
  });

  describe('Far Pointer Detection', () => {
    it('should handle valid messages without false positives', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(1, 2);
      root.setUint32(0, 0x12345678);

      // Create two text fields
      root.setText(0, 'first text');
      root.setText(1, 'second text');

      const buffer = builder.toArrayBuffer();
      const reader = new AuditReader(buffer);
      const report = reader.audit();

      expect(report.passed).toBe(true);
      expect(report.issues.length).toBe(0);
    });
  });

  describe('Issue Types', () => {
    it('should include location information in issues', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);

      // Create deep nesting
      let current = root;
      for (let i = 0; i < 15; i++) {
        const next = current.initStruct(0, 0, 1);
        current = next;
      }

      const buffer = builder.toArrayBuffer();
      const reader = new AuditReader(buffer, { maxNestingDepth: 5 });
      const report = reader.audit();

      const depthIssue = report.issues.find((i) => i.type === IssueType.NESTING_DEPTH_EXCEEDED);
      expect(depthIssue).toBeDefined();
      expect(depthIssue!.location.segmentIndex).toBe(0);
      expect(typeof depthIssue!.location.wordOffset).toBe('number');
      expect(depthIssue!.pointerChain).toBeDefined();
      expect(depthIssue!.pointerChain.length).toBeGreaterThan(0);
    });
  });

  describe('Report Structure', () => {
    it('should have complete report structure', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(1, 1);
      root.setUint32(0, 42);
      root.setText(0, 'test');

      const buffer = builder.toArrayBuffer();
      const reader = new AuditReader(buffer);
      const report = reader.audit();

      // Check report structure
      expect(typeof report.passed).toBe('boolean');
      expect(Array.isArray(report.issues)).toBe(true);
      expect(report.issueCounts).toMatchObject({
        info: expect.any(Number),
        warning: expect.any(Number),
        error: expect.any(Number),
        critical: expect.any(Number),
      });
      expect(report.statistics).toMatchObject({
        segmentCount: expect.any(Number),
        totalWords: expect.any(Number),
        pointers: expect.any(Object),
        segments: expect.any(Array),
        maxNestingDepth: expect.any(Number),
        detectedMaxDepth: expect.any(Number),
        farPointerChainCount: expect.any(Number),
        cycleCount: expect.any(Number),
      });
      expect(Array.isArray(report.farPointerChains)).toBe(true);
      expect(report.auditTime).toBeInstanceOf(Date);
      expect(typeof report.durationMs).toBe('number');
    });
  });
});
