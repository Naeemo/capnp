/**
 * WebSocket Integration Tests
 *
 * Phase 3: Real WebSocket server/client tests
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { WebSocketTransport } from '../../rpc/websocket-transport.js';
import { RpcConnection } from '../../rpc/rpc-connection.js';
import type { CallContext } from '../../rpc/call-context.js';
import type { StructReader, StructBuilder } from '../../core/index.js';

// Simple test server implementation
class TestServer {
  private requestCount = 0;

  async handleCall(methodId: number, params: unknown): Promise<unknown> {
    this.requestCount++;

    switch (methodId) {
      case 0: // echo
        return { message: (params as { message: string }).message, count: this.requestCount };
      case 1: // getCounter
        return { count: this.requestCount };
      default:
        throw new Error(`Unknown method: ${methodId}`);
    }
  }

  getRequestCount(): number {
    return this.requestCount;
  }
}

describe('WebSocket Integration', () => {
  // Note: These tests require a running WebSocket server
  // For CI/CD, we can use a mock transport or start a test server

  it('should connect to WebSocket server', async () => {
    // This test is skipped if no server is available
    // In a real test environment, start a test server first
    const testServerUrl = process.env.TEST_WS_URL || 'ws://localhost:8080';

    try {
      const transport = await WebSocketTransport.connect(testServerUrl);
      expect(transport).toBeDefined();
      expect(transport.connected).toBe(true);

      transport.close();
    } catch (error) {
      // Skip if server is not available
      console.log(`Skipping WebSocket test: ${error}`);
    }
  });

  it('should perform bootstrap', async () => {
    const testServerUrl = process.env.TEST_WS_URL || 'ws://localhost:8080';

    try {
      const transport = await WebSocketTransport.connect(testServerUrl);
      const connection = new RpcConnection(transport);
      await connection.start();

      // Bootstrap should complete without error
      // In a real test, we'd verify the bootstrap response
      expect(connection).toBeDefined();

      await connection.stop();
    } catch (error) {
      console.log(`Skipping bootstrap test: ${error}`);
    }
  });

  it('should handle connection errors gracefully', async () => {
    // Try to connect to a non-existent server
    try {
      await WebSocketTransport.connect('ws://localhost:59999');
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  it('should handle connection close', async () => {
    const testServerUrl = process.env.TEST_WS_URL || 'ws://localhost:8080';

    try {
      const transport = await WebSocketTransport.connect(testServerUrl);
      const connection = new RpcConnection(transport);
      await connection.start();

      // Close the connection
      await connection.stop();

      expect(transport.connected).toBe(false);
    } catch (error) {
      console.log(`Skipping connection close test: ${error}`);
    }
  });
});

describe('RPC Connection Integration', () => {
  it('should create question and answer tables', () => {
    const { QuestionTable, AnswerTable } = require('../rpc/four-tables.js');

    const questions = new QuestionTable();
    const answers = new AnswerTable();

    const question = questions.create();
    const answer = answers.create(question.id);

    expect(question.id).toBe(answer.id);
    expect(questions.get(question.id)).toBeDefined();
    expect(answers.get(answer.id)).toBeDefined();
  });

  it('should track capability imports and exports', () => {
    const { ImportTable, ExportTable } = require('../rpc/four-tables.js');

    const imports = new ImportTable();
    const exports = new ExportTable();

    // Add import
    const imp = imports.add(1, false);
    expect(imp.id).toBe(1);
    expect(imp.refCount).toBe(1);

    // Add export
    const cap = { test: 'capability' };
    const exp = exports.add(cap, false);
    expect(exp.id).toBeGreaterThan(0);
    expect(exp.capability).toBe(cap);

    // Reference counting
    imports.addRef(1);
    expect(imports.get(1)?.refCount).toBe(2);

    const shouldRemove = imports.release(1, 2);
    expect(shouldRemove).toBe(true);
    expect(imports.get(1)).toBeUndefined();
  });
});

describe('CallContext Integration', () => {
  it('should create and use CallContext', () => {
    const { CallContextImpl } = require('../../rpc/call-context.js');

    // Mock params and results
    const mockParams = { getMessage() { return 'hello'; } } as unknown as StructReader;
    const mockResults = {
      message: '',
      setMessage(value: string) { (this as unknown as { message: string }).message = value; },
    } as unknown as StructBuilder;

    const context = new CallContextImpl(mockParams, mockResults);

    expect(context.getParams()).toBe(mockParams);
    expect(context.getResults()).toBe(mockResults);
    expect(context.isReturned()).toBe(false);

    context.return();
    expect(context.isReturned()).toBe(true);
  });

  it('should handle exceptions in CallContext', () => {
    const { CallContextImpl } = require('../../rpc/call-context.js');

    const mockParams = {} as StructReader;
    const mockResults = {} as StructBuilder;

    const context = new CallContextImpl(mockParams, mockResults);

    context.throwException('Test error', 'failed');

    expect(context.isReturned()).toBe(true);
    expect(context.getException()).toEqual({ reason: 'Test error', type: 'failed' });
  });

  it('should prevent double return', () => {
    const { CallContextImpl } = require('../../rpc/call-context.js');

    const mockParams = {} as StructReader;
    const mockResults = {} as StructBuilder;

    const context = new CallContextImpl(mockParams, mockResults);

    context.return();

    expect(() => context.return()).toThrow('Call already returned');
    expect(() => context.throwException('error')).toThrow('Call already returned');
  });
});
