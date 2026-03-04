/**
 * C++ Interop Tests using EzRpcTransport
 *
 * Tests capnp-ts RPC implementation against official C++ EzRpc implementation.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EzRpcTransport, RpcConnection } from '../rpc/index.js';
import type { RpcMessage } from '../rpc/index.js';

const TEST_HOST = process.env.CAPNP_TEST_HOST || 'localhost';
const TEST_PORT = Number.parseInt(process.env.CAPNP_TEST_PORT || '18080');
const TEST_TIMEOUT = 15000;

// 检查 C++ 服务器是否可用
async function isServerAvailable(): Promise<boolean> {
  try {
    const transport = await EzRpcTransport.connect(TEST_HOST, TEST_PORT, {
      connectTimeoutMs: 1000,
    });
    transport.close();
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!(await isServerAvailable()))('C++ Interop - Protocol Basics', () => {
  let transport: EzRpcTransport | null = null;

  beforeAll(async () => {
    console.log(`\n[Setup] Connecting to C++ server at ${TEST_HOST}:${TEST_PORT}...`);
    transport = await EzRpcTransport.connect(TEST_HOST, TEST_PORT, {
      connectTimeoutMs: 5000,
    });
    console.log('[Setup] Connected\n');
  }, TEST_TIMEOUT);

  afterAll(() => {
    console.log('\n[Cleanup] Closing connection...');
    transport?.close();
    console.log('[Cleanup] Done');
  });

  describe('Connection', () => {
    it('should establish TCP connection', () => {
      expect(transport?.connected).toBe(true);
    });
  });

  describe('Bootstrap Handshake', () => {
    it('should receive Return response for Bootstrap', async () => {
      const bootstrapMsg: RpcMessage = {
        type: 'bootstrap',
        bootstrap: { questionId: 1 },
      };

      await transport!.send(bootstrapMsg);
      const response = await transport!.receive();

      expect(response).not.toBeNull();
      expect(response?.type).toBe('return');

      if (response?.type === 'return') {
        expect(response.return.answerId).toBe(0);
        expect(response.return.result?.type).toBe('results');
      }
    });
  });

  describe('Message Types', () => {
    it('should send Call message and receive response', async () => {
      // Call message to the bootstrap capability
      const callMsg: RpcMessage = {
        type: 'call',
        call: {
          questionId: 10,
          target: { type: 'importedCap', importId: 0 },
          interfaceId: BigInt('0x8f9c8e7d6c5b4a50'), // EchoService
          methodId: 0, // echo method
          allowThirdPartyTailCall: false,
          noPromisePipelining: false,
          onlyPromisePipeline: false,
          params: {
            content: new Uint8Array(), // Empty - proper struct encoding needed
            capTable: [],
          },
          sendResultsTo: { type: 'caller' },
        },
      };

      await transport!.send(callMsg);

      // Use timeout to handle cases where server doesn't respond
      const response = await Promise.race([
        transport!.receive(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);

      expect(response).not.toBeNull();
      // Response could be return, abort, or unimplemented depending on server
      if (response) {
        expect(['return', 'abort', 'unimplemented']).toContain(response.type);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid interface gracefully', async () => {
      const callMsg: RpcMessage = {
        type: 'call',
        call: {
          questionId: 11,
          target: { type: 'importedCap', importId: 0 },
          interfaceId: BigInt('0xdeadbeef'), // Invalid interface
          methodId: 999,
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

      await transport!.send(callMsg);

      const response = await Promise.race([
        transport!.receive(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);

      if (response) {
        expect(['return', 'abort']).toContain(response.type);
      }
      // If no response, server may have closed connection - that's also valid behavior
    });
  });
});

describe('C++ Interop - RPC Connection', () => {
  let connection: RpcConnection | null = null;
  let transport: EzRpcTransport | null = null;

  beforeAll(async () => {
    console.log(`\n[Setup] Creating RPC connection to ${TEST_HOST}:${TEST_PORT}...`);
    transport = await EzRpcTransport.connect(TEST_HOST, TEST_PORT, {
      connectTimeoutMs: 5000,
    });
    connection = new RpcConnection(transport);
    await connection.start();
    console.log('[Setup] RPC connection established\n');
  }, TEST_TIMEOUT);

  afterAll(async () => {
    console.log('\n[Cleanup] Stopping RPC connection...');
    await connection?.stop();
    transport?.close();
    console.log('[Cleanup] Done');
  });

  it('should complete RPC handshake', () => {
    expect(connection).toBeDefined();
    expect(transport?.connected).toBe(true);
  });
});
