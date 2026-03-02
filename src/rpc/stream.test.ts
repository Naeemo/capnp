/**
 * Stream Tests
 *
 * Tests for the Stream abstraction and flow control
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Stream,
  StreamPriority,
  createStream,
  isStream,
  DEFAULT_FLOW_CONTROL,
  type StreamOptions,
  type StreamChunk,
} from './stream.js';

describe('Stream', () => {
  let stream: Stream;

  beforeEach(() => {
    const options: StreamOptions = {
      streamId: 1,
      direction: 'bidirectional',
      priority: StreamPriority.NORMAL,
    };
    stream = new Stream(options);
  });

  describe('Construction', () => {
    it('should create a stream with default options', () => {
      expect(stream.id).toBe(1);
      expect(stream.direction).toBe('bidirectional');
      expect(stream.priority).toBe(StreamPriority.NORMAL);
      expect(stream.currentState).toBe('connecting');
    });

    it('should create a stream with custom priority', () => {
      const highPriorityStream = new Stream({
        streamId: 2,
        direction: 'outbound',
        priority: StreamPriority.HIGH,
      });
      expect(highPriorityStream.priority).toBe(StreamPriority.HIGH);
    });

    it('should identify as a stream', () => {
      expect(isStream(stream)).toBe(true);
      expect(isStream({})).toBe(false);
      expect(isStream(null)).toBe(false);
    });
  });

  describe('State Management', () => {
    it('should transition from connecting to open', async () => {
      expect(stream.currentState).toBe('connecting');

      const openPromise = stream.open();
      expect(stream.currentState).toBe('open');

      await openPromise;
      expect(stream.isOpen).toBe(true);
    });

    it('should not allow opening an already open stream', async () => {
      await stream.open();
      await expect(stream.open()).rejects.toThrow('Cannot open stream in state: open');
    });

    it('should transition to closing and then closed', async () => {
      await stream.open();

      const closePromise = stream.close();
      expect(stream.currentState).toBe('closing');

      await closePromise;
      expect(stream.currentState).toBe('closed');
      expect(stream.isOpen).toBe(false);
    });

    it('should transition to error state on abort', async () => {
      await stream.open();

      const error = new Error('Test error');
      stream.abort(error);

      expect(stream.currentState).toBe('error');
      expect(stream.isOpen).toBe(false);
    });
  });

  describe('Data Transfer', () => {
    beforeEach(async () => {
      await stream.open();
    });

    it('should send data through the stream', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      await stream.send(data);

      expect(stream.bytesSentCount).toBe(5);
    });

    it('should receive data from the stream', async () => {
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      const chunk: StreamChunk = {
        data: testData,
        sequenceNumber: 0,
        timestamp: Date.now(),
      };

      // Simulate incoming data
      stream.handleIncomingChunk(chunk);

      const received = await stream.receive();
      expect(received).toBeDefined();
      expect(received!.data).toEqual(testData);
      expect(stream.bytesReceivedCount).toBe(5);
    });

    it('should queue received data when no handler is set', async () => {
      const chunk1: StreamChunk = {
        data: new Uint8Array([1]),
        sequenceNumber: 0,
      };
      const chunk2: StreamChunk = {
        data: new Uint8Array([2]),
        sequenceNumber: 1,
      };

      stream.handleIncomingChunk(chunk1);
      stream.handleIncomingChunk(chunk2);

      const received1 = await stream.receive();
      const received2 = await stream.receive();

      expect(received1!.data[0]).toBe(1);
      expect(received2!.data[0]).toBe(2);
    });
  });

  describe('Flow Control', () => {
    beforeEach(async () => {
      await stream.open();
    });

    it('should track send window', async () => {
      const initialWindow = DEFAULT_FLOW_CONTROL.initialWindowSize;

      // Send data within window
      const data = new Uint8Array(initialWindow / 2);
      await stream.send(data);

      expect(stream.bytesSentCount).toBe(initialWindow / 2);
    });

    it('should update send window', () => {
      const increment = 32768;
      stream.updateSendWindow(increment);

      // After update, more data should be sendable
      expect(stream.isBackpressureActive).toBe(false);
    });

    it('should acknowledge received bytes', () => {
      const chunk: StreamChunk = {
        data: new Uint8Array(1000),
        sequenceNumber: 0,
      };

      stream.handleIncomingChunk(chunk);
      expect(stream.bytesReceivedCount).toBe(1000);

      stream.acknowledgeBytes(500);
      // Should trigger window update check
    });
  });

  describe('Progress Tracking', () => {
    it('should track progress when enabled', async () => {
      const progressHandler = vi.fn();
      const progressStream = new Stream(
        {
          streamId: 2,
          direction: 'outbound',
          enableProgress: true,
          progressInterval: 100,
        },
        {
          onProgress: progressHandler,
        }
      );

      await progressStream.open();
      progressStream.setTotalBytesExpected(1000);

      // Send data above progress interval
      await progressStream.send(new Uint8Array(150));

      // Progress should have been reported
      expect(progressHandler).toHaveBeenCalled();
    });
  });

  describe('Event Handlers', () => {
    it('should call onOpen handler', async () => {
      const onOpen = vi.fn();
      const handlerStream = new Stream(
        { streamId: 3, direction: 'outbound' },
        { onOpen }
      );

      await handlerStream.open();
      expect(onOpen).toHaveBeenCalled();
    });

    it('should call onClose handler', async () => {
      const onClose = vi.fn();
      const handlerStream = new Stream(
        { streamId: 4, direction: 'outbound' },
        { onClose }
      );

      await handlerStream.open();
      await handlerStream.close();

      expect(onClose).toHaveBeenCalled();
    });

    it('should call onError handler', async () => {
      const onError = vi.fn();
      const handlerStream = new Stream(
        { streamId: 5, direction: 'outbound' },
        { onError }
      );

      await handlerStream.open();
      handlerStream.abort(new Error('Test error'));

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should call onBackpressure handler', async () => {
      const onBackpressure = vi.fn();
      const handlerStream = new Stream(
        {
          streamId: 6,
          direction: 'outbound',
          flowControl: {
            initialWindowSize: 100,
            minWindowSize: 50,
          },
        },
        { onBackpressure }
      );

      await handlerStream.open();

      // Send data to trigger backpressure
      await handlerStream.send(new Uint8Array(60));

      // Backpressure should be active
      expect(handlerStream.isBackpressureActive).toBe(true);
      expect(onBackpressure).toHaveBeenCalledWith(true);
    });
  });

  describe('End-to-End Stream', () => {
    it('should complete a full stream lifecycle', { timeout: 10000 }, async () => {
      const events: string[] = [];

      const testStream = new Stream(
        { streamId: 7, direction: 'bidirectional', enableProgress: true, progressInterval: 1 },
        {
          onOpen: () => events.push('open'),
          onClose: () => events.push('close'),
          onProgress: () => events.push('progress'),
        }
      );

      // Open
      await testStream.open();
      expect(testStream.isOpen).toBe(true);

      // Send data
      await testStream.send(new Uint8Array([1, 2, 3]));
      await testStream.send(new Uint8Array([4, 5, 6]));

      // Receive data
      const incomingChunk: StreamChunk = {
        data: new Uint8Array([7, 8, 9]),
        sequenceNumber: 0,
      };
      testStream.handleIncomingChunk(incomingChunk);

      const received = await testStream.receive();
      expect(received!.data).toEqual(new Uint8Array([7, 8, 9]));

      // Close
      await testStream.close();
      expect(testStream.currentState).toBe('closed');

      // Verify events
      expect(events).toContain('open');
      expect(events).toContain('close');
    });
  });
});

describe('StreamPriority', () => {
  it('should have correct priority values', () => {
    expect(StreamPriority.CRITICAL).toBe(0);
    expect(StreamPriority.HIGH).toBe(1);
    expect(StreamPriority.NORMAL).toBe(2);
    expect(StreamPriority.LOW).toBe(3);
    expect(StreamPriority.BACKGROUND).toBe(4);
  });

  it('should order priorities correctly', () => {
    expect(StreamPriority.CRITICAL).toBeLessThan(StreamPriority.HIGH);
    expect(StreamPriority.HIGH).toBeLessThan(StreamPriority.NORMAL);
    expect(StreamPriority.NORMAL).toBeLessThan(StreamPriority.LOW);
    expect(StreamPriority.LOW).toBeLessThan(StreamPriority.BACKGROUND);
  });
});

describe('createStream', () => {
  it('should create a stream with the given options', () => {
    const stream = createStream({
      streamId: 1,
      direction: 'inbound',
      priority: StreamPriority.HIGH,
    });

    expect(stream).toBeInstanceOf(Stream);
    expect(stream.id).toBe(1);
    expect(stream.direction).toBe('inbound');
    expect(stream.priority).toBe(StreamPriority.HIGH);
  });
});
