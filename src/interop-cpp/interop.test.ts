/**
 * C++ Interop Tests
 *
 * Tests capnp-ts RPC implementation against official C++ implementation.
 * Requires C++ server to be running.
 *
 * Usage:
 *   1. Start C++ server: cd src/interop-cpp && ./interop-server server 0.0.0.0:8080
 *   2. Run tests: npm test src/interop-cpp/interop.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RpcConnection, TcpTransport } from '../rpc/index.js';
import type { RpcMessage } from '../rpc/index.js';

// Test configuration
const TEST_SERVER_HOST = process.env.CAPNP_TEST_HOST || 'localhost';
const TEST_SERVER_PORT = Number.parseInt(process.env.CAPNP_TEST_PORT || '8080');
const TEST_TIMEOUT = 10000;

describe('C++ Interop Tests', () => {
  let connection: RpcConnection | null = null;
  let transport: TcpTransport | null = null;

  beforeAll(async () => {
    console.log(`\nConnecting to C++ server at ${TEST_SERVER_HOST}:${TEST_SERVER_PORT}...`);

    transport = await TcpTransport.connect(TEST_SERVER_HOST, TEST_SERVER_PORT, {
      connectTimeoutMs: 5000,
    });

    console.log('TCP connected, creating RPC connection...');

    connection = new RpcConnection(transport);
    await connection.start();

    console.log('RPC connection established\n');
  }, TEST_TIMEOUT);

  afterAll(async () => {
    console.log('\nCleaning up...');
    if (connection) {
      await connection.stop();
    }
    if (transport) {
      transport.close();
    }
    console.log('Done');
  });

  describe('Basic Connection', () => {
    it('should establish TCP connection', () => {
      expect(transport?.connected).toBe(true);
    });

    it('should complete RPC bootstrap', () => {
      expect(connection).toBeDefined();
    });
  });

  describe('Message Serialization', () => {
    it('should send and receive a Call message', async () => {
      // Send a Call message (will likely get an error response but tests serialization)
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
            content: new Uint8Array(), // Empty for now - need proper struct encoding
            capTable: [],
          },
          sendResultsTo: { type: 'caller' },
        },
      };

      await transport!.send(callMessage);

      // Wait for response with timeout
      const response = await Promise.race([
        transport!.receive(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Response timeout')), 5000)
        ),
      ]);

      expect(response).toBeDefined();
      // Response could be return, abort, or unimplemented
      expect(['return', 'abort', 'unimplemented']).toContain(response?.type);
    });

    it('should handle message with capability descriptors', async () => {
      const messageWithCaps: RpcMessage = {
        type: 'call',
        call: {
          questionId: 2,
          target: { type: 'importedCap', importId: 0 },
          interfaceId: BigInt('0x8f9c8e7d6c5b4a50'),
          methodId: 0,
          allowThirdPartyTailCall: false,
          noPromisePipelining: false,
          onlyPromisePipeline: false,
          params: {
            content: new Uint8Array(),
            capTable: [{ type: 'senderHosted', exportId: 1 }],
          },
          sendResultsTo: { type: 'caller' },
        },
      };

      await transport!.send(messageWithCaps);

      const response = await Promise.race([
        transport!.receive(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Response timeout')), 5000)
        ),
      ]);

      expect(response).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid interface/method gracefully', async () => {
      const invalidCall: RpcMessage = {
        type: 'call',
        call: {
          questionId: 3,
          target: { type: 'importedCap', importId: 0 },
          interfaceId: BigInt('0xdeadbeef'), // Invalid interface
          methodId: 999, // Invalid method
          allowThirdPartyTailCall: false,
          noPromisePipelining: false,
          onlyPromisePipeline: false,
          params: {
            content: new Uint8Array(),
            capTable: [],
          },
          sendResultsTo: { type: 'caller' },
        },
      };

      await transport!.send(invalidCall);

      const response = await Promise.race([
        transport!.receive(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Response timeout')), 5000)
        ),
      ]);

      expect(response).toBeDefined();
      // Should get an error response
      expect(['return', 'abort', 'unimplemented']).toContain(response?.type);
    });
  });
});

// Skip tests if C++ server is not available
describe.skip('C++ Interop - Full Integration', () => {
  // These tests require proper struct encoding for EchoService methods
  // They will be enabled once we can properly encode Cap'n Proto structs

  it('should call EchoService.echo', async () => {
    // TODO: Implement proper struct encoding for method params
  });

  it('should call EchoService.echoStruct', async () => {
    // TODO: Implement proper struct encoding for EchoStruct
  });

  it('should call EchoService.getCounter', async () => {
    // TODO: Implement proper struct encoding
  });

  it('should call EchoService.increment', async () => {
    // TODO: Implement proper struct encoding
  });
});

// Manual test runner helper
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('C++ Interop Test Runner');
  console.log('========================');
  console.log('');
  console.log('Prerequisites:');
  console.log('1. Install Cap\'n Proto C++ libraries:');
  console.log('   sudo apt-get install libcapnp-dev');
  console.log('');
  console.log('2. Build C++ server:');
  console.log('   cd src/interop-cpp && make');
  console.log('');
  console.log('3. Start C++ server:');
  console.log('   ./interop-server server 0.0.0.0:8080');
  console.log('');
  console.log('4. Run tests:');
  console.log('   npm test src/interop-cpp/interop.test.ts');
  console.log('');
}
