/**
 * Echo Service - Full RPC Implementation Example
 *
 * Phase 3: Complete server/client implementation with WebSocket transport
 */

import { MessageBuilder, MessageReader } from '../core/index.js';
import type { StructBuilder, StructReader } from '../core/index.js';
import type { CallContext } from '../rpc/call-context.js';
import { RpcConnection } from '../rpc/rpc-connection.js';
import { WebSocketTransport } from '../rpc/websocket-transport.js';

// ========================================================================================
// Schema (would normally be generated from .capnp file)
// ========================================================================================

// EchoRequest struct
export interface EchoRequest {
  message: string;
  delayMs?: number;
}

export class EchoRequestReader implements StructReader {
  constructor(private reader: StructReader) {}

  get message(): string {
    return this.reader.getText(0) ?? '';
  }

  get delayMs(): number {
    return this.reader.getUint32(0) ?? 0;
  }

  // StructReader interface implementation
  get dataView(): DataView {
    return this.reader.dataView;
  }
  getUint8(offset: number): number {
    return this.reader.getUint8(offset);
  }
  getUint16(offset: number): number {
    return this.reader.getUint16(offset);
  }
  getUint32(offset: number): number {
    return this.reader.getUint32(offset);
  }
  getUint64(offset: number): bigint {
    return this.reader.getUint64(offset);
  }
  getInt8(offset: number): number {
    return this.reader.getInt8(offset);
  }
  getInt16(offset: number): number {
    return this.reader.getInt16(offset);
  }
  getInt32(offset: number): number {
    return this.reader.getInt32(offset);
  }
  getInt64(offset: number): bigint {
    return this.reader.getInt64(offset);
  }
  getFloat32(offset: number): number {
    return this.reader.getFloat32(offset);
  }
  getFloat64(offset: number): number {
    return this.reader.getFloat64(offset);
  }
  getBool(bitOffset: number): boolean {
    return this.reader.getBool(bitOffset);
  }
  getText(pointerIndex: number): string {
    return this.reader.getText(pointerIndex);
  }
  getData(pointerIndex: number): Uint8Array {
    return this.reader.getData(pointerIndex);
  }
  getStruct(pointerIndex: number, dataWords: number, pointerCount: number): StructReader {
    return this.reader.getStruct(pointerIndex, dataWords, pointerCount);
  }
  getList(
    pointerIndex: number,
    elementSize: number,
    structSize?: { dataWords: number; pointerCount: number }
  ) {
    return this.reader.getList(pointerIndex, elementSize, structSize);
  }
}

export class EchoRequestBuilder implements StructBuilder {
  constructor(private builder: StructBuilder) {}

  setMessage(value: string): void {
    this.builder.setText(0, value);
  }

  setDelayMs(value: number): void {
    this.builder.setUint32(0, value);
  }

  // StructBuilder interface implementation
  get dataView(): DataView {
    return this.builder.dataView;
  }
  get segment(): { buffer: ArrayBuffer; byteOffset: number; byteLength: number } {
    return this.builder.segment;
  }
  setUint8(offset: number, value: number): void {
    this.builder.setUint8(offset, value);
  }
  setUint16(offset: number, value: number): void {
    this.builder.setUint16(offset, value);
  }
  setUint32(offset: number, value: number): void {
    this.builder.setUint32(offset, value);
  }
  setUint64(offset: number, value: bigint): void {
    this.builder.setUint64(offset, value);
  }
  setInt8(offset: number, value: number): void {
    this.builder.setInt8(offset, value);
  }
  setInt16(offset: number, value: number): void {
    this.builder.setInt16(offset, value);
  }
  setInt32(offset: number, value: number): void {
    this.builder.setInt32(offset, value);
  }
  setInt64(offset: number, value: bigint): void {
    this.builder.setInt64(offset, value);
  }
  setFloat32(offset: number, value: number): void {
    this.builder.setFloat32(offset, value);
  }
  setFloat64(offset: number, value: number): void {
    this.builder.setFloat64(offset, value);
  }
  setBool(bitOffset: number, value: boolean): void {
    this.builder.setBool(bitOffset, value);
  }
  setText(pointerIndex: number, value: string): void {
    this.builder.setText(pointerIndex, value);
  }
  setData(pointerIndex: number, value: Uint8Array): void {
    this.builder.setData(pointerIndex, value);
  }
  initStruct(pointerIndex: number, dataWords: number, pointerCount: number): StructBuilder {
    return this.builder.initStruct(pointerIndex, dataWords, pointerCount);
  }
  initList(
    pointerIndex: number,
    length: number,
    elementSize: number,
    structSize?: { dataWords: number; pointerCount: number }
  ) {
    return this.builder.initList(pointerIndex, length, elementSize, structSize);
  }
}

