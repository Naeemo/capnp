/**
 * RPC Message Serialization Tests
 *
 * Tests for Phase 2 message serialization/deserialization
 */

import { describe, expect, it } from 'vitest';
import { deserializeRpcMessage, serializeRpcMessage } from './message-serializer.js';
import type { Bootstrap, Exception, Finish, RpcMessage } from './rpc-types.js';

describe('RPC Message Serialization', () => {
  describe('Bootstrap', () => {
    it('should serialize and deserialize bootstrap message', () => {
      const original: RpcMessage = {
        type: 'bootstrap',
        bootstrap: {
          questionId: 42,
        },
      };

      const serialized = serializeRpcMessage(original);
      const deserialized = deserializeRpcMessage(serialized);

      expect(deserialized.type).toBe('bootstrap');
      expect((deserialized as { bootstrap: Bootstrap }).bootstrap.questionId).toBe(42);
    });
  });

  describe('Finish', () => {
    it('should serialize and deserialize finish message', () => {
      const original: RpcMessage = {
        type: 'finish',
        finish: {
          questionId: 123,
          releaseResultCaps: true,
          requireEarlyCancellationWorkaround: false,
        },
      };

      const serialized = serializeRpcMessage(original);
      const deserialized = deserializeRpcMessage(serialized);

      expect(deserialized.type).toBe('finish');
      const finish = (
        deserialized as {
          finish: {
            questionId: number;
            releaseResultCaps: boolean;
            requireEarlyCancellationWorkaround: boolean;
          };
        }
      ).finish;
      expect(finish.questionId).toBe(123);
      expect(finish.releaseResultCaps).toBe(true);
      expect(finish.requireEarlyCancellationWorkaround).toBe(false);
    });
  });

  describe('Release', () => {
    it('should serialize and deserialize release message', () => {
      const original: RpcMessage = {
        type: 'release',
        release: {
          id: 5,
          referenceCount: 1,
        },
      };

      const serialized = serializeRpcMessage(original);
      const deserialized = deserializeRpcMessage(serialized);

      expect(deserialized.type).toBe('release');
      expect((deserialized as { release: { id: number; referenceCount: number } }).release.id).toBe(
        5
      );
      expect(
        (deserialized as { release: { id: number; referenceCount: number } }).release.referenceCount
      ).toBe(1);
    });
  });

  describe('Return with results', () => {
    it('should serialize and deserialize return with results', () => {
      const original: RpcMessage = {
        type: 'return',
        return: {
          answerId: 456,
          releaseParamCaps: true,
          noFinishNeeded: false,
          result: {
            type: 'results',
            payload: {
              content: new Uint8Array([1, 2, 3, 4]),
              capTable: [],
            },
          },
        },
      };

      const serialized = serializeRpcMessage(original);
      const deserialized = deserializeRpcMessage(serialized);

      expect(deserialized.type).toBe('return');
      const ret = (deserialized as { return: { answerId: number; result: { type: string } } })
        .return;
      expect(ret.answerId).toBe(456);
      expect(ret.result.type).toBe('results');
    });
  });

  describe('Return with exception', () => {
    it('should serialize and deserialize return with exception', () => {
      const original: RpcMessage = {
        type: 'return',
        return: {
          answerId: 789,
          releaseParamCaps: false,
          noFinishNeeded: true,
          result: {
            type: 'exception',
            exception: {
              reason: 'Test error',
              type: 'failed',
            },
          },
        },
      };

      const serialized = serializeRpcMessage(original);
      const deserialized = deserializeRpcMessage(serialized);

      expect(deserialized.type).toBe('return');
      const ret = (
        deserialized as {
          return: { answerId: number; result: { type: string; exception?: Exception } };
        }
      ).return;
      expect(ret.answerId).toBe(789);
      expect(ret.result.type).toBe('exception');
      if (ret.result.type === 'exception' && ret.result.exception) {
        expect(ret.result.exception.reason).toBe('Test error');
        expect(ret.result.exception.type).toBe('failed');
      }
    });
  });

  describe('Resolve', () => {
    it('should serialize and deserialize resolve with capability', () => {
      const original: RpcMessage = {
        type: 'resolve',
        resolve: {
          promiseId: 10,
          resolution: {
            type: 'cap',
            cap: { type: 'senderHosted', exportId: 20 },
          },
        },
      };

      const serialized = serializeRpcMessage(original);
      const deserialized = deserializeRpcMessage(serialized);

      expect(deserialized.type).toBe('resolve');
      const resolve = (
        deserialized as {
          resolve: {
            promiseId: number;
            resolution: { type: string; cap: { type: string; exportId: number } };
          };
        }
      ).resolve;
      expect(resolve.promiseId).toBe(10);
      expect(resolve.resolution.type).toBe('cap');
      expect(resolve.resolution.cap.type).toBe('senderHosted');
      expect(resolve.resolution.cap.exportId).toBe(20);
    });

    it('should serialize and deserialize resolve with exception', () => {
      const original: RpcMessage = {
        type: 'resolve',
        resolve: {
          promiseId: 11,
          resolution: {
            type: 'exception',
            exception: {
              reason: 'Promise broken',
              type: 'disconnected',
            },
          },
        },
      };

      const serialized = serializeRpcMessage(original);
      const deserialized = deserializeRpcMessage(serialized);

      expect(deserialized.type).toBe('resolve');
      const resolve = (
        deserialized as {
          resolve: { promiseId: number; resolution: { type: string; exception: Exception } };
        }
      ).resolve;
      expect(resolve.promiseId).toBe(11);
      expect(resolve.resolution.type).toBe('exception');
      expect(resolve.resolution.exception.reason).toBe('Promise broken');
      expect(resolve.resolution.exception.type).toBe('disconnected');
    });
  });

  describe('Disembargo', () => {
    it('should serialize and deserialize disembargo with sender loopback', () => {
      const original: RpcMessage = {
        type: 'disembargo',
        disembargo: {
          target: { type: 'importedCap', importId: 5 },
          context: { type: 'senderLoopback', embargoId: 100 },
        },
      };

      const serialized = serializeRpcMessage(original);
      const deserialized = deserializeRpcMessage(serialized);

      expect(deserialized.type).toBe('disembargo');
      const disembargo = (
        deserialized as {
          disembargo: {
            target: { type: string; importId: number };
            context: { type: string; embargoId: number };
          };
        }
      ).disembargo;
      expect(disembargo.target.type).toBe('importedCap');
      expect(disembargo.context.type).toBe('senderLoopback');
      expect(disembargo.context.embargoId).toBe(100);
    });
  });

  describe('Abort', () => {
    it('should serialize and deserialize abort message', () => {
      const original: RpcMessage = {
        type: 'abort',
        exception: {
          reason: 'Connection error',
          type: 'disconnected',
        },
      };

      const serialized = serializeRpcMessage(original);
      const deserialized = deserializeRpcMessage(serialized);

      expect(deserialized.type).toBe('abort');
      const abort = deserialized as { exception: Exception };
      expect(abort.exception.reason).toBe('Connection error');
      expect(abort.exception.type).toBe('disconnected');
    });
  });
});
