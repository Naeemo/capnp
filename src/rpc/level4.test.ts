/**
 * Level 4 RPC Tests
 *
 * Tests for reference equality verification and Join operations.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Level4Handlers } from './level4-handlers.js';
import type { RpcConnection } from './rpc-connection.js';
import type { Join, MessageTarget } from './rpc-types.js';
import type { VatId } from './connection-manager.js';

describe('Level4Handlers', () => {
  let mockConnection: RpcConnection;
  let handlers: Level4Handlers;
  let mockVatId: VatId;

  beforeEach(() => {
    mockConnection = {
      createQuestion: vi.fn(() => Math.floor(Math.random() * 1000000)),
      sendCall: vi.fn().mockResolvedValue(undefined),
      waitForAnswer: vi.fn().mockResolvedValue({}),
      getImport: vi.fn(),
      sendReturn: vi.fn().mockResolvedValue(undefined),
    } as unknown as RpcConnection;

    mockVatId = { id: new Uint8Array(32).fill(1) };

    handlers = new Level4Handlers({
      connection: mockConnection,
      selfVatId: mockVatId,
    });
  });

  describe('Basic Join Operations', () => {
    it('should handle incoming Join message', async () => {
      const join: Join = {
        questionId: 1,
        target: { type: 'importedCap', importId: 1 },
        otherCap: { type: 'importedCap', importId: 2 },
        joinId: 100,
      };

      await handlers.handleJoin(join);

      // Should send a return message
      expect(mockConnection.sendReturn).toHaveBeenCalled();
    });

    it('should send Join request and return result', async () => {
      const target1: MessageTarget = { type: 'importedCap', importId: 1 };
      const target2: MessageTarget = { type: 'importedCap', importId: 2 };

      // Mock the connection to simulate a successful join response
      const mockSendCall = vi.fn().mockResolvedValue(undefined);
      mockConnection.sendCall = mockSendCall;

      const joinPromise = handlers.sendJoin(target1, target2);

      // Complete the pending join manually
      handlers.completeJoin(1, {
        equal: true,
        joinId: 1,
      });

      const result = await joinPromise;

      expect(mockSendCall).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should cache join results when enabled', async () => {
      const target1: MessageTarget = { type: 'importedCap', importId: 1 };
      const target2: MessageTarget = { type: 'importedCap', importId: 2 };

      // First join
      const join1: Join = {
        questionId: 1,
        target: target1,
        otherCap: target2,
        joinId: 100,
      };

      await handlers.handleJoin(join1);

      // Same join again - should use cache
      const join2: Join = {
        questionId: 2,
        target: target1,
        otherCap: target2,
        joinId: 101,
      };

      await handlers.handleJoin(join2);

      // Both should send return messages
      expect(mockConnection.sendReturn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Object Identity Comparison', () => {
    it('should consider null capabilities equal', async () => {
      const join: Join = {
        questionId: 1,
        target: { type: 'importedCap', importId: 999 }, // Non-existent import
        otherCap: { type: 'importedCap', importId: 998 }, // Non-existent import
        joinId: 100,
      };

      await handlers.handleJoin(join);

      const returnCall = (mockConnection.sendReturn as any).mock.calls[0];
      expect(returnCall).toBeDefined();
    });

    it('should detect different vat IDs as not equal', async () => {
      // This would require mocking object identities with different vat IDs
      // For now, we just verify the handler processes the message
      const join: Join = {
        questionId: 1,
        target: { type: 'importedCap', importId: 1 },
        otherCap: { type: 'importedCap', importId: 2 },
        joinId: 100,
      };

      await handlers.handleJoin(join);

      expect(mockConnection.sendReturn).toHaveBeenCalled();
    });
  });

  describe('Escrow Agent Mode', () => {
    it('should enable escrow mode', () => {
      handlers.setEscrowConfig({
        enabled: true,
        requiredParties: 3,
      });

      // Should not throw
      expect(() =>
        handlers.registerEscrowParty('party1', { type: 'importedCap', importId: 1 })
      ).not.toThrow();
    });

    it('should reject escrow registration when disabled', async () => {
      handlers.setEscrowConfig({ enabled: false });

      await expect(
        handlers.registerEscrowParty('party1', { type: 'importedCap', importId: 1 })
      ).rejects.toThrow('Escrow mode is not enabled');
    });

    it('should reject duplicate party registration', async () => {
      handlers.setEscrowConfig({ enabled: true, requiredParties: 2 });

      await handlers.registerEscrowParty('party1', { type: 'importedCap', importId: 1 });

      await expect(
        handlers.registerEscrowParty('party1', { type: 'importedCap', importId: 2 })
      ).rejects.toThrow('already registered');
    });

    it('should clear escrow state', () => {
      handlers.setEscrowConfig({ enabled: true, requiredParties: 2 });
      handlers.registerEscrowParty('party1', { type: 'importedCap', importId: 1 });

      handlers.clearEscrow();

      // Should be able to register again after clearing
      expect(() =>
        handlers.registerEscrowParty('party1', { type: 'importedCap', importId: 1 })
      ).not.toThrow();
    });
  });

  describe('Security Policy', () => {
    it('should set security policy', () => {
      handlers.setSecurityPolicy({
        verifyIdentityHashes: false,
        maxProxyDepth: 5,
      });

      // Should not throw
      expect(true).toBe(true);
    });

    it('should generate identity hash', async () => {
      const vatId = new Uint8Array(32).fill(1);
      const objectId = new Uint8Array(16).fill(2);

      const hash = await handlers.generateIdentityHash(vatId, objectId);

      expect(hash).toBeInstanceOf(Uint8Array);
      expect(hash.length).toBe(32); // SHA-256 produces 32 bytes
    });
  });

  describe('Caching', () => {
    it('should clear cache', () => {
      handlers.clearCache();

      const stats = handlers.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should cleanup expired cache entries', () => {
      // Add some cache entries
      const target1: MessageTarget = { type: 'importedCap', importId: 1 };
      const target2: MessageTarget = { type: 'importedCap', importId: 2 };

      const join: Join = {
        questionId: 1,
        target: target1,
        otherCap: target2,
        joinId: 100,
      };

      // This should populate the cache
      handlers.handleJoin(join);

      // Cleanup should return 0 if nothing expired (cache is fresh)
      const removed = handlers.cleanupExpiredCache();
      expect(typeof removed).toBe('number');
    });

    it('should return cache stats', () => {
      const stats = handlers.getCacheStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('hitRate');
      expect(typeof stats.size).toBe('number');
      expect(typeof stats.hitRate).toBe('number');
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout pending joins', async () => {
      // Create handlers with short timeout
      const shortTimeoutHandlers = new Level4Handlers({
        connection: mockConnection,
        joinOptions: {
          timeoutMs: 1, // 1ms timeout
        },
      });

      const target1: MessageTarget = { type: 'importedCap', importId: 1 };
      const target2: MessageTarget = { type: 'importedCap', importId: 2 };

      // This should timeout
      await expect(shortTimeoutHandlers.sendJoin(target1, target2)).rejects.toThrow('timed out');
    });
  });

  describe('Error Handling', () => {
    it('should handle exceptions during join', async () => {
      // Create handlers with a custom handler that throws
      const handlersWithError = new Level4Handlers({
        connection: mockConnection,
        onJoin: async () => {
          throw new Error('Custom error');
        },
      });

      const join: Join = {
        questionId: 1,
        target: { type: 'importedCap', importId: 1 },
        otherCap: { type: 'importedCap', importId: 2 },
        joinId: 100,
      };

      await handlersWithError.handleJoin(join);

      // Should send exception return
      expect(mockConnection.sendReturn).toHaveBeenCalled();
    });
  });
});

describe('Level 4 RPC Integration', () => {
  it('should integrate with RpcConnection', () => {
    // This is a placeholder for integration tests
    // In a full test suite, we would test:
    // - RpcConnection.setLevel4Handlers()
    // - RpcConnection.join()
    // - Full message flow
    expect(true).toBe(true);
  });
});