// EchoResponse struct
export interface EchoResponse {
  message: string;
  timestamp: bigint;
  requestId: number;
}

export class EchoResponseReader implements StructReader {
  constructor(private reader: StructReader) {}

  get message(): string {
    return this.reader.getText(0) ?? '';
  }

  get timestamp(): bigint {
    return this.reader.getUint64(0);
  }

  get requestId(): number {
    return this.reader.getUint32(8);
  }

  // StructReader interface implementation
  get dataView(): DataView {
    return this.reader.dataView;
  }
  getUint8(offset: number): number {
    return this.reader.getUint8(offset);
  }
  getUint16(offset: number): number {
    return this.reader.getUint16(offset);
  }
  getUint32(offset: number): number {
    return this.reader.getUint32(offset);
  }
  getUint64(offset: number): bigint {
    return this.reader.getUint64(offset);
  }
  getInt8(offset: number): number {
    return this.reader.getInt8(offset);
  }
  getInt16(offset: number): number {
    return this.reader.getInt16(offset);
  }
  getInt32(offset: number): number {
    return this.reader.getInt32(offset);
  }
  getInt64(offset: number): bigint {
    return this.reader.getInt64(offset);
  }
  getFloat32(offset: number): number {
    return this.reader.getFloat32(offset);
  }
  getFloat64(offset: number): number {
    return this.reader.getFloat64(offset);
  }
  getBool(bitOffset: number): boolean {
    return this.reader.getBool(bitOffset);
  }
  getText(pointerIndex: number): string {
    return this.reader.getText(pointerIndex);
  }
  getData(pointerIndex: number): Uint8Array {
    return this.reader.getData(pointerIndex);
  }
  getStruct(pointerIndex: number, dataWords: number, pointerCount: number): StructReader {
    return this.reader.getStruct(pointerIndex, dataWords, pointerCount);
  }
  getList(
    pointerIndex: number,
    elementSize: number,
    structSize?: { dataWords: number; pointerCount: number }
  ) {
    return this.reader.getList(pointerIndex, elementSize, structSize);
  }
}

export class EchoResponseBuilder implements StructBuilder {
  constructor(private builder: StructBuilder) {}

  setMessage(value: string): void {
    this.builder.setText(0, value);
  }

  setTimestamp(value: bigint): void {
    this.builder.setUint64(0, value);
  }

  setRequestId(value: number): void {
    this.builder.setUint32(8, value);
  }

  // StructBuilder interface implementation
  get dataView(): DataView {
    return this.builder.dataView;
  }
  get segment(): { buffer: ArrayBuffer; byteOffset: number; byteLength: number } {
    return this.builder.segment;
  }
  setUint8(offset: number, value: number): void {
    this.builder.setUint8(offset, value);
  }
  setUint16(offset: number, value: number): void {
    this.builder.setUint16(offset, value);
  }
  setUint32(offset: number, value: number): void {
    this.builder.setUint32(offset, value);
  }
  setUint64(offset: number, value: bigint): void {
    this.builder.setUint64(offset, value);
  }
  setInt8(offset: number, value: number): void {
    this.builder.setInt8(offset, value);
  }
  setInt16(offset: number, value: number): void {
    this.builder.setInt16(offset, value);
  }
  setInt32(offset: number, value: number): void {
    this.builder.setInt32(offset, value);
  }
  setInt64(offset: number, value: bigint): void {
    this.builder.setInt64(offset, value);
  }
  setFloat32(offset: number, value: number): void {
    this.builder.setFloat32(offset, value);
  }
  setFloat64(offset: number, value: number): void {
    this.builder.setFloat64(offset, value);
  }
  setBool(bitOffset: number, value: boolean): void {
    this.builder.setBool(bitOffset, value);
  }
  setText(pointerIndex: number, value: string): void {
    this.builder.setText(pointerIndex, value);
  }
  setData(pointerIndex: number, value: Uint8Array): void {
    this.builder.setData(pointerIndex, value);
  }
  initStruct(pointerIndex: number, dataWords: number, pointerCount: number): StructBuilder {
    return this.builder.initStruct(pointerIndex, dataWords, pointerCount);
  }
  initList(
    pointerIndex: number,
    length: number,
    elementSize: number,
    structSize?: { dataWords: number; pointerCount: number }
  ) {
    return this.builder.initList(pointerIndex, length, elementSize, structSize);
  }
}

