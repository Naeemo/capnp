import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DebugConfig } from './index';
import { DebugLogger, createDebugLogger, debug, formatHexDump } from './index';

describe('formatHexDump', () => {
  it('should format empty data', () => {
    const result = formatHexDump(new Uint8Array(0));
    expect(result).toEqual([]);
  });

  it('should format single byte', () => {
    const data = new Uint8Array([0x41]);
    const result = formatHexDump(data);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/00000000: 41\s+│A│/);
  });

  it('should format multiple bytes', () => {
    const data = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
    const result = formatHexDump(data);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('00000000:');
    expect(result[0]).toContain('00 01 02 03 04 05 06 07');
  });

  it('should format 16 bytes per line', () => {
    const data = new Uint8Array(16).fill(0x41);
    const result = formatHexDump(data);
    expect(result).toHaveLength(1);
    // Should have proper spacing after 8 bytes
    expect(result[0]).toMatch(/41 41 41 41 41 41 41 41 {2}41 41 41 41 41 41 41 41/);
  });

  it('should wrap to multiple lines', () => {
    const data = new Uint8Array(20).fill(0x42);
    const result = formatHexDump(data);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('00000000:');
    expect(result[1]).toContain('00000010:');
  });

  it('should truncate data exceeding maxBytes', () => {
    const data = new Uint8Array(100);
    const result = formatHexDump(data, 32);
    // Should have 2 full lines + truncation message
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result[result.length - 1]).toContain('more bytes');
  });

  it('should handle non-printable characters', () => {
    const data = new Uint8Array([0x00, 0x01, 0x7f, 0x80, 0xff]);
    const result = formatHexDump(data);
    expect(result[0]).toContain('│.....│');
  });

  it('should handle printable characters', () => {
    const data = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
    const result = formatHexDump(data);
    expect(result[0]).toContain('│Hello│');
  });

  it('should handle mixed content', () => {
    // Mixed printable and non-printable
    const data = new Uint8Array([0x00, 0x48, 0x69, 0x00, 0x21]); // \0Hi\0!
    const result = formatHexDump(data);
    expect(result[0]).toContain('│.Hi.!│');
  });

  it('should support colors in Node.js', () => {
    const data = new Uint8Array([0x41, 0x42, 0x43]);
    const result = formatHexDump(data, 1024, true);
    expect(result).toHaveLength(1);
    // When colors enabled, ANSI codes should be present
    expect(result[0]).toContain('\x1b[');
  });

  it('should format 32-bit offset correctly', () => {
    const data = new Uint8Array(256).fill(0x41);
    const result = formatHexDump(data);
    expect(result[0]).toContain('00000000:');
    expect(result[result.length - 1]).toContain('000000f0:');
  });
});

