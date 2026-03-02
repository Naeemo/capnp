/**
 * RPC Module Tests
 *
 * Tests for Phase 1 Level 0 RPC implementation.
 */

import { describe, expect, it } from 'vitest';
import { AnswerTable, ExportTable, ImportTable, QuestionTable } from './four-tables.js';

describe('Four Tables', () => {
  describe('QuestionTable', () => {
    it('should create questions with unique IDs', () => {
      const table = new QuestionTable();
      const q1 = table.create();
      const q2 = table.create();

      expect(q1.id).toBe(1);
      expect(q2.id).toBe(2);
      expect(q1.id).not.toBe(q2.id);
    });

    it('should track question completion', async () => {
      const table = new QuestionTable();
      const q = table.create();

      expect(q.isComplete).toBe(false);

      table.complete(q.id, { result: 'test' });

      expect(q.isComplete).toBe(true);
      await expect(q.completionPromise).resolves.toEqual({ result: 'test' });
    });

    it('should track question cancellation', async () => {
      const table = new QuestionTable();
      const q = table.create();

      table.cancel(q.id, new Error('Canceled'));

      expect(q.isComplete).toBe(true);
      await expect(q.completionPromise).rejects.toThrow('Canceled');
    });

    it('should mark finish sent', () => {
      const table = new QuestionTable();
      const q = table.create();

      expect(q.finishSent).toBe(false);

      table.markFinishSent(q.id);

      expect(q.finishSent).toBe(true);
    });

    it('should remove completed questions', () => {
      const table = new QuestionTable();
      const q = table.create();

      table.complete(q.id, {});
      table.markFinishSent(q.id);
      table.remove(q.id);

      expect(table.get(q.id)).toBeUndefined();
    });

    it('should clear all questions on disconnect', async () => {
      const table = new QuestionTable();
      const q1 = table.create();
      const q2 = table.create();

      table.clear();

      await expect(q1.completionPromise).rejects.toThrow('Connection closed');
      await expect(q2.completionPromise).rejects.toThrow('Connection closed');
    });
  });

  describe('AnswerTable', () => {
    it('should create answers', () => {
      const table = new AnswerTable();
      const a = table.create(1);

      expect(a.id).toBe(1);
      expect(a.returnSent).toBe(false);
      expect(a.finishReceived).toBe(false);
    });

    it('should mark return sent', () => {
      const table = new AnswerTable();
      const a = table.create(1);

      table.markReturnSent(a.id);

      expect(a.returnSent).toBe(true);
    });

    it('should mark finish received', () => {
      const table = new AnswerTable();
      const a = table.create(1);

      table.markFinishReceived(a.id);

      expect(a.finishReceived).toBe(true);
    });

    it('should remove completed answers', () => {
      const table = new AnswerTable();
      const a = table.create(1);

      table.markReturnSent(a.id);
      table.markFinishReceived(a.id);
      table.remove(a.id);

      expect(table.get(a.id)).toBeUndefined();
    });
  });

  describe('ImportTable', () => {
    it('should add imports', () => {
      const table = new ImportTable();
      const imp = table.add(1, false);

      expect(imp.id).toBe(1);
      expect(imp.refCount).toBe(1);
      expect(imp.isPromise).toBe(false);
    });

    it('should track reference count', () => {
      const table = new ImportTable();
      table.add(1, false);

      table.addRef(1);
      expect(table.get(1)?.refCount).toBe(2);

      const released = table.release(1, 1);
      expect(released).toBe(false);
      expect(table.get(1)?.refCount).toBe(1);
    });

    it('should remove when refCount reaches 0', () => {
      const table = new ImportTable();
      table.add(1, false);

      const released = table.release(1, 1);
      expect(released).toBe(true);
      expect(table.get(1)).toBeUndefined();
    });
  });

  describe('ExportTable', () => {
    it('should add exports with auto-generated IDs', () => {
      const table = new ExportTable();
      const exp1 = table.add({}, false);
      const exp2 = table.add({}, false);

      expect(exp1.id).toBe(1);
      expect(exp2.id).toBe(2);
    });

    it('should store capability objects', () => {
      const table = new ExportTable();
      const cap = { test: 'capability' };
      const exp = table.add(cap, false);

      expect(exp.capability).toBe(cap);
    });

    it('should track reference count', () => {
      const table = new ExportTable();
      table.add({}, false);

      table.addRef(1);
      expect(table.get(1)?.refCount).toBe(2);

      table.release(1, 2);
      expect(table.get(1)).toBeUndefined();
    });
  });
});
