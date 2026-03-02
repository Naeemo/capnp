/**
 * Promise Pipelining Implementation
 *
 * Phase 2: Level 1 RPC Feature
 *
 * Promise Pipelining allows making calls on results that haven't arrived yet,
 * dramatically reducing latency in distributed systems.
 *
 * Key concepts:
 * - PipelineClient: A proxy that represents a promised answer
 * - PipelineOp: Operations to transform the promised answer (field access)
 * - Queued calls: Calls made on pipeline clients before the answer arrives
 */

import type { RpcConnection } from './rpc-connection.js';
import type { Call, ImportId, InterfaceId, MethodId, Payload, PromisedAnswer, PromisedAnswerOp, QuestionId } from './rpc-types.js';

// ========================================================================================
// PipelineOp - Operations on promised answers
// ========================================================================================

/**
 * Tracks a chain of operations to apply to a promised answer.
 * This forms the "transform" field in PromisedAnswer.
 */
export class PipelineOpTracker {
  private ops: PromisedAnswerOp[] = [];

  /**
   * Add a no-op (use the result as-is)
   */
  addNoop(): void {
    this.ops.push({ type: 'noop' });
  }

  /**
   * Add a pointer field access operation
   */
  addGetPointerField(fieldIndex: number): void {
    this.ops.push({ type: 'getPointerField', fieldIndex });
  }

  /**
   * Get the current transform chain
   */
  getTransform(): PromisedAnswerOp[] {
    return [...this.ops];
  }

  /**
   * Clone this tracker (for creating derived pipelines)
   */
  clone(): PipelineOpTracker {
    const cloned = new PipelineOpTracker();
    cloned.ops = [...this.ops];
    return cloned;
  }
}

// ========================================================================================
// PipelineClient - Proxy for promised answers
// ========================================================================================

/**
 * Symbol used to identify pipeline clients internally
 */
export const PIPELINE_CLIENT_SYMBOL = Symbol('PipelineClient');

/**
 * Interface for pipeline client capabilities
 */
export interface PipelineClient {
  readonly [PIPELINE_CLIENT_SYMBOL]: true;
  readonly connection: RpcConnection;
  readonly questionId: QuestionId;
  readonly opTracker: PipelineOpTracker;

  /**
   * Make a pipelined call on this promised answer
   */
  call(interfaceId: InterfaceId, methodId: MethodId, params: Payload): Promise<unknown>;

  /**
   * Get a pipeline client for a field of this promised answer
   */
  getPointerField(fieldIndex: number): PipelineClient;
}

/**
 * Options for creating a PipelineClient
 */
export interface PipelineClientOptions {
  connection: RpcConnection;
  questionId: QuestionId;
  opTracker?: PipelineOpTracker;
}

/**
 * Creates a PipelineClient using JavaScript Proxy.
 * The proxy intercepts property accesses to build up the transform chain.
 */
export function createPipelineClient(options: PipelineClientOptions): PipelineClient {
  const { connection, questionId, opTracker = new PipelineOpTracker() } = options;

  // The base pipeline client object
  const baseClient: PipelineClient = {
    [PIPELINE_CLIENT_SYMBOL]: true,
    connection,
    questionId,
    opTracker,

    call(interfaceId: InterfaceId, methodId: MethodId, params: Payload): Promise<unknown> {
      return makePipelinedCall(connection, questionId, opTracker.getTransform(), interfaceId, methodId, params);
    },

    getPointerField(fieldIndex: number): PipelineClient {
      const newTracker = opTracker.clone();
      newTracker.addGetPointerField(fieldIndex);
      return createPipelineClient({
        connection,
        questionId,
        opTracker: newTracker,
      });
    },
  };

  return baseClient;
}

/**
 * Check if a value is a PipelineClient
 */
export function isPipelineClient(value: unknown): value is PipelineClient {
  return typeof value === 'object' && value !== null && PIPELINE_CLIENT_SYMBOL in value;
}

// ========================================================================================
// Pipelined Call Implementation
// ========================================================================================