describe('DebugLogger', () => {
  let logger: DebugLogger;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logger = new DebugLogger({ enabled: true, colors: false });
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should use default config', () => {
      const defaultLogger = new DebugLogger();
      const config = defaultLogger.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.colors).toBe(true);
      expect(config.maxBytesToLog).toBe(1024);
    });

    it('should merge partial config', () => {
      const customLogger = new DebugLogger({ enabled: true });
      const config = customLogger.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.colors).toBe(true); // default
      expect(config.maxBytesToLog).toBe(1024); // default
    });
  });

  describe('setConfig', () => {
    it('should update config', () => {
      logger.setConfig({ maxBytesToLog: 512 });
      expect(logger.getConfig().maxBytesToLog).toBe(512);
      expect(logger.getConfig().enabled).toBe(true); // unchanged
    });

    it('should not affect other properties', () => {
      logger.setConfig({ colors: false });
      expect(logger.getConfig().enabled).toBe(true);
      expect(logger.getConfig().maxBytesToLog).toBe(1024);
    });
  });

  describe('enable/disable', () => {
    it('should enable logging', () => {
      logger.disable();
      expect(logger.isEnabled()).toBe(false);
      logger.enable();
      expect(logger.isEnabled()).toBe(true);
    });

    it('should disable logging', () => {
      expect(logger.isEnabled()).toBe(true);
      logger.disable();
      expect(logger.isEnabled()).toBe(false);
    });
  });

  describe('logMessage', () => {
    it('should not log when disabled', () => {
      logger.disable();
      const data = new Uint8Array([0x01, 0x02, 0x03]);
      logger.logMessage('send', data);
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should log send message', () => {
      const data = new Uint8Array([0x01, 0x02, 0x03]);
      logger.logMessage('send', data);
      expect(consoleLogSpy).toHaveBeenCalled();
      const calls = consoleLogSpy.mock.calls;
      expect(calls[0][0]).toContain('[CAPNP:SEND]');
      expect(calls[0][0]).toContain('3 bytes');
    });

    it('should log recv message', () => {
      const data = new Uint8Array([0x01, 0x02, 0x03]);
      logger.logMessage('recv', data);
      expect(consoleLogSpy).toHaveBeenCalled();
      const calls = consoleLogSpy.mock.calls;
      expect(calls[0][0]).toContain('[CAPNP:RECV]');
      expect(calls[0][0]).toContain('3 bytes');
    });

    it('should include hex dump', () => {
      const data = new Uint8Array([0x41, 0x42, 0x43]);
      logger.logMessage('send', data);
      expect(consoleLogSpy.mock.calls.length).toBeGreaterThan(1);
      // Second call should be the hex dump
      expect(consoleLogSpy.mock.calls[1][0]).toContain('00000000:');
    });

    it('should include parsed object', () => {
      const data = new Uint8Array([0x01, 0x02]);
      const parsed = { messageType: 'Bootstrap', id: 1 };
      logger.logMessage('send', data, parsed);

      const calls = consoleLogSpy.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0]).toContain('→');
      expect(lastCall[0]).toContain('Bootstrap');
    });

    it('should respect maxBytesToLog', () => {
      logger.setConfig({ maxBytesToLog: 16 });
      const data = new Uint8Array(100);
      logger.logMessage('send', data);

      const calls = consoleLogSpy.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0]).toContain('more bytes');
    });

    it('should log empty data', () => {
      const data = new Uint8Array(0);
      logger.logMessage('send', data);
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0][0]).toContain('0 bytes');
    });
  });

  describe('log', () => {
    it('should log debug message when enabled', () => {
      logger.log('test message');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[CAPNP:DEBUG]'));
    });

    it('should not log when disabled', () => {
      logger.disable();
      logger.log('test message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should pass additional arguments', () => {
      logger.log('message', { extra: 'data' }, 123);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('message'),
        { extra: 'data' },
        123
      );
    });
  });

  describe('error', () => {
    it('should log error when enabled', () => {
      logger.error('something went wrong');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should not log error when disabled', () => {
      logger.disable();
      logger.error('something went wrong');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should include error object', () => {
      const err = new Error('test error');
      logger.error('operation failed', err);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('operation failed'),
        err
      );
    });
  });
});

describe('createDebugLogger', () => {
  it('should create logger with default config', () => {
    const logger = createDebugLogger();
    expect(logger).toBeInstanceOf(DebugLogger);
    expect(logger.getConfig().enabled).toBe(false);
  });

  it('should create logger with custom config', () => {
    const logger = createDebugLogger({ enabled: true, colors: false });
    expect(logger.getConfig().enabled).toBe(true);
    expect(logger.getConfig().colors).toBe(false);
  });
});

describe('default debug instance', () => {
  it('should be a DebugLogger instance', () => {
    expect(debug).toBeInstanceOf(DebugLogger);
  });

  it('should have default disabled state', () => {
    expect(debug.isEnabled()).toBe(false);
  });
});

describe('integration', () => {
  let logger: DebugLogger;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logger = new DebugLogger({ enabled: true, colors: false, maxBytesToLog: 64 });
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should produce expected output format for send', () => {
    // Create a realistic Cap'n Proto-like message
    const data = new Uint8Array([
      0x00,
      0x00,
      0x00,
      0x00, // First word
      0x02,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00, // Second word
      0x01,
      0x00,
      0x00,
      0x00,
    ]);

    logger.logMessage('send', data, { messageType: 'Bootstrap', questionId: 1 });

    const calls = consoleLogSpy.mock.calls;

    // Check header
    expect(calls[0][0]).toContain('[CAPNP:SEND]');
    expect(calls[0][0]).toContain('16 bytes');

    // Check hex dump
    expect(calls[1][0]).toContain('00000000:');
    expect(calls[1][0]).toContain('│');

    // Check parsed output
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0]).toContain('→');
    expect(lastCall[0]).toContain('Bootstrap');
  });

  it('should produce expected output format for recv', () => {
    const data = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00]);

    logger.logMessage('recv', data);

    const calls = consoleLogSpy.mock.calls;
    expect(calls[0][0]).toContain('[CAPNP:RECV]');
    expect(calls[0][0]).toContain('8 bytes');
  });

  it('should handle large messages with truncation', () => {
    const data = new Uint8Array(200);
    logger.logMessage('send', data);

    const calls = consoleLogSpy.mock.calls;
    // Should have header + hex lines + truncation message
    expect(calls.length).toBeGreaterThan(2);

    // Last call should indicate truncation
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0]).toContain('more bytes');
  });
});
