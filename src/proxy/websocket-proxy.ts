/**
 * WebSocket-to-TCP Proxy for Cap'n Proto
 * 
 * Allows browsers to connect to native Cap'n Proto services (C++, etc.)
 * via WebSocket. Handles the protocol bridging between WebSocket (browser)
 * and raw TCP (Cap'n Proto services).
 */

import { WebSocketServer, WebSocket } from 'ws';
import { Socket, createConnection } from 'net';
import { EventEmitter } from 'events';

export interface ProxyOptions {
  /** WebSocket server port */
  wsPort: number;
  /** Target TCP host */
  targetHost: string;
  /** Target TCP port */
  targetPort: number;
  /** Maximum message size in bytes (default: 16MB) */
  maxMessageSize?: number;
  /** Connection timeout in ms (default: 30000) */
  connectionTimeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

interface ConnectionStats {
  wsMessagesIn: number;
  wsMessagesOut: number;
  tcpBytesIn: number;
  tcpBytesOut: number;
  connectedAt: Date;
}

class ProxyConnection extends EventEmitter {
  private ws: WebSocket;
  private tcpSocket: Socket | null = null;
  private stats: ConnectionStats;
  private options: ProxyOptions;
  private closed = false;

  constructor(ws: WebSocket, options: ProxyOptions) {
    super();
    this.ws = ws;
    this.options = options;
    this.stats = {
      wsMessagesIn: 0,
      wsMessagesOut: 0,
      tcpBytesIn: 0,
      tcpBytesOut: 0,
      connectedAt: new Date(),
    };

    this.setupWebSocket();
  }

  private setupWebSocket(): void {
    this.ws.on('message', (data) => {
      this.handleWebSocketMessage(data);
    });

    this.ws.on('close', () => {
      this.log('WebSocket closed');
      this.close();
    });

    this.ws.on('error', (err) => {
      this.log('WebSocket error:', err);
      this.emit('error', err);
      this.close();
    });

    // Connect to target TCP service
    this.connectToTarget();
  }

  private connectToTarget(): void {
    const timeout = this.options.connectionTimeout ?? 30000;
    
    this.tcpSocket = createConnection({
      host: this.options.targetHost,
      port: this.options.targetPort,
      timeout,
    });

    this.tcpSocket.on('connect', () => {
      this.log('Connected to target TCP service');
      this.emit('connected');
    });

    this.tcpSocket.on('data', (data) => {
      this.handleTcpData(data);
    });

    this.tcpSocket.on('close', () => {
      this.log('TCP connection closed');
      this.close();
    });

    this.tcpSocket.on('error', (err) => {
      this.log('TCP error:', err);
      this.emit('error', err);
      this.close();
    });

    this.tcpSocket.on('timeout', () => {
      this.log('TCP connection timeout');
      this.close();
    });
  }

  private handleWebSocketMessage(data: WebSocket.RawData): void {
    if (this.closed) return;

    // Handle both single Buffer and Buffer[]
    const buffer = Buffer.isBuffer(data) 
      ? data 
      : Array.isArray(data) 
        ? Buffer.concat(data)
        : Buffer.from(data);
    
    const maxSize = this.options.maxMessageSize ?? 16 * 1024 * 1024;
    if (buffer.length > maxSize) {
      this.log(`Message too large: ${buffer.length} bytes`);
      this.close();
      return;
    }

    this.stats.wsMessagesIn++;
    this.stats.tcpBytesOut += buffer.length;

    // Forward to TCP service
    if (this.tcpSocket?.writable) {
      this.tcpSocket.write(buffer);
      this.log(`Forwarded ${buffer.length} bytes to TCP`);
    }
  }

  private handleTcpData(data: Buffer): void {
    if (this.closed) return;

    this.stats.tcpBytesIn += data.length;
    this.stats.wsMessagesOut++;

    // Forward to WebSocket client
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
      this.log(`Forwarded ${data.length} bytes to WebSocket`);
    }
  }

  private log(...args: unknown[]): void {
    if (this.options.debug) {
      console.log(`[ProxyConnection]`, ...args);
    }
  }

  getStats(): ConnectionStats {
    return { ...this.stats };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;

    this.ws.close();
    this.tcpSocket?.destroy();
    
    this.emit('closed');
  }
}

export class CapnpWebSocketProxy extends EventEmitter {
  private wss: WebSocketServer;
  private connections = new Map<WebSocket, ProxyConnection>();
  private options: ProxyOptions;

  constructor(options: ProxyOptions) {
    super();
    this.options = options;
    this.wss = new WebSocketServer({ port: options.wsPort });
    this.setupServer();
  }

  private setupServer(): void {
    this.wss.on('connection', (ws, req) => {
      const clientIp = req.socket.remoteAddress;
      this.log(`New WebSocket connection from ${clientIp}`);

      const connection = new ProxyConnection(ws, this.options);
      this.connections.set(ws, connection);

      connection.on('connected', () => {
        this.emit('connection', connection);
      });

      connection.on('error', (err) => {
        this.emit('error', err, connection);
      });

      connection.on('closed', () => {
        this.connections.delete(ws);
        this.emit('disconnection', connection);
      });
    });

    this.wss.on('error', (err) => {
      this.emit('error', err);
    });
  }

  private log(...args: unknown[]): void {
    if (this.options.debug) {
      console.log(`[CapnpWebSocketProxy]`, ...args);
    }
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  getAllStats(): ConnectionStats[] {
    return Array.from(this.connections.values()).map(c => c.getStats());
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      // Close all connections
      for (const connection of this.connections.values()) {
        connection.close();
      }
      this.connections.clear();

      // Close server
      this.wss.close(() => {
        this.emit('closed');
        resolve();
      });
    });
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  // Parse CLI arguments
  let wsPort = 8080;
  let targetHost = 'localhost';
  let targetPort = 8081;
  let debug = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--ws-port':
      case '-p':
        wsPort = parseInt(args[++i], 10);
        break;
      case '--target':
      case '-t':
        const [host, port] = args[++i].split(':');
        targetHost = host;
        targetPort = parseInt(port, 10);
        break;
      case '--debug':
      case '-d':
        debug = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Cap'n Proto WebSocket-to-TCP Proxy

Usage: npx @naeemo/capnp proxy [options]

Options:
  -p, --ws-port <port>     WebSocket server port (default: 8080)
  -t, --target <host:port> Target TCP service (default: localhost:8081)
  -d, --debug              Enable debug logging
  -h, --help               Show this help

Example:
  npx @naeemo/capnp proxy -p 9000 -t 192.168.1.100:7000
`);
        process.exit(0);
    }
  }

  const proxy = new CapnpWebSocketProxy({
    wsPort,
    targetHost,
    targetPort,
    debug,
  });

  console.log(`WebSocket-to-TCP Proxy started`);
  console.log(`  WebSocket: ws://localhost:${wsPort}`);
  console.log(`  Target:    ${targetHost}:${targetPort}`);

  proxy.on('connection', () => {
    console.log(`Active connections: ${proxy.getConnectionCount()}`);
  });

  proxy.on('disconnection', () => {
    console.log(`Active connections: ${proxy.getConnectionCount()}`);
  });

  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await proxy.close();
    process.exit(0);
  });
}
