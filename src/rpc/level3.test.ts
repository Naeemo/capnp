/**
 * Level 3 RPC Tests
 *
 * Tests for three-way introduction protocol:
 * - Provide/Accept message handling
 * - Third-party capability passing
 * - ConnectionManager
 * - Embargo handling for cycle breaking
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConnectionManager,
  createThirdPartyCapId,
  generateProvisionId,
  generateVatId,
} from './connection-manager.js';
import type { VatId } from './connection-manager.js';
import { Level3Handlers } from './level3-handlers.js';
import { RpcConnection } from './rpc-connection.js';
import type { Accept, Provide, RpcMessage } from './rpc-types.js';
import type { RpcTransport } from './transport.js';

// Mock transport for testing
class MockTransport implements RpcTransport {
  connected = true;
  sentMessages: RpcMessage[] = [];
  receiveQueue: RpcMessage[] = [];
  onClose?: (reason?: Error) => void;
  onError?: (error: Error) => void;

  getCompressionState() {
    return {
      enabled: false,
      algorithm: 'none',
      bytesSent: 0,
      bytesReceived: 0,
      uncompressedBytesSent: 0,
      uncompressedBytesReceived: 0,
      messagesCompressed: 0,
      messagesDecompressed: 0,
    };
  }

  async send(message: RpcMessage): Promise<void> {
    this.sentMessages.push(message);
  }

  async receive(): Promise<RpcMessage | null> {
    if (this.receiveQueue.length > 0) {
      return this.receiveQueue.shift()!;
    }
    // Return null to signal connection closed
    return null;
  }

  close(_reason?: Error): void {
    this.connected = false;
  }

  // Test helper: queue a message to be received
  queueMessage(message: RpcMessage): void {
    this.receiveQueue.push(message);
  }
}

describe('Level 3 RPC', () => {
  describe('ConnectionManager', () => {
    let connectionManager: ConnectionManager;
    let selfVatId: VatId;

    beforeEach(() => {
      selfVatId = generateVatId();
      connectionManager = new ConnectionManager({
        selfVatId,
        connectionFactory: async (_vatId) => {
          // Return a mock transport
          return new MockTransport() as unknown as RpcTransport;
        },
        autoConnect: false,
      });
    });

    it('should generate unique vat IDs', () => {
      const vatId1 = generateVatId();
      const vatId2 = generateVatId();

      expect(vatId1.id.length).toBe(32);
      expect(vatId2.id.length).toBe(32);
      expect(vatId1.id).not.toEqual(vatId2.id);
    });

    it('should generate unique provision IDs', () => {
      const provisionId1 = generateProvisionId();
      const provisionId2 = generateProvisionId();

      expect(provisionId1.id.length).toBe(32);
      expect(provisionId2.id.length).toBe(32);
      expect(provisionId1.id).not.toEqual(provisionId2.id);
    });

    it('should create and retrieve pending provisions', () => {
      const provisionId = generateProvisionId();
      const recipientId = generateVatId();
      const targetExportId = 42;
      const questionId = 1;

      const provision = connectionManager.createPendingProvision(
        provisionId,
        recipientId,
        targetExportId,
        questionId,
        false
      );

      expect(provision).toBeDefined();
      expect(provision.targetExportId).toBe(targetExportId);
      expect(provision.questionId).toBe(questionId);
      expect(provision.embargoed).toBe(false);

      const retrieved = connectionManager.getPendingProvision(provisionId);
      expect(retrieved).toEqual(provision);
    });

    it('should find provisions for a specific recipient', () => {
      const recipientId = generateVatId();
      const otherRecipientId = generateVatId();

      connectionManager.createPendingProvision(generateProvisionId(), recipientId, 1, 1, false);

      connectionManager.createPendingProvision(generateProvisionId(), recipientId, 2, 2, false);

      connectionManager.createPendingProvision(
        generateProvisionId(),
        otherRecipientId,
        3,
        3,
        false
      );

      const provisions = connectionManager.findProvisionsForRecipient(recipientId);
      expect(provisions.length).toBe(2);
    });

    it('should remove pending provisions', () => {
      const provisionId = generateProvisionId();
      const recipientId = generateVatId();

      connectionManager.createPendingProvision(provisionId, recipientId, 1, 1, false);
      expect(connectionManager.getPendingProvision(provisionId)).toBeDefined();

      const removed = connectionManager.removePendingProvision(provisionId);
      expect(removed).toBe(true);
      expect(connectionManager.getPendingProvision(provisionId)).toBeUndefined();
    });

    it('should create ThirdPartyCapId correctly', () => {
      const vatId = generateVatId();
      const provisionId = generateProvisionId();

      const thirdPartyCapId = createThirdPartyCapId(vatId, provisionId);

      expect(thirdPartyCapId.id.length).toBe(64); // 32 + 32
      expect(thirdPartyCapId.id.slice(0, 32)).toEqual(vatId.id);
      expect(thirdPartyCapId.id.slice(32)).toEqual(provisionId.id);
    });
  });

  describe('Level3Handlers', () => {
    let transport: MockTransport;
    let connection: RpcConnection;
    let connectionManager: ConnectionManager;
    let level3Handlers: Level3Handlers;
    let selfVatId: VatId;

    beforeEach(() => {
      transport = new MockTransport();
      connection = new RpcConnection(transport);
      selfVatId = generateVatId();
      connectionManager = new ConnectionManager({
        selfVatId,
        connectionFactory: async () => transport as unknown as RpcTransport,
        autoConnect: false,
      });
      level3Handlers = new Level3Handlers({
        connection,
        connectionManager,
        selfVatId,
      });
    });

    it('should handle Provide message', async () => {
      const recipientId = generateVatId();
      const provide: Provide = {
        questionId: 1,
        target: { type: 'importedCap', importId: 42 },
        recipient: { id: recipientId.id },
      };

      await level3Handlers.handleProvide(provide);

      // Should have created a pending provision
      const provisions = connectionManager.findProvisionsForRecipient(recipientId);
      expect(provisions.length).toBe(1);
      expect(provisions[0].targetExportId).toBe(42);

      // Should have sent a return message
      expect(transport.sentMessages.length).toBeGreaterThan(0);
      const returnMsg = transport.sentMessages.find((m) => m.type === 'return');
      expect(returnMsg).toBeDefined();
    });

    it('should reject Provide with promisedAnswer target', async () => {
      const provide: Provide = {
        questionId: 1,
        target: {
          type: 'promisedAnswer',
          promisedAnswer: { questionId: 5, transform: [] },
        },
        recipient: { id: generateVatId().id },
      };

      await level3Handlers.handleProvide(provide);

      // Should have sent an exception return
      const returnMsg = transport.sentMessages.find((m) => m.type === 'return');
      expect(returnMsg).toBeDefined();
      if (returnMsg?.type === 'return') {
        expect(returnMsg.return.result.type).toBe('exception');
      }
    });

    it('should handle Accept message for valid provision', async () => {
      const recipientId = generateVatId();
      const provisionId = generateProvisionId();

      // Create a pending provision first
      connectionManager.createPendingProvision(provisionId, recipientId, 42, 1, false);

      const accept: Accept = {
        questionId: 2,
        provision: provisionId,
        embargo: false,
      };

      await level3Handlers.handleAccept(accept);

      // Should have removed the pending provision
      expect(connectionManager.getPendingProvision(provisionId)).toBeUndefined();

      // Should have sent a return with the capability
      const returnMsg = transport.sentMessages.find((m) => m.type === 'return');
      expect(returnMsg).toBeDefined();
    });

    it('should handle Accept message for invalid provision', async () => {
      const accept: Accept = {
        questionId: 2,
        provision: generateProvisionId(), // Non-existent provision
        embargo: false,
      };

      await level3Handlers.handleAccept(accept);

      // Should have sent an exception return
      const returnMsg = transport.sentMessages.find((m) => m.type === 'return');
      expect(returnMsg).toBeDefined();
      if (returnMsg?.type === 'return') {
        expect(returnMsg.return.result.type).toBe('exception');
      }
    });

    it('should handle embargoed Accept', async () => {
      const recipientId = generateVatId();
      const provisionId = generateProvisionId();

      connectionManager.createPendingProvision(provisionId, recipientId, 42, 1, false);

      const accept: Accept = {
        questionId: 2,
        provision: provisionId,
        embargo: true, // Request embargo
      };

      await level3Handlers.handleAccept(accept);

      // Should have sent resultsSentElsewhere to indicate embargo
      const returnMsg = transport.sentMessages.find((m) => m.type === 'return');
      expect(returnMsg).toBeDefined();
      if (returnMsg?.type === 'return') {
        expect(returnMsg.return.result.type).toBe('resultsSentElsewhere');
      }
    });

    it('should handle Disembargo with senderLoopback', async () => {
      const disembargo = {
        target: { type: 'importedCap' as const, importId: 1 },
        context: { type: 'senderLoopback' as const, embargoId: 123 },
      };

      await level3Handlers.handleDisembargo(disembargo);

      // Should have echoed back as receiverLoopback
      const disembargoMsg = transport.sentMessages.find((m) => m.type === 'disembargo');
      expect(disembargoMsg).toBeDefined();
      if (disembargoMsg?.type === 'disembargo') {
        expect(disembargoMsg.disembargo.context.type).toBe('receiverLoopback');
        if (disembargoMsg.disembargo.context.type === 'receiverLoopback') {
          expect(disembargoMsg.disembargo.context.embargoId).toBe(123);
        }
      }
    });
  });

  describe('Three-way Introduction Scenario', () => {
    it('should simulate Alice introducing Bob to Carol', async () => {
      // This test simulates the classic three-way introduction scenario:
      // 1. Alice has connections to both Bob and Carol
      // 2. Alice holds a capability to Carol's service
      // 3. Alice wants to introduce Bob to Carol
      // 4. Bob should be able to call Carol directly (not through Alice)

      const aliceVatId = generateVatId();
      const bobVatId = generateVatId();
      const carolVatId = generateVatId();

      // Create transports for each vat
      const aliceToCarolTransport = new MockTransport();
      const aliceToBobTransport = new MockTransport();
      const _bobToCarolTransport = new MockTransport();

      // Create connection manager for Alice
      const aliceConnectionManager = new ConnectionManager({
        selfVatId: aliceVatId,
        connectionFactory: async (vatId) => {
          if (vatIdEquals(vatId, carolVatId)) {
            return aliceToCarolTransport as unknown as RpcTransport;
          }
          if (vatIdEquals(vatId, bobVatId)) {
            return aliceToBobTransport as unknown as RpcTransport;
          }
          throw new Error('Unknown vat');
        },
        autoConnect: false,
      });

      // Create connections
      const aliceToCarolConnection = new RpcConnection(aliceToCarolTransport, {
        selfVatId: aliceVatId,
        connectionManager: aliceConnectionManager,
      });

      const aliceToBobConnection = new RpcConnection(aliceToBobTransport, {
        selfVatId: aliceVatId,
        connectionManager: aliceConnectionManager,
      });

      // Register connections
      aliceConnectionManager.registerConnection(carolVatId, aliceToCarolConnection);
      aliceConnectionManager.registerConnection(bobVatId, aliceToBobConnection);

      // Verify connections are registered
      expect(aliceConnectionManager.getConnectionCount()).toBe(2);
      expect(aliceConnectionManager.hasConnection(carolVatId)).toBe(true);
      expect(aliceConnectionManager.hasConnection(bobVatId)).toBe(true);

      // In a full implementation, Alice would:
      // 1. Send Provide to Carol, identifying Bob as recipient
      // 2. Send the ThirdPartyCapId to Bob
      // 3. Bob would connect to Carol and send Accept
      // 4. Bob could then call Carol directly

      // For this test, we verify the infrastructure is in place
      expect(aliceConnectionManager).toBeDefined();
      expect(aliceToCarolConnection).toBeDefined();
      expect(aliceToBobConnection).toBeDefined();
    });

    // Helper function to compare vat IDs
    const vatIdEquals = (a: VatId, b: VatId): boolean => {
      if (a.id.length !== b.id.length) return false;
      for (let i = 0; i < a.id.length; i++) {
        if (a.id[i] !== b.id[i]) return false;
      }
      return true;
    };
  });

  describe('Cycle Breaking with Embargo', () => {
    it('should handle simultaneous introductions with embargo', async () => {
      // Scenario: Alice introduces Bob to Carol AND Carol to Bob simultaneously
      // Both introductions use embargo=true to prevent deadlock

      const transport = new MockTransport();
      const connection = new RpcConnection(transport);
      const selfVatId = generateVatId();
      const connectionManager = new ConnectionManager({
        selfVatId,
        connectionFactory: async () => transport as unknown as RpcTransport,
        autoConnect: false,
      });

      const level3Handlers = new Level3Handlers({
        connection,
        connectionManager,
        selfVatId,
      });

      // Create two provisions (simulating the cycle)
      const provision1 = generateProvisionId();
      const provision2 = generateProvisionId();
      const bobId = generateVatId();
      const carolId = generateVatId();

      connectionManager.createPendingProvision(provision1, bobId, 1, 1, true); // embargoed
      connectionManager.createPendingProvision(provision2, carolId, 2, 2, true); // embargoed

      // Accept both with embargo
      const accept1: Accept = {
        questionId: 10,
        provision: provision1,
        embargo: true,
      };

      const accept2: Accept = {
        questionId: 11,
        provision: provision2,
        embargo: true,
      };

      await level3Handlers.handleAccept(accept1);
      await level3Handlers.handleAccept(accept2);

      // Both should return resultsSentElsewhere due to embargo
      const returnMessages = transport.sentMessages.filter((m) => m.type === 'return');
      expect(returnMessages.length).toBe(2);

      for (const msg of returnMessages) {
        if (msg.type === 'return') {
          expect(msg.return.result.type).toBe('resultsSentElsewhere');
        }
      }

      // The embargoes would be lifted when the connections are established
      // and Disembargo messages are exchanged
    });
  });
});
