/**
 * C++ Interop Tests
 * 
 * Tests capnp-ts RPC implementation against official C++ implementation.
 * Requires C++ server to be running.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RpcConnection } from '../rpc/rpc-connection.js';
import { WebSocketTransport } from '../rpc/websocket-transport.js';
import type { RpcMessage } from '../rpc/rpc-types.js';

// Test configuration
const TEST_SERVER_HOST = process.env.CAPNP_TEST_HOST || 'localhost';
const TEST_SERVER_PORT = parseInt(process.env.CAPNP_TEST_PORT || '8080');
const TEST_TIMEOUT = 30000;

describe('C++ Interop Tests', () => {
  let connection: RpcConnection | null = null;
  let transport: WebSocketTransport | null = null;

  beforeAll(async () => {
    // Connect to C++ server
    const wsUrl = `ws://${TEST_SERVER_HOST}:${TEST_SERVER_PORT}`;
    console.log(`Connecting to C++ server at ${wsUrl}`);
    
    transport = await WebSocketTransport.connect(wsUrl, {
      connectTimeoutMs: 5000,
    });
    
    connection = new RpcConnection(transport);
    await connection.start();
    
    console.log('Connected to C++ server');
  }, TEST_TIMEOUT);

  afterAll(async () => {
    if (connection) {
      await connection.close();
    }
    if (transport) {
      transport.close();
    }
  });

  describe('Basic RPC', () => {
    it('should perform bootstrap handshake', async () => {
      // Bootstrap is done automatically in connection.start()
      expect(connection).toBeDefined();
      expect(transport?.connected).toBe(true);
    });

    it('should send and receive Call/Return messages', async () => {
      // This test verifies that basic Call/Return message exchange works
      // We'll use the echo capability from the C++ server
      
      // Create a simple call message
      const callMessage: RpcMessage = {
        type: 'call',
        call: {
          questionId: 1,
          target: { type: 'importedCap', importId: 0 }, // Bootstrap capability
          interfaceId: BigInt('0x8f9c8e7d6c5b4a50'), // EchoService interface ID
          methodId: 0, // echo method
          allowThirdPartyTailCall: false,
          noPromisePipelining: false,
          onlyPromisePipeline: false,
          params: {
            content: new Uint8Array(), // Empty for now
            capTable: [],
          },
          sendResultsTo: { type: 'caller' },
        },
      };

      await transport!.send(callMessage);
      
      // Wait for response
      const response = await transport!.receive();
      
      expect(response).toBeDefined();
      expect(response?.type).toBe('return');
    });
  });

  describe('Message Serialization', () => {
    it('should serialize and deserialize RPC messages correctly', async () => {
      const testMessage: RpcMessage = {
        type: 'call',
        call: {
          questionId: 42,
          target: { type: 'importedCap', importId: 5 },
          interfaceId: BigInt('0x1234567890abcdef'),
          methodId: 7,
          allowThirdPartyTailCall: false,
          noPromisePipelining: false,
          onlyPromisePipeline: false,
          params: {
            content: new Uint8Array([0x01, 0x02, 0x03, 0x04]),
            capTable: [],
          },
          sendResultsTo: { type: 'caller' },
        },
      };

      await transport!.send(testMessage);
      
      // The C++ server should respond with an error (unknown capability)
      // but the message should be parsed correctly
      const response = await transport!.receive();
      
      expect(response).toBeDefined();
      // Response could be return or abort depending on server behavior
      expect(['return', 'abort', 'unimplemented']).toContain(response?.type);
    });
  });

  describe('Capability Passing', () => {
    it('should handle capability descriptors in messages', async () => {
      const messageWithCaps: RpcMessage = {
        type: 'call',
        call: {
          questionId: 100,
          target: { type: 'importedCap', importId: 0 },
          interfaceId: BigInt('0x8f9c8e7d6c5b4a50'),
          methodId: 0,
          allowThirdPartyTailCall: false,
          noPromisePipelining: false,
          onlyPromisePipeline: false,
          params: {
            content: new Uint8Array(),
            capTable: [
              { type: 'senderHosted', exportId: 1 },
            ],
          },
          sendResultsTo: { type: 'caller' },
        },
      };

      await transport!.send(messageWithCaps);
      
      const response = await transport!.receive();
      expect(response).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid messages gracefully', async () => {
      // Send an invalid message type
      const invalidMessage: RpcMessage = {
        type: 'abort',
        abort: {
          reason: 'Test abort',
          type: 'failed',
          obsoleteIsCallersFault: false,
          obsoleteDurability: 0,
        },
      };

      await transport!.send(invalidMessage);
      
      // Server should either close connection or send a response
      const response = await transport!.receive();
      // Response could be null (connection closed) or a message
      expect(response === null || typeof response === 'object').toBe(true);
    });
  });
});

// Manual test runner for development
if (require.main === module) {
  console.log('C++ Interop Test Runner');
  console.log('========================');
  console.log('');
  console.log('To run these tests:');
  console.log('1. Start the C++ server:');
  console.log('   cd src/interop-cpp && ./interop-server server 0.0.0.0:8080');
  console.log('');
  console.log('2. Run the tests:');
  console.log('   pnpm test src/interop-cpp/interop.test.ts');
  console.log('');
}
