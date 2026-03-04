/**
 * Debug/Trace module for Cap'n Proto RPC
 * Provides formatted logging of binary messages with hexdump-style output
 */

/**
 * Configuration options for debug logging
 */
export interface DebugConfig {
  /** Whether debugging is enabled */
  enabled: boolean;
  /** Whether to use colors in output */
  colors: boolean;
  /** Maximum number of bytes to log per message */
  maxBytesToLog: number;
}

/**
 * Default configuration for debug logging
 */
const DEFAULT_CONFIG: DebugConfig = {
  enabled: false,
  colors: true,
  maxBytesToLog: 1024,
};

/**
 * ANSI color codes for Node.js output
 */
const ANSI_COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

/**
 * CSS styles for browser console output
 */
const BROWSER_STYLES = {
  header: 'color: #6c757d; font-weight: bold;',
  send: 'color: #28a745; font-weight: bold;',
  recv: 'color: #007bff; font-weight: bold;',
  hex: 'color: #6c757d;',
  ascii: 'color: #495057;',
  arrow: 'color: #6c757d;',
  parsed: 'color: #17a2b8;',
};

/**
 * Check if running in Node.js environment
 */
function isNode(): boolean {
  return typeof process !== 'undefined' && 
         process.versions != null && 
         process.versions.node != null;
}

/**
 * Format a byte as two-digit hex string
 */
function byteToHex(byte: number): string {
  return byte.toString(16).padStart(2, '0');
}

/**
 * Check if a byte is printable ASCII
 */
function isPrintable(byte: number): boolean {
  return byte >= 32 && byte < 127;
}

/**
 * Format binary data as hex + ASCII (like hexdump -C)
 * 
 * Output format:
 * 00000000: 00 00 00 00 02 00 00 00  │........│
 * 
 * @param data - The binary data to format
 * @param maxBytes - Maximum number of bytes to format
 * @param useColors - Whether to include ANSI colors
 * @returns Array of formatted lines
 */
export function formatHexDump(
  data: Uint8Array, 
  maxBytes: number = 1024,
  useColors: boolean = false
): string[] {
  const lines: string[] = [];
  const bytesToFormat = Math.min(data.length, maxBytes);
  const bytesPerLine = 16;
  
  for (let offset = 0; offset < bytesToFormat; offset += bytesPerLine) {
    const chunk = data.slice(offset, Math.min(offset + bytesPerLine, bytesToFormat));
    
    // Address prefix
    let line = `${byteToHex((offset >> 24) & 0xff)}${byteToHex((offset >> 16) & 0xff)}${byteToHex((offset >> 8) & 0xff)}${byteToHex(offset & 0xff)}: `;
    
    // Hex bytes
    const hexParts: string[] = [];
    for (let i = 0; i < bytesPerLine; i++) {
      if (i < chunk.length) {
        hexParts.push(byteToHex(chunk[i]));
      } else {
        hexParts.push('  ');
      }
      // Add extra space after 8 bytes for readability
      if (i === 7) {
        hexParts.push('');
      }
    }
    line += hexParts.join(' ');
    
    // ASCII representation with delimiter
    let ascii = ' │';
    for (let i = 0; i < chunk.length; i++) {
      ascii += isPrintable(chunk[i]) ? String.fromCharCode(chunk[i]) : '.';
    }
    ascii += '│';
    
    line += ascii;
    
    // Add ANSI colors if enabled (dim the hex/ascii parts)
    if (useColors && isNode()) {
      // Find where hex starts (after address)
      const hexStart = line.indexOf(':') + 2;
      const delimiterIndex = line.indexOf('│');
      const hexPart = line.slice(hexStart, delimiterIndex);
      const asciiPart = line.slice(delimiterIndex);
      line = line.slice(0, hexStart) + ANSI_COLORS.gray + hexPart + ANSI_COLORS.reset + 
             ANSI_COLORS.dim + asciiPart + ANSI_COLORS.reset;
    }
    
    lines.push(line);
  }
  
  // Add truncation indicator if data was truncated
  if (data.length > maxBytes) {
    const remaining = data.length - maxBytes;
    lines.push(`... (${remaining} more bytes)`);
  }
  
  return lines;
}

/**
 * Debug logger for Cap'n Proto RPC messages
 */
export class DebugLogger {
  private config: DebugConfig;
  
