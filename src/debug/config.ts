/**
 * Global Debug Configuration for Cap'n Proto TypeScript
 * 
 * Provides runtime debug controls and logging configuration.
 */

/**
 * Debug configuration options
 */
export interface DebugOptions {
  /** Enable colored output in debug logs */
  colors?: boolean;
  /** Maximum bytes to display when logging binary data */
  maxBytes?: number;
  /** Filter by message type or peer (string or RegExp) */
  filter?: string | RegExp;
}

/**
 * Internal debug state
 */
interface DebugState {
  enabled: boolean;
  options: Required<DebugOptions>;
}

/**
 * Global debug state
 */
let debugState: DebugState = {
  enabled: false,
  options: {
    colors: true,
    maxBytes: 256,
    filter: '',
  },
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
 * Check CAPNP_DEBUG environment variable in Node.js
 */
function checkEnvVar(): boolean {
  if (isNode()) {
    try {
      const envValue = process.env['CAPNP_DEBUG'];
      return envValue === '1' || envValue === 'true';
    } catch {
      // Environment access failed, assume false
      return false;
    }
  }
  return false;
}

// Initialize from environment variable on module load
if (checkEnvVar()) {
  debugState.enabled = true;
}

/**
 * Enable debug mode with optional configuration
 * 
 * @param options - Debug configuration options
 * @example
 * ```typescript
 * enableDebug({ colors: true, maxBytes: 512 });
 * ```
 */
export function enableDebug(options?: DebugOptions): void {
  debugState.enabled = true;
  if (options) {
    debugState.options = {
      ...debugState.options,
      ...options,
    };
  }
}

/**
 * Disable debug mode
 * 
 * @example
 * ```typescript
 * disableDebug();
 * ```
 */
export function disableDebug(): void {
  debugState.enabled = false;
}

/**
 * Check if debug mode is currently enabled
 * 
 * @returns True if debug mode is enabled
 * @example
 * ```typescript
 * if (isDebugEnabled()) {
 *   console.log('Debug is on');
 * }
 * ```
 */
export function isDebugEnabled(): boolean {
  return debugState.enabled;
}

/**
 * Get current debug options (internal use)
 * @internal
 */
export function getDebugOptions(): Readonly<Required<DebugOptions>> {
  return Object.freeze({ ...debugState.options });
}

/**
 * Check if a message/peer matches the current filter
 * @internal
 */
export function matchesFilter(messageType: string, peer?: string): boolean {
  const { filter } = debugState.options;
  
  if (!filter || filter === '') {
    return true;
  }
  
  const target = peer ? `${messageType}:${peer}` : messageType;
  
  if (filter instanceof RegExp) {
    return filter.test(target);
  }
  
  return target.includes(filter);
}

/**
 * Format bytes for debug output
 * @internal
 */
export function formatBytes(data: Uint8Array, maxBytes?: number): string {
  const limit = maxBytes ?? debugState.options.maxBytes;
  const slice = data.length > limit ? data.slice(0, limit) : data;
  const hex = Array.from(slice)
    .map(b => b.toString(16).padStart(2, '0'))
    .join(' ');
  
  if (data.length > limit) {
    return `${hex}... (${data.length} bytes total)`;
  }
  return hex;
}