// ========================================================================================
// Interface Definition
// ========================================================================================

export const EchoInterfaceId = 0x1234567890abcdefn;
export const EchoMethodIds = {
  echo: 0,
  echoStreaming: 1,
} as const;

// Server Interface
export interface EchoServer {
  echo(context: CallContext<EchoRequestReader, EchoResponseBuilder>): Promise<void> | void;
  echoStreaming(context: CallContext<EchoRequestReader, EchoResponseBuilder>): Promise<void> | void;
}

// Server Stub
export class EchoStub {
  private server: EchoServer;

  constructor(server: EchoServer) {
    this.server = server;
  }

  static readonly interfaceId = 0x1234567890abcdefn;

  async dispatch(methodId: number, context: CallContext<unknown, unknown>): Promise<void> {
    switch (methodId) {
      case EchoMethodIds.echo:
        return this.server.echo(context as CallContext<EchoRequestReader, EchoResponseBuilder>);
      case EchoMethodIds.echoStreaming:
        return this.server.echoStreaming(
          context as CallContext<EchoRequestReader, EchoResponseBuilder>
        );
      default:
        throw new Error(`Unknown method ID: ${methodId}`);
    }
  }

  isValidMethod(methodId: number): boolean {
    return [EchoMethodIds.echo, EchoMethodIds.echoStreaming].includes(methodId);
  }
}

// Client Class
import { BaseCapabilityClient, type PipelineClient } from '../rpc/index.js';

export class EchoClient extends BaseCapabilityClient {
  static readonly interfaceId = 0x1234567890abcdefn;

  echo(params: EchoRequestBuilder): PipelineClient<EchoResponseReader> {
    return this._call(
      EchoClient.interfaceId,
      EchoMethodIds.echo,
      params
    ) as PipelineClient<EchoResponseReader>;
  }

  echoStreaming(params: EchoRequestBuilder): PipelineClient<EchoResponseReader> {
    return this._call(
      EchoClient.interfaceId,
      EchoMethodIds.echoStreaming,
      params
    ) as PipelineClient<EchoResponseReader>;
  }
}

// ========================================================================================
// Server Implementation
// ========================================================================================

export class EchoService implements EchoServer {
  private requestCounter = 0;

  async echo(context: CallContext<EchoRequestReader, EchoResponseBuilder>): Promise<void> {
    const params = context.getParams();
    const results = context.getResults();

    const requestId = ++this.requestCounter;
    const message = params.message;
    const delayMs = 0; // params.delayMs;

    // Simulate delay if requested
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    // Set response
    results.setMessage(message);
    results.setTimestamp(BigInt(Date.now()));
    results.setRequestId(requestId);

    context.return();
  }

  async echoStreaming(context: CallContext<EchoRequestReader, EchoResponseBuilder>): Promise<void> {
    // Similar implementation for streaming
    return this.echo(context);
  }
}

// ========================================================================================
// Server Setup
// ========================================================================================

export async function startEchoServer(port: number): Promise<{ stop: () => Promise<void> }> {
  const { WebSocketServer } = await import('ws');
  const wss = new WebSocketServer({ port });

  const echoService = new EchoService();
  const echoStub = new EchoStub(echoService);

  wss.on('connection', (ws) => {
    const transport = new WebSocketTransport(ws);
    const connection = new RpcConnection(transport, {
      bootstrap: echoStub,
    });

    connection.start();

    ws.on('close', () => {
      connection.stop();
    });
  });

  return {
    stop: async () => {
      return new Promise((resolve) => {
        wss.close(() => resolve());
      });
    },
  };
}

// ========================================================================================
// Client Usage
// ========================================================================================

export async function createEchoClient(
  url: string
): Promise<{ client: EchoClient; close: () => Promise<void> }> {
  const transport = await WebSocketTransport.connect(url);
  const connection = new RpcConnection(transport);
  await connection.start();

  // Bootstrap to get the echo capability
  const bootstrap = await connection.bootstrap();
  const client = new EchoClient(connection, bootstrap as number);

  return {
    client,
    close: async () => {
      await connection.stop();
    },
  };
}
