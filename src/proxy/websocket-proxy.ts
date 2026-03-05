/**
 * WebSocket-to-TCP Proxy for Cap'n Proto
 *
 * Allows browsers to connect to native Cap'n Proto services (C++, etc.)
 * via WebSocket. Handles the protocol bridging between WebSocket (browser)
 * and raw TCP (Cap'n Proto services).
 * 
 * Features:
 * - Independent compression configuration for WebSocket and TCP sides
 * - Automatic compression/decompression bridging
 * - Support for different compression settings on each side
 * - Backward compatibility with non-compressed peers
 */

import { EventEmitter } from 'node:events';
import { type Socket, createConnection } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import {
  type CompressionConfig,
  type CompressionStats,
  compress,
  uncompress,
  tryDecompress,
  isCompressionFrame,
  createCompressionStats,
  createCompressionConfig,
  hasFrameMagic,
  parseFrameHeader,
} from '../compression/index.js';

/**
 * Proxy options with independent compression configuration for each side
 */
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
  /**
   * Compression configuration for both sides
   * - ws: WebSocket side configuration
   * - tcp: TCP side configuration
   */
  compression?: {
    /** WebSocket side compression configuration */
    ws?: CompressionConfig;
    /** TCP side compression configuration */
    tcp?: CompressionConfig;
  };
}

/**
 * Extended connection statistics including compression metrics
 */
interface ConnectionStats {
  wsMessagesIn: number;
  wsMessagesOut: number;
  tcpBytesIn: number;
  tcpBytesOut: number;
  connectedAt: Date;
  wsCompression: CompressionStats;
  tcpCompression: CompressionStats;
}

/**
 * Convert Buffer to Uint8Array without copying if possible
 */
