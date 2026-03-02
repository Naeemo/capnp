/**
 * Promise Pipelining Tests
 *
 * Tests for Phase 2 Promise Pipelining implementation
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PIPELINE_CLIENT_SYMBOL,
  PipelineOpTracker,
  PipelineResolutionTracker,
  QueuedCallManager,
  createPipelineClient,
  isPipelineClient,
} from './pipeline.js';
import type { RpcConnection } from './rpc-connection.js';
import type { Payload } from './rpc-types.js';

describe('PipelineOpTracker', () => {
  it('should track no-op operations', () => {
    const tracker = new PipelineOpTracker();
    tracker.addNoop();

    const transform = tracker.getTransform();
    expect(transform).toHaveLength(1);
    expect(transform[0]).toEqual({ type: 'noop' });
  });

  it('should track getPointerField operations', () => {
    const tracker = new PipelineOpTracker();
    tracker.addGetPointerField(5);

    const transform = tracker.getTransform();
    expect(transform).toHaveLength(1);
    expect(transform[0]).toEqual({ type: 'getPointerField', fieldIndex: 5 });
  });

  it('should track multiple operations', () => {
    const tracker = new PipelineOpTracker();
    tracker.addNoop();
    tracker.addGetPointerField(1);
    tracker.addGetPointerField(2);

    const transform = tracker.getTransform();
    expect(transform).toHaveLength(3);
    expect(transform[0]).toEqual({ type: 'noop' });
    expect(transform[1]).toEqual({ type: 'getPointerField', fieldIndex: 1 });
    expect(transform[2]).toEqual({ type: 'getPointerField', fieldIndex: 2 });
  });

  it('should clone correctly', () => {
    const tracker = new PipelineOpTracker();
    tracker.addNoop();
    tracker.addGetPointerField(3);

    const cloned = tracker.clone();
    cloned.addGetPointerField(4);

    // Original should be unchanged
    expect(tracker.getTransform()).toHaveLength(2);
    // Clone should have the new operation
    expect(cloned.getTransform()).toHaveLength(3);
  });
});

describe('PipelineClient', () => {
  const mockConnection = {
    createQuestion: vi.fn().mockReturnValue(100),
    sendCall: vi.fn().mockResolvedValue(undefined),
    waitForAnswer: vi.fn().mockResolvedValue({ result: 'test' }),
  } as unknown as RpcConnection;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a pipeline client with correct properties', () => {
    const client = createPipelineClient({
      connection: mockConnection,
      questionId: 42,
    });

    expect(client[PIPELINE_CLIENT_SYMBOL]).toBe(true);
    expect(client.connection).toBe(mockConnection);
    expect(client.questionId).toBe(42);
    expect(client.opTracker).toBeDefined();
  });

  it('should identify pipeline clients correctly', () => {
    const client = createPipelineClient({
      connection: mockConnection,
      questionId: 42,
    });

    expect(isPipelineClient(client)).toBe(true);
    expect(isPipelineClient({})).toBe(false);
    expect(isPipelineClient(null)).toBe(false);
    expect(isPipelineClient('string')).toBe(false);
    expect(isPipelineClient(123)).toBe(false);
  });

  it('should create derived pipeline clients with getPointerField', () => {
    const client = createPipelineClient({
      connection: mockConnection,
      questionId: 42,
    });

    const fieldClient = client.getPointerField(3);

    expect(isPipelineClient(fieldClient)).toBe(true);
    expect(fieldClient.questionId).toBe(42); // Same question
    expect(fieldClient.opTracker.getTransform()).toEqual([
      { type: 'getPointerField', fieldIndex: 3 },
    ]);
  });

  it('should chain multiple getPointerField calls', () => {
    const client = createPipelineClient({
      connection: mockConnection,
      questionId: 42,
    });

    const fieldClient = client.getPointerField(1).getPointerField(2).getPointerField(3);

    expect(fieldClient.opTracker.getTransform()).toEqual([
      { type: 'getPointerField', fieldIndex: 1 },
      { type: 'getPointerField', fieldIndex: 2 },
      { type: 'getPointerField', fieldIndex: 3 },
    ]);
  });

  it('should make pipelined calls', async () => {
    const client = createPipelineClient({
      connection: mockConnection,
      questionId: 42,
    });

    const params: Payload = {
      content: new Uint8Array([1, 2, 3]),
      capTable: [],
    };

    const result = await client.call(BigInt(0x1234), 1, params);

    expect(mockConnection.createQuestion).toHaveBeenCalled();
    expect(mockConnection.sendCall).toHaveBeenCalled();
    expect(mockConnection.waitForAnswer).toHaveBeenCalled();
    expect(result).toEqual({ result: 'test' });
  });
});

describe('QueuedCallManager', () => {
  it('should queue calls', () => {
    const manager = new QueuedCallManager();

    const call = {
      interfaceId: BigInt(1),
      methodId: 2,
      params: { content: new Uint8Array(), capTable: [] },
      resolve: vi.fn(),
      reject: vi.fn(),
    };

    manager.queueCall(42, call);

    expect(manager.hasQueuedCalls(42)).toBe(true);
  });

  it('should dequeue calls', () => {
    const manager = new QueuedCallManager();

    const call1 = {
      interfaceId: BigInt(1),
      methodId: 1,
      params: { content: new Uint8Array(), capTable: [] },
      resolve: vi.fn(),
      reject: vi.fn(),
    };

    const call2 = {
      interfaceId: BigInt(1),
      methodId: 2,
      params: { content: new Uint8Array(), capTable: [] },
      resolve: vi.fn(),
      reject: vi.fn(),
    };

    manager.queueCall(42, call1);
    manager.queueCall(42, call2);

    const dequeued = manager.dequeueCalls(42);

    expect(dequeued).toHaveLength(2);
    expect(manager.hasQueuedCalls(42)).toBe(false);
  });

  it('should reject all queued calls on clear', () => {
    const manager = new QueuedCallManager();

    const reject1 = vi.fn();
    const reject2 = vi.fn();

    manager.queueCall(42, {
      interfaceId: BigInt(1),
      methodId: 1,
      params: { content: new Uint8Array(), capTable: [] },
      resolve: vi.fn(),
      reject: reject1,
    });

    manager.queueCall(43, {
      interfaceId: BigInt(1),
      methodId: 2,
      params: { content: new Uint8Array(), capTable: [] },
      resolve: vi.fn(),
      reject: reject2,
    });

    manager.clear();

    expect(reject1).toHaveBeenCalledWith(expect.any(Error));
    expect(reject2).toHaveBeenCalledWith(expect.any(Error));
    expect(manager.hasQueuedCalls(42)).toBe(false);
    expect(manager.hasQueuedCalls(43)).toBe(false);
  });
});

describe('PipelineResolutionTracker', () => {
  it('should track capability resolutions', () => {
    const tracker = new PipelineResolutionTracker();

    tracker.resolveToCapability(42, 100);

    expect(tracker.isResolved(42)).toBe(true);
    expect(tracker.getResolution(42)).toEqual({ type: 'capability', importId: 100 });
  });

  it('should track exception resolutions', () => {
    const tracker = new PipelineResolutionTracker();

    tracker.resolveToException(42, 'Something went wrong');

    expect(tracker.isResolved(42)).toBe(true);
    expect(tracker.getResolution(42)).toEqual({
      type: 'exception',
      reason: 'Something went wrong',
    });
  });

  it('should return undefined for unresolved questions', () => {
    const tracker = new PipelineResolutionTracker();

    expect(tracker.isResolved(42)).toBe(false);
    expect(tracker.getResolution(42)).toBeUndefined();
  });

  it('should remove resolutions', () => {
    const tracker = new PipelineResolutionTracker();

    tracker.resolveToCapability(42, 100);
    tracker.remove(42);

    expect(tracker.isResolved(42)).toBe(false);
  });

  it('should clear all resolutions', () => {
    const tracker = new PipelineResolutionTracker();

    tracker.resolveToCapability(42, 100);
    tracker.resolveToCapability(43, 101);

    tracker.clear();

    expect(tracker.isResolved(42)).toBe(false);
    expect(tracker.isResolved(43)).toBe(false);
  });
});