/**
 * Makes a call on a promised answer (pipeline call).
 * This sends a Call message with target.type = 'promisedAnswer'.
 */
async function makePipelinedCall(
  connection: RpcConnection,
  questionId: QuestionId,
  transform: PromisedAnswerOp[],
  interfaceId: InterfaceId,
  methodId: MethodId,
  params: Payload
): Promise<unknown> {
  // Create a new question for this pipelined call
  const newQuestionId = connection.createQuestion();

  const call: Call = {
    questionId: newQuestionId,
    target: {
      type: 'promisedAnswer',
      promisedAnswer: {
        questionId,
        transform,
      },
    },
    interfaceId,
    methodId,
    allowThirdPartyTailCall: false,
    noPromisePipelining: false,
    onlyPromisePipeline: false,
    params,
    sendResultsTo: { type: 'caller' },
  };

  await connection.sendCall(call);

  // Return a promise that resolves when the answer arrives
  return connection.waitForAnswer(newQuestionId);
}

// ========================================================================================
// Queued Calls Management
// ========================================================================================

/**
 * Represents a queued call waiting for a promise to resolve
 */
export interface QueuedCall {
  interfaceId: InterfaceId;
  methodId: MethodId;
  params: Payload;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

/**
 * Manages calls that were made on a pipeline client before the answer arrived.
 * When the answer arrives, these calls are dispatched to the actual capability.
 */
export class QueuedCallManager {
  private queuedCalls = new Map<QuestionId, QueuedCall[]>();

  /**
   * Queue a call for when the promise resolves
   */
  queueCall(questionId: QuestionId, call: QueuedCall): void {
    const calls = this.queuedCalls.get(questionId) ?? [];
    calls.push(call);
    this.queuedCalls.set(questionId, calls);
  }

  /**
   * Get and clear all queued calls for a question
   */
  dequeueCalls(questionId: QuestionId): QueuedCall[] {
    const calls = this.queuedCalls.get(questionId) ?? [];
    this.queuedCalls.delete(questionId);
    return calls;
  }

  /**
   * Check if there are queued calls for a question
   */
  hasQueuedCalls(questionId: QuestionId): boolean {
    return (this.queuedCalls.get(questionId)?.length ?? 0) > 0;
  }

  /**
   * Clear all queued calls (e.g., on disconnect)
   */
  clear(): void {
    // Reject all pending calls
    for (const calls of this.queuedCalls.values()) {
      for (const call of calls) {
        call.reject(new Error('Connection closed'));
      }
    }
    this.queuedCalls.clear();
  }
}

// ========================================================================================
// Capability Resolution
// ========================================================================================

/**
 * Represents a resolved capability (either a real capability or an error)
 */
export type ResolvedCapability =
  | { type: 'capability'; importId: ImportId }
  | { type: 'exception'; reason: string };

/**
 * Tracks pending pipeline resolutions
 */
export class PipelineResolutionTracker {
  private pendingResolutions = new Map<QuestionId, ResolvedCapability>();

  /**
   * Mark a question as resolved to a capability
   */
  resolveToCapability(questionId: QuestionId, importId: ImportId): void {
    this.pendingResolutions.set(questionId, { type: 'capability', importId });
  }

  /**
   * Mark a question as resolved to an exception
   */
  resolveToException(questionId: QuestionId, reason: string): void {
    this.pendingResolutions.set(questionId, { type: 'exception', reason });
  }

  /**
   * Get the resolution for a question (if available)
   */
  getResolution(questionId: QuestionId): ResolvedCapability | undefined {
    return this.pendingResolutions.get(questionId);
  }

  /**
   * Check if a question has been resolved
   */
  isResolved(questionId: QuestionId): boolean {
    return this.pendingResolutions.has(questionId);
  }

  /**
   * Remove a resolution entry
   */
  remove(questionId: QuestionId): void {
    this.pendingResolutions.delete(questionId);
  }

  /**
   * Clear all resolutions
   */
  clear(): void {
    this.pendingResolutions.clear();
  }
}