function bufferToUint8Array(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/**
 * Convert Uint8Array to Buffer without copying if possible
 */
function uint8ArrayToBuffer(arr: Uint8Array): Buffer {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

/**
 * Represents a single proxy connection between WebSocket client and TCP server
 */
class ProxyConnection extends EventEmitter {
  private ws: WebSocket;
  private tcpSocket: Socket | null = null;
  private stats: ConnectionStats;
  private options: ProxyOptions;
  private closed = false;
  private wsCompressionConfig: CompressionConfig;
  private tcpCompressionConfig: CompressionConfig;

  constructor(ws: WebSocket, options: ProxyOptions) {
    super();
    this.ws = ws;
    this.options = options;
    
    // Initialize compression configs with defaults
    this.wsCompressionConfig = createCompressionConfig(options.compression?.ws);
    this.tcpCompressionConfig = createCompressionConfig(options.compression?.tcp);
    
    this.stats = {
      wsMessagesIn: 0,
      wsMessagesOut: 0,
      tcpBytesIn: 0,
      tcpBytesOut: 0,
      connectedAt: new Date(),
      wsCompression: createCompressionStats(),
      tcpCompression: createCompressionStats(),
    };

    this.setupWebSocket();
  }

  private setupWebSocket(): void {
    this.ws.on('message', (data: WebSocket.RawData) => {
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
      this.log(`Compression - WS: ${this.wsCompressionConfig.enabled ? 'enabled' : 'disabled'}, TCP: ${this.tcpCompressionConfig.enabled ? 'enabled' : 'disabled'}`);
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

  /**
   * Handle incoming message from WebSocket client
   * - Decompress if compressed (from browser)
   * - Re-compress for TCP side if TCP compression is enabled
   * - Forward to TCP server
   */
  private handleWebSocketMessage(data: WebSocket.RawData): void {
    if (this.closed) return;

    // Handle both single Buffer and Buffer[]
    let buffer = Buffer.isBuffer(data)
      ? data
      : Array.isArray(data)
        ? Buffer.concat(data)
        : Buffer.from(data);

    const maxSize = this.options.maxMessageSize ?? 16 * 1024 * 1024;
    
    // Check uncompressed size
    const uint8Data = bufferToUint8Array(buffer);
    const frameInfo = parseFrameHeader(uint8Data);
    const uncompressedSize = frameInfo ? frameInfo.length : buffer.length;
    
    if (uncompressedSize > maxSize) {
      this.log(`Message too large: ${uncompressedSize} bytes (max: ${maxSize})`);
      this.close();
      return;
    }

    this.stats.wsMessagesIn++;
    
    // Step 1: Decompress if the message is compressed (from WS side)
    let decompressedData: Uint8Array;
    if (hasFrameMagic(uint8Data)) {
      const decompressed = uncompress(uint8Data);
      if (decompressed !== null) {
        decompressedData = decompressed;
        this.log(`Decompressed WS message: ${buffer.length} -> ${decompressedData.length} bytes`);
      } else {
        // Decompression failed, use original
        decompressedData = uint8Data;
      }
    } else {
      decompressedData = uint8Data;
    }

    // Step 2: Compress for TCP side if enabled (and different from WS side)
    let dataToSend: Uint8Array = decompressedData;
    if (this.tcpCompressionConfig.enabled) {
      const compressed = compress(decompressedData, {
        threshold: this.tcpCompressionConfig.threshold,
        level: this.tcpCompressionConfig.level,
        highCompression: this.tcpCompressionConfig.highCompression,
      });
      if (compressed !== null) {
        dataToSend = compressed;
        this.log(`Compressed for TCP: ${decompressedData.length} -> ${dataToSend.length} bytes`);
      }
    }

    this.stats.tcpBytesOut += uint8ArrayToBuffer(dataToSend).length;

    // Step 3: Forward to TCP service (convert to Buffer)
    if (this.tcpSocket?.writable) {
      const bufferToSend = uint8ArrayToBuffer(dataToSend);
      this.tcpSocket.write(bufferToSend);
      this.log(`Forwarded ${dataToSend.length} bytes to TCP (original: ${decompressedData.length})`);
    }
  }

  /**
   * Handle incoming data from TCP server
   * - Decompress if compressed (from native Cap'n Proto service)
   * - Re-compress for WebSocket side if WS compression is enabled
   * - Forward to WebSocket client
   */
  private handleTcpData(data: Buffer): void {
    if (this.closed) return;

    this.stats.tcpBytesIn += data.length;

    // Step 1: Decompress if the message is compressed (from TCP side)
    const uint8Data = bufferToUint8Array(data);
    let decompressedData: Uint8Array;
    if (hasFrameMagic(uint8Data)) {
      const decompressed = uncompress(uint8Data);
      if (decompressed !== null) {
        decompressedData = decompressed;
        this.log(`Decompressed TCP message: ${data.length} -> ${decompressedData.length} bytes`);
      } else {
        // Decompression failed, use original
        decompressedData = uint8Data;
      }
    } else {
      decompressedData = uint8Data;
    }

    // Step 2: Compress for WebSocket side if enabled
    let dataToSend: Uint8Array = decompressedData;
    if (this.wsCompressionConfig.enabled) {
      const compressed = compress(decompressedData, {
        threshold: this.wsCompressionConfig.threshold,
        level: this.wsCompressionConfig.level,
        highCompression: this.wsCompressionConfig.highCompression,
      });
      if (compressed !== null) {
        dataToSend = compressed;
        this.log(`Compressed for WS: ${decompressedData.length} -> ${dataToSend.length} bytes`);
      }
    }

    this.stats.wsMessagesOut++;

    // Step 3: Forward to WebSocket client
    if (this.ws.readyState === WebSocket.OPEN) {
      // WebSocket can send Uint8Array directly
      this.ws.send(dataToSend);
      this.log(`Forwarded ${dataToSend.length} bytes to WebSocket (original: ${decompressedData.length})`);
    }
  }

  private log(...args: unknown[]): void {
    if (this.options.debug) {
      console.log('[ProxyConnection]', ...args);
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

/**
 * WebSocket-to-TCP Proxy server
 * Manages multiple proxy connections
 */
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
      console.log('[CapnpWebSocketProxy]', ...args);
    }
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  getAllStats(): ConnectionStats[] {
    return Array.from(this.connections.values()).map((c) => c.getStats());
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
  let wsCompression = false;
  let tcpCompression = false;
  let compressionThreshold = 1024;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--ws-port':
      case '-p':
        wsPort = Number.parseInt(args[++i], 10);
        break;
      case '--target':
      case '-t': {
        const [host, port] = args[++i].split(':');
        targetHost = host;
        targetPort = Number.parseInt(port, 10);
        break;
      }
      case '--debug':
      case '-d':
        debug = true;
        break;
      case '--ws-compression':
      case '-w':
        wsCompression = true;
        break;
      case '--tcp-compression':
      case '-c':
        tcpCompression = true;
        break;
      case '--compression-threshold':
        compressionThreshold = Number.parseInt(args[++i], 10);
        break;
      case '--help':
      case '-h':
        console.log(`
Cap'n Proto WebSocket-to-TCP Proxy

Usage: npx @naeemo/capnp proxy [options]

Options:
  -p, --ws-port <port>            WebSocket server port (default: 8080)
  -t, --target <host:port>        Target TCP service (default: localhost:8081)
  -d, --debug                     Enable debug logging
  -w, --ws-compression            Enable WebSocket side compression
  -c, --tcp-compression           Enable TCP side compression
      --compression-threshold <n> Minimum size to compress (default: 1024)
  -h, --help                      Show this help

Examples:
  npx @naeemo/capnp proxy -p 9000 -t 192.168.1.100:7000
  
  # Enable compression on WebSocket side only (for browser clients)
  npx @naeemo/capnp proxy -p 9000 -t localhost:7000 -w
  
  # Enable compression on both sides
  npx @naeemo/capnp proxy -p 9000 -t localhost:7000 -w -c
  
  # Enable compression with lower threshold
  npx @naeemo/capnp proxy -p 9000 -t localhost:7000 -w --compression-threshold 512
`);
        process.exit(0);
    }
  }

  const proxy = new CapnpWebSocketProxy({
    wsPort,
    targetHost,
    targetPort,
    debug,
    compression: {
      ws: {
        enabled: wsCompression,
        threshold: compressionThreshold,
      },
      tcp: {
        enabled: tcpCompression,
        threshold: compressionThreshold,
      },
    },
  });

  console.log('WebSocket-to-TCP Proxy started');
  console.log(`  WebSocket: ws://localhost:${wsPort}`);
  console.log(`  Target:    ${targetHost}:${targetPort}`);
  if (wsCompression || tcpCompression) {
    console.log(`  Compression:`);
    console.log(`    WebSocket: ${wsCompression ? 'enabled' : 'disabled'} (threshold: ${compressionThreshold})`);
    console.log(`    TCP:       ${tcpCompression ? 'enabled' : 'disabled'} (threshold: ${compressionThreshold})`);
  }

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
