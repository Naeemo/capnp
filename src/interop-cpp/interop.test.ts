/**
 * C++ Interop Tests using EzRpcTransport
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EzRpcTransport } from '../rpc/index.js';
import type { RpcMessage } from '../rpc/index.js';

const TEST_HOST = process.env.CAPNP_TEST_HOST || 'localhost';
const TEST_PORT = Number.parseInt(process.env.CAPNP_TEST_PORT || '18080');
const TEST_TIMEOUT = 10000;

describe('C++ Interop - EzRpc Transport', () => {
  let transport: EzRpcTransport | null = null;

  beforeAll(async () => {
    console.log(`\nConnecting to C++ server at ${TEST_HOST}:${TEST_PORT}...`);
    transport = await EzRpcTransport.connect(TEST_HOST, TEST_PORT, {
      connectTimeoutMs: 5000,
    });
    console.log('Connected\n');
  }, TEST_TIMEOUT);

  afterAll(() => {
    console.log('\nCleaning up...');
    transport?.close();
    console.log('Done');
  });

  it('should establish TCP connection', () => {
    expect(transport?.connected).toBe(true);
  });

  it('should send and receive Bootstrap message', async () => {
    const bootstrapMsg: RpcMessage = {
      type: 'bootstrap',
      bootstrap: { questionId: 1 },
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
