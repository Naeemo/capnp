/**
 * CallContext
 *
 * Provides context for server-side method handlers.
 * Allows accessing parameters and setting results.
 */

import type { StructBuilder, StructReader } from '../core/index.js';
import type { Payload } from './rpc-types.js';

export interface CallContext<TParams, TResults> {
  /** Get the parameters of the call */
  getParams(): TParams;

  /** Get the results builder to set return values */
  getResults(): TResults;

  /** Complete the call with the current results */
  return(): void;

  /** Complete the call with an exception */
  throwException(
    reason: string,
    type?: 'failed' | 'overloaded' | 'disconnected' | 'unimplemented'
  ): void;
}

/**
 * Implementation of CallContext
 */
export class CallContextImpl<TParams extends StructReader, TResults extends StructBuilder>
  implements CallContext<TParams, TResults>
{
  private params: TParams;
  private results: TResults;
  private returned = false;
  private exception?: { reason: string; type: string };

  constructor(paramsReader: TParams, resultsBuilder: TResults) {
    this.params = paramsReader;
    this.results = resultsBuilder;
  }

  getParams(): TParams {
    return this.params;
  }

  getResults(): TResults {
    return this.results;
  }

  return(): void {
    if (this.returned) {
      throw new Error('Call already returned');
    }
    this.returned = true;
  }

  throwException(
    reason: string,
    type: 'failed' | 'overloaded' | 'disconnected' | 'unimplemented' = 'failed'
  ): void {
    if (this.returned) {
      throw new Error('Call already returned');
    }
    this.returned = true;
    this.exception = { reason, type };
  }

  isReturned(): boolean {
    return this.returned;
  }

  getException(): { reason: string; type: string } | undefined {
    return this.exception;
  }
}
