/**
 * CapabilityClient
 *
 * Base class for client-side capability references.
 * Provides the foundation for making method calls on remote objects.
 */

import type { RpcConnection } from './rpc-connection.js';
import type { ImportId, InterfaceId, MethodId, Payload } from './rpc-types.js';
import type { PipelineClient } from './pipeline.js';

/** Base interface for all capability clients */
export interface CapabilityClient {
  /** The connection this capability belongs to */
  readonly connection: RpcConnection;

  /** The import ID for this capability (if imported) */
  readonly importId?: ImportId;

  /** Check if this capability is still valid */
  isValid(): boolean;

  /** Release this capability reference */
  release(): void;
}

/** Base class for capability client implementations */
export abstract class BaseCapabilityClient implements CapabilityClient {
  constructor(
    public readonly connection: RpcConnection,
    public readonly importId?: ImportId
  ) {}

  isValid(): boolean {
    // In full implementation, check if the import is still valid
    return true;
  }

  release(): void {
    if (this.importId !== undefined) {
      this.connection.release(this.importId, 1);
    }
  }

  /** Make a method call on this capability and return a PipelineClient */
  protected _call(
    interfaceId: InterfaceId,
    methodId: MethodId,
    params: unknown
  ): PipelineClient {
    if (!this.importId) {
      throw new Error('Cannot call method on capability without import ID');
    }

    // Serialize params to Payload
    const payload = this.serializeParams(params);

    // Use callPipelined to get a PipelineClient
    // Note: callPipelined returns Promise<PipelineClient>, but we need to await it
    // This is a design issue - for now, we throw an error indicating async is needed
    throw new Error('Use _callAsync instead for async call support');
  }

  /** Make an async method call on this capability */
  protected async _callAsync(
    interfaceId: InterfaceId,
    methodId: MethodId,
    params: unknown
  ): Promise<PipelineClient> {
    if (!this.importId) {
      throw new Error('Cannot call method on capability without import ID');
    }

    // Serialize params to Payload
    const payload = this.serializeParams(params);

    // Use callPipelined to get a PipelineClient
    return this.connection.callPipelined(
      this.importId,
      interfaceId,
      methodId,
      payload
    );
  }

  /** Serialize parameters to Payload */
  protected serializeParams(params: unknown): Payload {
    // TODO: Implement proper parameter serialization
    // For now, return empty payload
    return {
      content: new Uint8Array(),
      capTable: [],
    };
  }
}

/** Factory for creating capability clients */
export interface CapabilityClientFactory<T extends CapabilityClient> {
  create(connection: RpcConnection, importId?: ImportId): T;
}
