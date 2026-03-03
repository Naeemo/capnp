/**
 * C++ Interop Tests - Simplified
 *
 * Tests capnp-ts RPC implementation against official C++ implementation.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TcpTransport } from '../rpc/index.js';
import { serializeRpcMessage, deserializeRpcMessage } from '../rpc/message-serializer.js';
import type { RpcMessage } from '../rpc/index.js';

// Test configuration
const TEST_SERVER_HOST = process.env.CAPNP_TEST_HOST || 'localhost';
const TEST_SERVER_PORT = Number.parseInt(process.env.CAPNP_TEST_PORT || '18080');
const TEST_TIMEOUT = 10000;

describe('C++ Interop - TCP Transport', () => {
  let transport: TcpTransport | null = null;

  beforeAll(async () => {
    console.log(`\nConnecting to C++ server at ${TEST_SERVER_HOST}:${TEST_SERVER_PORT}...`);
    transport = await TcpTransport.connect(TEST_SERVER_HOST, TEST_SERVER_PORT, {
      connectTimeoutMs: 5000,
    });
    console.log('TCP connected\n');
  }, TEST_TIMEOUT);

  afterAll(async () => {
    console.log('\nCleaning up...');
    if (transport) {
      transport.close();
    }
    console.log('Done');
  });

  it('should establish TCP connection', () => {
    expect(transport?.connected).toBe(true);
  });

  it('should send and receive Bootstrap message', async () => {
    const bootstrapMsg: RpcMessage = {
      type: 'bootstrap',
      bootstrap: {
        questionId: 1,
      },
    };

    console.log('Sending Bootstrap message...');
    await transport!.send(bootstrapMsg);

    console.log('Waiting for response...');
    const response = await Promise.race([
      transport!.receive(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Response timeout')), 5000)
      ),
    ]);

    console.log('Response received:', response);
    expect(response).toBeDefined();
    expect(response).not.toBeNull();
  });
});

// Skip complex tests for now - need to debug message format
describe.skip('C++ Interop - Message Exchange', () => {
  it('should send and receive Call message', async () => {
    // TODO: Implement after Bootstrap works
  });
});
