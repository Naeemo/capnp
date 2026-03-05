/**
 * TCP Transport Compression Integration Tests
 *
 * Tests LZ4 compression in TcpTransport:
 * - Both ends support LZ4 -> compressed transmission
 * - One end doesn't support -> raw transmission
 * - Small messages (< threshold) -> no compression
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as net from 'node:net';
import { TcpTransport } from './tcp-transport.js';
import type { RpcMessage } from './rpc-types.js';

// Test server helper
function createTestServer(port: number, supportsLz4: boolean): Promise<net.Server> {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      const transport = TcpTransport.fromSocket(socket, {
        compression: {
          enabled: supportsLz4,
          algorithm: 'lz4',
          thresholdBytes: 256,
        },
      });

      // Echo server - send back what we received
      transport.onError = (err) => {
        console.log('Server error:', err.message);
      };

      const handleMessages = async () => {
        while (true) {
          const msg = await transport.receive();
          if (!msg) break;

          // Echo the message back
          await transport.send(msg);
        }
      };

      handleMessages();
    });

    server.listen(port, () => {
      resolve(server);
    });
  });
}

describe('TcpTransport Compression Integration', () => {
  const TEST_PORT = 19999;

  describe('Both ends support LZ4', () => {
    let server: net.Server;

    beforeAll(async () => {
      server = await createTestServer(TEST_PORT, true);
      return () => {
        server.close();
      };
    });

    it('should enable compression when both ends support LZ4', async () => {
      const client = await TcpTransport.connect('localhost', TEST_PORT, {
        compression: {
          enabled: true,
          algorithm: 'lz4',
          thresholdBytes: 256,
        },
      });

      // Wait for capability negotiation
      await new Promise((resolve) => setTimeout(resolve, 100));

      const state = client.getCompressionState();
      expect(state.enabled).toBe(true);
      expect(state.algorithm).toBe('lz4');

      client.close();
    });

    it('should compress messages larger than threshold', async () => {
      const client = await TcpTransport.connect('localhost', TEST_PORT, {
        compression: {
          enabled: true,
          algorithm: 'lz4',
          thresholdBytes: 256,
        },
      });

      // Wait for capability negotiation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Create a large message (larger than 256 bytes threshold)
      const largeContent = new Uint8Array(1000).fill(0x42);
      const message: RpcMessage = {
        type: 'bootstrap',
        bootstrap: { questionId: 1 },
      };

      // Send the message
      await client.send(message);

      // Receive echoed message
      const received = await client.receive();
      expect(received).not.toBeNull();
      expect(received!.type).toBe('bootstrap');

      // Check compression stats
      const state = client.getCompressionState();
      expect(state.messagesCompressed).toBeGreaterThan(0);
      expect(state.uncompressedBytesSent).toBeGreaterThan(0);

      client.close();
    });

    it('should achieve actual compression ratio', async () => {
      const client = await TcpTransport.connect('localhost', TEST_PORT, {
        compression: {
          enabled: true,
          algorithm: 'lz4',
          thresholdBytes: 256,
        },
      });

      // Wait for capability negotiation
      await new Promise((resolve) => setTimeout(resolve, 100));

      const initialState = client.getCompressionState();

      // Send multiple large messages with repetitive data (highly compressible)
      const largeContent = new Uint8Array(5000).fill(0x42);
      
      for (let i = 0; i < 5; i++) {
        const message: RpcMessage = {
          type: 'call',
          call: {
            questionId: i,
            interfaceId: BigInt(1),
            methodId: 1,
            allowThirdPartyTailCall: false,
            noPromisePipelining: false,
            onlyPromisePipeline: false,
            target: { type: 'importedCap', importId: 1 },
            params: {
              content: largeContent,
              capTable: [],
            },
            sendResultsTo: { type: 'caller' },
          },
        };
        await client.send(message);
        await client.receive(); // Receive echo
      }

      const finalState = client.getCompressionState();
      const compressedBytes = finalState.bytesSent - initialState.bytesSent;
      const uncompressedBytes = finalState.uncompressedBytesSent - initialState.uncompressedBytesSent;

      // With highly compressible data, compressed size should be much smaller
      expect(compressedBytes).toBeLessThan(uncompressedBytes * 0.5);

      client.close();
    });
  });

  describe('One end does not support compression', () => {
    let server: net.Server;

    beforeAll(async () => {
      // Server does not support LZ4
      server = await createTestServer(TEST_PORT + 1, false);
      return () => {
        server.close();
      };
    });

    it('should disable compression when server does not support LZ4', async () => {
      const client = await TcpTransport.connect('localhost', TEST_PORT + 1, {
        compression: {
          enabled: true,
          algorithm: 'lz4',
          thresholdBytes: 256,
        },
      });

      // Wait for capability negotiation
      await new Promise((resolve) => setTimeout(resolve, 100));

      const state = client.getCompressionState();
      expect(state.enabled).toBe(false);
      expect(state.algorithm).toBe('none');

      client.close();
    });

    it('should transmit raw data when compression disabled', async () => {
      const client = await TcpTransport.connect('localhost', TEST_PORT + 1, {
        compression: {
          enabled: true,
          algorithm: 'lz4',
          thresholdBytes: 256,
        },
      });

      // Wait for capability negotiation
      await new Promise((resolve) => setTimeout(resolve, 100));

      const initialState = client.getCompressionState();

      // Send a large message
      const largeContent = new Uint8Array(1000).fill(0x42);
      const message: RpcMessage = {
        type: 'bootstrap',
        bootstrap: { questionId: 1 },
      };

      await client.send(message);
      const received = await client.receive();
      expect(received).not.toBeNull();

      const finalState = client.getCompressionState();
      
      // With compression disabled, bytes sent should equal uncompressed bytes
      expect(finalState.bytesSent).toBe(finalState.uncompressedBytesSent);
      expect(finalState.messagesCompressed).toBe(0);

      client.close();
    });
  });

  describe('Small messages below threshold', () => {
    let server: net.Server;

    beforeAll(async () => {
      server = await createTestServer(TEST_PORT + 2, true);
      return () => {
        server.close();
      };
    });

    it('should not compress messages smaller than threshold', async () => {
      const client = await TcpTransport.connect('localhost', TEST_PORT + 2, {
        compression: {
          enabled: true,
          algorithm: 'lz4',
          thresholdBytes: 256,
        },
      });

      // Wait for capability negotiation
      await new Promise((resolve) => setTimeout(resolve, 100));

      const initialState = client.getCompressionState();

      // Send small messages (below 256 byte threshold)
      for (let i = 0; i < 5; i++) {
        const message: RpcMessage = {
          type: 'bootstrap',
          bootstrap: { questionId: i },
        };
        await client.send(message);
        await client.receive();
      }

      const finalState = client.getCompressionState();
      
      // Small messages should not be compressed
      expect(finalState.messagesCompressed).toBe(0);

      client.close();
    });
  });

  describe('Client disables compression', () => {
    let server: net.Server;

    beforeAll(async () => {
      server = await createTestServer(TEST_PORT + 3, true);
      return () => {
        server.close();
      };
    });

    it('should not use compression when client disables it', async () => {
      const client = await TcpTransport.connect('localhost', TEST_PORT + 3, {
        compression: {
          enabled: false, // Client disables compression
          algorithm: 'lz4',
          thresholdBytes: 256,
        },
      });

      // Wait for capability negotiation
      await new Promise((resolve) => setTimeout(resolve, 100));

      const state = client.getCompressionState();
      expect(state.enabled).toBe(false);

      client.close();
    });
  });

  describe('Compression statistics', () => {
    let server: net.Server;

    beforeAll(async () => {
      server = await createTestServer(TEST_PORT + 4, true);
      return () => {
        server.close();
      };
    });

    it('should track compression statistics correctly', async () => {
      const client = await TcpTransport.connect('localhost', TEST_PORT + 4, {
        compression: {
          enabled: true,
          algorithm: 'lz4',
          thresholdBytes: 256,
        },
      });

      // Wait for capability negotiation
      await new Promise((resolve) => setTimeout(resolve, 100));

      const initialState = client.getCompressionState();

      // Send mix of large (compressed) and small (not compressed) messages
      for (let i = 0; i < 3; i++) {
        // Large message - should be compressed
        const largeMessage: RpcMessage = {
          type: 'call',
          call: {
            questionId: i * 2,
            interfaceId: BigInt(1),
            methodId: 1,
            allowThirdPartyTailCall: false,
            noPromisePipelining: false,
            onlyPromisePipeline: false,
            target: { type: 'importedCap', importId: 1 },
            params: {
              content: new Uint8Array(1000).fill(0x42),
              capTable: [],
            },
            sendResultsTo: { type: 'caller' },
          },
        };
        await client.send(largeMessage);
        await client.receive();
      }

      const finalState = client.getCompressionState();

      // Verify stats
      expect(finalState.messagesCompressed).toBeGreaterThan(0);
      expect(finalState.bytesSent).toBeGreaterThan(0);
      expect(finalState.uncompressedBytesSent).toBeGreaterThan(finalState.bytesSent);

      client.close();
    });
  });
});
