/**
 * Tests for WebSocket-to-TCP Proxy
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CapnpWebSocketProxy } from '../proxy/websocket-proxy.js';
import { WebSocket } from 'ws';
import { createServer, Server, Socket } from 'net';

describe('CapnpWebSocketProxy', () => {
  let proxy: CapnpWebSocketProxy;
  let mockTcpServer: Server;
  const WS_PORT = 19090; // Fixed port for testing
  let tcpPort: number;

  beforeAll(async () => {
    // Create a mock TCP server (simulates C++ Cap'n Proto service)
    mockTcpServer = createServer();
    
    await new Promise<void>((resolve) => {
      mockTcpServer.listen(0, '127.0.0.1', () => {
        const addr = mockTcpServer.address() as { port: number };
        tcpPort = addr.port;
        resolve();
      });
    });

    // Start proxy with fixed port
    proxy = new CapnpWebSocketProxy({
      wsPort: WS_PORT,
      targetHost: '127.0.0.1',
      targetPort: tcpPort,
      debug: false,
    });

    // Wait for proxy to start
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
  });

  afterAll(async () => {
    await proxy.close();
    mockTcpServer.close();
  });

  it('should start proxy server', () => {
    expect(proxy.getConnectionCount()).toBe(0);
  });

  it('should forward messages from WebSocket to TCP', async () => {
    const testData = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    let receivedData: Buffer | null = null;

    mockTcpServer.once('connection', (socket: Socket) => {
      socket.on('data', (data) => {
        receivedData = data;
      });
    });

    // Connect WebSocket client
    const ws = new WebSocket(`ws://127.0.0.1:${WS_PORT}`);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', (err) => reject(new Error(`WebSocket error: ${err.message}`)));
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    // Send data
    ws.send(testData);

    // Wait for data to be forwarded
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    expect(receivedData).toEqual(testData);

    ws.close();
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  });

  it('should forward messages from TCP to WebSocket', async () => {
    const testData = Buffer.from([0x05, 0x06, 0x07, 0x08]);
    let receivedData: Buffer | null = null;

    mockTcpServer.once('connection', (socket: Socket) => {
      // Send data from TCP server to proxy
      setTimeout(() => {
        socket.write(testData);
      }, 50);
    });

    // Connect WebSocket client
    const ws = new WebSocket(`ws://127.0.0.1:${WS_PORT}`);
    
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', (err) => reject(new Error(`WebSocket error: ${err.message}`)));
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    // Wait for data
    receivedData = await new Promise<Buffer>((resolve) => {
      ws.on('message', (data) => {
        resolve(Buffer.isBuffer(data) ? data : Buffer.from(data));
      });
      setTimeout(() => resolve(Buffer.alloc(0)), 1000);
    });

    expect(receivedData).toEqual(testData);

    ws.close();
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  });

  it('should track connection stats', async () => {
    mockTcpServer.once('connection', (socket: Socket) => {
      socket.on('data', () => {
        // Echo back
        socket.write(Buffer.from([0x09]));
      });
    });

    const ws = new WebSocket(`ws://127.0.0.1:${WS_PORT}`);
    
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', (err) => reject(new Error(`WebSocket error: ${err.message}`)));
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    // Send some data
    ws.send(Buffer.from([0x01, 0x02]));
    
    await new Promise<void>((resolve) => setTimeout(resolve, 200));

    const stats = proxy.getAllStats();
    expect(stats.length).toBeGreaterThan(0);
    
    const firstStats = stats[0];
    expect(firstStats.wsMessagesIn).toBeGreaterThan(0);
    expect(firstStats.tcpBytesOut).toBeGreaterThan(0);

    ws.close();
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  });

  it('should handle large messages', async () => {
    const largeData = Buffer.alloc(1024 * 1024); // 1MB
    largeData.fill(0xAB);
    let receivedSize = 0;

    mockTcpServer.once('connection', (socket: Socket) => {
      socket.on('data', (data) => {
        receivedSize += data.length;
      });
    });

    const ws = new WebSocket(`ws://127.0.0.1:${WS_PORT}`);
    
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', (err) => reject(new Error(`WebSocket error: ${err.message}`)));
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    ws.send(largeData);

    // Wait for all data to be forwarded
    await new Promise<void>((resolve) => setTimeout(resolve, 500));

    expect(receivedSize).toBe(largeData.length);

    ws.close();
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  });

  it('should handle connection close gracefully', async () => {
    mockTcpServer.once('connection', () => {
      // Accept connection but do nothing
    });

    const ws = new WebSocket(`ws://127.0.0.1:${WS_PORT}`);
    
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', (err) => reject(new Error(`WebSocket error: ${err.message}`)));
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    expect(proxy.getConnectionCount()).toBeGreaterThan(0);

    // Close WebSocket
    ws.close();
    
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    expect(proxy.getConnectionCount()).toBe(0);
  });
});