  /**
   * Create a new DebugLogger instance
   * @param config - Partial configuration to override defaults
   */
  constructor(config: Partial<DebugConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Update the logger configuration
   * @param config - Partial configuration to merge
   */
  setConfig(config: Partial<DebugConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Get current configuration
   */
  getConfig(): DebugConfig {
    return { ...this.config };
  }
  
  /**
   * Check if debugging is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
  
  /**
   * Enable debug logging
   */
  enable(): void {
    this.config.enabled = true;
  }
  
  /**
   * Disable debug logging
   */
  disable(): void {
    this.config.enabled = false;
  }
  
  /**
   * Format the header for a log message
   * @param direction - 'send' or 'recv'
   * @param byteLength - Number of bytes
   * @returns Formatted header string
   */
  private formatHeader(direction: 'send' | 'recv', byteLength: number): string {
    const prefix = direction === 'send' ? 'CAPNP:SEND' : 'CAPNP:RECV';
    const directionStr = direction === 'send' ? 'SEND' : 'RECV';
    
    if (isNode() && this.config.colors) {
      const color = direction === 'send' ? ANSI_COLORS.green : ANSI_COLORS.blue;
      return `${color}[${prefix}]${ANSI_COLORS.reset} ${byteLength} bytes`;
    }
    
    return `[${prefix}] ${byteLength} bytes`;
  }
  
  /**
   * Log a Cap'n Proto message
   * 
   * Output format:
   * [CAPNP:SEND] 64 bytes
   * 00000000: 00 00 00 00 02 00 00 00  │........│
   * → { messageType: 'Bootstrap', ... }
   * 
   * @param direction - 'send' for outgoing, 'recv' for incoming
   * @param data - The raw binary message data
   * @param parsed - Optional parsed message object to display
   */
  logMessage(direction: 'send' | 'recv', data: Uint8Array, parsed?: object): void {
    if (!this.config.enabled) {
      return;
    }
    
    const isNodeEnv = isNode();
    const useColors = this.config.colors;
    
    // Format and log header
    const header = this.formatHeader(direction, data.length);
    
    // Format hex dump
    const hexLines = formatHexDump(data, this.config.maxBytesToLog, useColors);
    
    if (isNodeEnv) {
      // Node.js output with ANSI colors
      console.log(header);
      for (const line of hexLines) {
        console.log(line);
      }
      
      if (parsed !== undefined) {
        const arrow = useColors ? `${ANSI_COLORS.gray}→${ANSI_COLORS.reset}` : '→';
        const parsedStr = JSON.stringify(parsed, null, 2);
        const coloredParsed = useColors 
          ? `${ANSI_COLORS.cyan}${parsedStr}${ANSI_COLORS.reset}`
          : parsedStr;
        console.log(`${arrow} ${coloredParsed}`);
      }
    } else {
      // Browser output with CSS
      if (useColors) {
        const style = direction === 'send' ? BROWSER_STYLES.send : BROWSER_STYLES.recv;
        console.log(`%c[CAPNP:${direction.toUpperCase()}]%c ${data.length} bytes`, 
          style, 'color: inherit;');
        
        for (const line of hexLines) {
          console.log(`%c${line}`, BROWSER_STYLES.hex);
        }
        
        if (parsed !== undefined) {
          console.log('%c→%c %o', BROWSER_STYLES.arrow, BROWSER_STYLES.parsed, parsed);
        }
      } else {
        console.log(header);
        for (const line of hexLines) {
          console.log(line);
        }
        if (parsed !== undefined) {
          console.log('→', parsed);
        }
      }
    }
  }
  
  /**
   * Log a generic debug message (only if enabled)
   * @param message - Message to log
   * @param args - Additional arguments
   */
  log(message: string, ...args: unknown[]): void {
    if (!this.config.enabled) {
      return;
    }
    
    if (isNode() && this.config.colors) {
      console.log(`${ANSI_COLORS.gray}[CAPNP:DEBUG]${ANSI_COLORS.reset} ${message}`, ...args);
    } else {
      console.log(`[CAPNP:DEBUG] ${message}`, ...args);
    }
  }
  
  /**
   * Log an error message (always shown if debug is enabled)
   * @param message - Error message
   * @param error - Optional error object
   */
  error(message: string, error?: unknown): void {
    if (!this.config.enabled) {
      return;
    }
    
    if (isNode() && this.config.colors) {
      console.error(`${ANSI_COLORS.red}[CAPNP:ERROR]${ANSI_COLORS.reset} ${message}`, error ?? '');
    } else {
      console.error(`[CAPNP:ERROR] ${message}`, error ?? '');
    }
  }
}

/**
 * Create a default debug logger instance
 * @param config - Optional configuration
 * @returns DebugLogger instance
 */
export function createDebugLogger(config?: Partial<DebugConfig>): DebugLogger {
  return new DebugLogger(config);
}

/**
 * Global debug logger instance for convenience
 */
export const debug = new DebugLogger();

// Export default for convenience
export default DebugLogger;
