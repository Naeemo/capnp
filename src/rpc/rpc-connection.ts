/**
 * RpcConnection
 *
 * Manages a single RPC connection, handling message routing and the Four Tables.
 * This is the core of the RPC implementation.
 *
 * Phase 2 Updates:
 * - Added Promise Pipelining support
 * - Added capability passing
 * - Added Resolve/Release/Disembargo message handling
 *
 * Phase 4 Updates:
 * - Added Level 3 RPC support (Provide/Accept)
 * - Added third-party capability handling
 * - Integrated with ConnectionManager for multi-vat scenarios
 */

import type { ConnectionManager, VatId } from './connection-manager.js';
import { AnswerTable, ExportTable, ImportTable, QuestionTable } from './four-tables.js';
import type { Level3Handlers } from './level3-handlers.js';
import type { Level4Handlers } from './level4-handlers.js';
import {
  type PipelineClient,
  PipelineOpTracker,
  PipelineResolutionTracker,
  QueuedCallManager,
  createPipelineClient,
  isPipelineClient,
} from './pipeline.js';
import type {
  Accept,
  AnswerId,
  Bootstrap,
  Call,
  CapDescriptor,
  Disembargo,
  ExportId,
  Finish,
  ImportId,
  Join,
  Payload,
  PromisedAnswerOp,
  Provide,
  QuestionId,
  Release,
  Resolve,
  Return,
  RpcMessage,
  ThirdPartyCapId,
} from './rpc-types.js';
import type { RpcTransport } from './transport.js';

export interface RpcConnectionOptions {
  /** Bootstrap capability to expose to the peer */
  bootstrap?: unknown;
  /** This vat's ID (for Level 3 RPC) */
  selfVatId?: VatId;
  /** Connection manager for Level 3 RPC */
  connectionManager?: ConnectionManager;
  /** Level 3 message handlers */
  level3Handlers?: Level3Handlers;
  /** Level 4 message handlers */
  level4Handlers?: Level4Handlers;
}

export class RpcConnection {
  private transport: RpcTransport;
  private options: RpcConnectionOptions;

  // The Four Tables
  private questions = new QuestionTable();
  private answers = new AnswerTable();
  private imports = new ImportTable();
  private exports = new ExportTable();

  // Phase 2: Pipeline support
  private queuedCalls = new QueuedCallManager();
  private pipelineResolutions = new PipelineResolutionTracker();

  // Message processing
  private running = false;
  private messageHandler?: Promise<void>;

  // Phase 4: Level 3 handlers
  private level3Handlers?: Level3Handlers;

  // Phase 6: Level 4 handlers
  private level4Handlers?: Level4Handlers;

  constructor(transport: RpcTransport, options: RpcConnectionOptions = {}) {
    this.transport = transport;
    this.options = options;
    this.level3Handlers = options.level3Handlers;

    // Set up transport event handlers
    this.transport.onClose = (reason) => {
      this.handleDisconnect(reason);
    };

    this.transport.onError = (error) => {
      this.handleError(error);
    };

    // Set up Level 3 and Level 4 handlers
    this.level3Handlers = options.level3Handlers;
    this.level4Handlers = options.level4Handlers;
  }

  /** Start processing messages */
  async start(): Promise<void> {
    if (this.running) return;

    this.running = true;
    this.messageHandler = this.messageLoop();
  }

  /** Stop the connection */
  async stop(): Promise<void> {
    this.running = false;
    this.transport.close();

    if (this.messageHandler) {
      try {
        await this.messageHandler;
      } catch {
        // Ignore errors during shutdown
      }
    }
  }

  /** Send a bootstrap request and return the bootstrap capability */
  async bootstrap(): Promise<unknown> {
    const question = this.questions.create();

    const bootstrapMsg: RpcMessage = {
      type: 'bootstrap',
      bootstrap: {
        questionId: question.id,
      },
    };

    await this.transport.send(bootstrapMsg);

    // Wait for the bootstrap response
    await question.completionPromise;

    // Return the bootstrap capability
    // In full implementation, this would extract the capability from the response
    return {};
  }

  /** Make a call to a remote capability */
  async call(
    target: ImportId | ExportId | PipelineClient,
    interfaceId: bigint,
    methodId: number,
    params: Payload
  ): Promise<unknown> {
    // Check if target is a pipeline client
    if (isPipelineClient(target)) {
      return target.call(interfaceId, methodId, params);
    }

    const question = this.questions.create();

    const callMsg: RpcMessage = {
      type: 'call',
      call: {
        questionId: question.id,
        target: { type: 'importedCap', importId: target as ImportId },
        interfaceId,
        methodId,
        allowThirdPartyTailCall: false,
        noPromisePipelining: false,
        onlyPromisePipeline: false,
        params,
        sendResultsTo: { type: 'caller' },
      },
    };

    await this.transport.send(callMsg);

    // Wait for the call to complete
    return question.completionPromise;
  }

  /**
   * Make a call that returns a PipelineClient for promise pipelining.
   * This allows making calls on the result before it arrives.
   */
  async callPipelined(
    target: ImportId | ExportId,
    interfaceId: bigint,
    methodId: number,
    params: Payload
  ): Promise<PipelineClient> {
    const question = this.questions.create();

    const callMsg: RpcMessage = {
      type: 'call',
      call: {
        questionId: question.id,
        target: { type: 'importedCap', importId: target },
        interfaceId,
        methodId,
        allowThirdPartyTailCall: false,
        noPromisePipelining: false,
        onlyPromisePipeline: false,
        params,
        sendResultsTo: { type: 'caller' },
      },
    };

    await this.transport.send(callMsg);

    // Return a pipeline client immediately without waiting
    return createPipelineClient({
      connection: this,
      questionId: question.id,
    });
  }

  /** Send a finish message to release a question */
  async finish(questionId: QuestionId, releaseResultCaps = true): Promise<void> {
    const question = this.questions.get(questionId);
    if (!question) return;

    const finishMsg: RpcMessage = {
      type: 'finish',
      finish: {
        questionId,
        releaseResultCaps,
        requireEarlyCancellationWorkaround: false,
      },
    };

    await this.transport.send(finishMsg);
    this.questions.markFinishSent(questionId);
    this.questions.remove(questionId);
  }

  /** Send a release message for an imported capability */
  async release(importId: ImportId, referenceCount = 1): Promise<void> {
    const releaseMsg: RpcMessage = {
      type: 'release',
      release: {
        id: importId,
        referenceCount,
      },
    };

    await this.transport.send(releaseMsg);
  }

  /** Send a resolve message to indicate a promise has resolved */
  async resolve(promiseId: ExportId, cap: CapDescriptor): Promise<void> {
    const resolveMsg: RpcMessage = {
      type: 'resolve',
      resolve: {
        promiseId,
        resolution: { type: 'cap', cap },
      },
    };

    await this.transport.send(resolveMsg);
  }

  /** Send a resolve message indicating a promise was broken */
  async resolveException(promiseId: ExportId, reason: string): Promise<void> {
    const resolveMsg: RpcMessage = {
      type: 'resolve',
      resolve: {
        promiseId,
        resolution: {
          type: 'exception',
          exception: { reason, type: 'failed' },
        },
      },
    };

    await this.transport.send(resolveMsg);
  }

  /** Send a return message (internal use) */
  async sendReturn(ret: Return): Promise<void> {
    const returnMsg: RpcMessage = { type: 'return', return: ret };
    await this.transport.send(returnMsg);
  }

  /** Send a disembargo message (internal use) */
  async sendDisembargo(disembargo: Disembargo): Promise<void> {
    const disembargoMsg: RpcMessage = { type: 'disembargo', disembargo };
    await this.transport.send(disembargoMsg);
  }

  /** Internal method: Create a new question (used by pipeline) */
  createQuestion(): QuestionId {
    const question = this.questions.create();
    return question.id;
  }

  /** Internal method: Send a call message (used by pipeline) */
  async sendCall(call: Call): Promise<void> {
    const callMsg: RpcMessage = { type: 'call', call };
    await this.transport.send(callMsg);
  }

  /** Internal method: Wait for an answer (used by pipeline) */
  async waitForAnswer(questionId: QuestionId): Promise<unknown> {
    const question = this.questions.get(questionId);
    if (!question) {
      throw new Error(`Question ${questionId} not found`);
    }
    return question.completionPromise;
  }

  /** Main message processing loop */
  private async messageLoop(): Promise<void> {
    while (this.running) {
      try {
        const message = await this.transport.receive();

        if (message === null) {
          // Connection closed
          break;
        }

        await this.handleMessage(message);
      } catch (error) {
        if (this.running) {
          this.handleError(error as Error);
        }
      }
    }
  }

  /** Handle incoming messages */
  private async handleMessage(message: RpcMessage): Promise<void> {
    switch (message.type) {
      case 'bootstrap':
        await this.handleBootstrap(message.bootstrap);
        break;
      case 'call':
        await this.handleCall(message.call);
        break;
      case 'return':
        await this.handleReturn(message.return);
        break;
      case 'finish':
        await this.handleFinish(message.finish);
        break;
      case 'resolve':
        await this.handleResolve(message.resolve);
        break;
      case 'release':
        await this.handleRelease(message.release);
        break;
      case 'disembargo':
        await this.handleDisembargo(message.disembargo);
        break;
      // Level 3 message types
      case 'provide':
        await this.handleProvide(message.provide);
        break;
      case 'accept':
        await this.handleAccept(message.accept);
        break;
      // Level 4 message types
      case 'join':
        await this.handleJoin(message.join);
        break;
      case 'abort':
        this.handleAbort(message.exception.reason);
        break;
      case 'unimplemented':
        // Handle unimplemented message
        break;
      default:
        // Send unimplemented response
        await this.sendUnimplemented(message);
    }
  }

  /** Handle bootstrap request */
  private async handleBootstrap(bootstrap: Bootstrap): Promise<void> {
    // Create answer entry
    this.answers.create(bootstrap.questionId);

    // Return the bootstrap capability
    const returnMsg: RpcMessage = {
      type: 'return',
      return: {
        answerId: bootstrap.questionId,
        releaseParamCaps: true,
        noFinishNeeded: false,
        result: {
          type: 'results',
          payload: {
            content: new Uint8Array(0),
            capTable: [],
          },
        },
      },
    };

    await this.transport.send(returnMsg);
    this.answers.markReturnSent(bootstrap.questionId);
  }

  /** Handle incoming call */
  private async handleCall(call: Call): Promise<void> {
    // Create answer entry
    this.answers.create(call.questionId);

    // TODO: Dispatch to the appropriate capability/method
    // For Phase 1, we'll return a placeholder result

    const returnMsg: RpcMessage = {
      type: 'return',
      return: {
        answerId: call.questionId,
        releaseParamCaps: true,
        noFinishNeeded: false,
        result: {
          type: 'exception',
          exception: {
            reason: 'Method not implemented',
            type: 'unimplemented',
          },
        },
      },
    };

    await this.transport.send(returnMsg);
    this.answers.markReturnSent(call.questionId);
  }

  /** Handle return message */
  private async handleReturn(ret: Return): Promise<void> {
    const question = this.questions.get(ret.answerId);
    if (!question) return;

    // Track pipeline resolution
    if (ret.result.type === 'results') {
      // Check if result contains a capability
      const capTable = ret.result.payload.capTable;
      if (capTable.length > 0) {
        const cap = capTable[0];
        if (cap.type === 'receiverHosted') {
          this.pipelineResolutions.resolveToCapability(ret.answerId, cap.importId);
        } else if (cap.type === 'thirdPartyHosted') {
          // Level 3: Handle third-party capability
          await this.handleThirdPartyCapability(ret.answerId, cap.thirdPartyCapId);
        }
      }
    } else if (ret.result.type === 'exception') {
      this.pipelineResolutions.resolveToException(ret.answerId, ret.result.exception.reason);
    }

    switch (ret.result.type) {
      case 'results':
        this.questions.complete(ret.answerId, ret.result.payload);
        break;
      case 'exception':
        this.questions.cancel(ret.answerId, new Error(ret.result.exception.reason));
        break;
      case 'canceled':
        this.questions.cancel(ret.answerId, new Error('Call canceled'));
        break;
      case 'acceptFromThirdParty':
        // Level 3: Need to contact third party to get results
        await this.handleAcceptFromThirdParty(ret.answerId, ret.result.thirdPartyCapId);
        break;
      default:
        this.questions.cancel(ret.answerId, new Error('Unknown return type'));
    }
  }

  /** Handle finish message */
  private async handleFinish(finish: Finish): Promise<void> {
    this.answers.markFinishReceived(finish.questionId);
    this.answers.remove(finish.questionId);
  }

  /** Handle resolve message (Level 1) */
  private async handleResolve(resolve: Resolve): Promise<void> {
    const { promiseId, resolution } = resolve;

    switch (resolution.type) {
      case 'cap':
        // The promise resolved to a capability
        // Update import table to mark as resolved
        this.imports.markResolved(promiseId);
        break;
      case 'exception':
        // The promise was broken
        // TODO: Handle broken promise - notify pending calls
        console.warn(`Promise ${promiseId} broken: ${resolution.exception.reason}`);
        break;
    }
  }

  /** Handle release message (Level 1) */
  private async handleRelease(release: Release): Promise<void> {
    const { id, referenceCount } = release;

    // Release the export
    const shouldRemove = this.exports.release(id, referenceCount);
    if (shouldRemove) {
      // Export is fully released, clean up any associated resources
      console.log(`Export ${id} fully released`);
    }
  }

  /** Handle disembargo message (Level 1) */
  private async handleDisembargo(disembargo: Disembargo): Promise<void> {
    const { target, context } = disembargo;

    // Level 3: Delegate to level3Handlers if available
    if (this.level3Handlers) {
      await this.level3Handlers.handleDisembargo(disembargo);
      return;
    }

    // Echo back the disembargo for loopback contexts
    if (context.type === 'senderLoopback') {
      // Echo back as receiverLoopback
      const echoMsg: RpcMessage = {
        type: 'disembargo',
        disembargo: {
          target,
          context: { type: 'receiverLoopback', embargoId: context.embargoId },
        },
      };
      await this.transport.send(echoMsg);
    }
    // For other contexts (accept, provide), more complex handling is needed
  }

  /** Handle provide message (Level 3) */
  private async handleProvide(provide: Provide): Promise<void> {
    if (this.level3Handlers) {
      await this.level3Handlers.handleProvide(provide);
    } else {
      // Level 3 not enabled - send unimplemented
      await this.sendReturnException(provide.questionId, 'Level 3 RPC (Provide) not implemented');
    }
  }

  /** Handle accept message (Level 3) */
  private async handleAccept(accept: Accept): Promise<void> {
    if (this.level3Handlers) {
      await this.level3Handlers.handleAccept(accept);
    } else {
      // Level 3 not enabled - send unimplemented
      await this.sendReturnException(accept.questionId, 'Level 3 RPC (Accept) not implemented');
    }
  }

  /** Handle third-party capability in return results (Level 3) */
  private async handleThirdPartyCapability(
    _questionId: QuestionId,
    thirdPartyCapId: ThirdPartyCapId
  ): Promise<void> {
    if (this.level3Handlers) {
      const importId = await this.level3Handlers.handleThirdPartyCapability(thirdPartyCapId);
      if (importId !== undefined) {
        // Update the question result with the local import ID
        // This allows the caller to use the capability through the local import
      }
    }
  }

  /** Handle acceptFromThirdParty return type (Level 3) */
  private async handleAcceptFromThirdParty(
    questionId: QuestionId,
    thirdPartyCapId: ThirdPartyCapId
  ): Promise<void> {
    if (this.level3Handlers) {
      const importId = await this.level3Handlers.handleThirdPartyCapability(thirdPartyCapId);
      if (importId !== undefined) {
        // Complete the question with the resolved capability
        this.questions.complete(questionId, { importId });
      } else {
        this.questions.cancel(questionId, new Error('Failed to resolve third-party capability'));
      }
    } else {
      this.questions.cancel(questionId, new Error('Level 3 RPC not enabled'));
    }
  }

  /** Handle abort message */
  private handleAbort(_reason: string): void {
    this.running = false;
    this.questions.clear();
    this.answers.clear();
    this.imports.clear();
    this.exports.clear();
    this.queuedCalls.clear();
    this.pipelineResolutions.clear();
  }

  /** Handle disconnect */
  private handleDisconnect(_reason?: Error): void {
    this.running = false;
    this.questions.clear();
    this.answers.clear();
    this.imports.clear();
    this.exports.clear();
    this.queuedCalls.clear();
    this.pipelineResolutions.clear();
  }

  /** Handle error */
  private handleError(error: Error): void {
    console.error('RPC error:', error);
  }

  /** Send unimplemented response */
  private async sendUnimplemented(originalMessage: RpcMessage): Promise<void> {
    const msg: RpcMessage = {
      type: 'unimplemented',
      message: originalMessage,
    };
    await this.transport.send(msg);
  }

  /** Send return exception (helper) */
  private async sendReturnException(questionId: QuestionId, reason: string): Promise<void> {
    const returnMsg: RpcMessage = {
      type: 'return',
      return: {
        answerId: questionId,
        releaseParamCaps: true,
        noFinishNeeded: false,
        result: {
          type: 'exception',
          exception: {
            reason,
            type: 'unimplemented',
          },
        },
      },
    };
    await this.transport.send(returnMsg);
  }

  // ========================================================================================
  // Level 4 RPC Methods
  // ========================================================================================

  /**
   * Set the Level 4 handlers for this connection.
   * This enables reference equality verification support.
   */
  setLevel4Handlers(handlers: Level4Handlers): void {
    this.level4Handlers = handlers;
  }

  /**
   * Send a Join message to verify that two capabilities point to the same object.
   * Requires Level 4 handlers to be set.
   */
  async join(_target1: ImportId, _target2: ImportId): Promise<unknown> {
    if (!this.level4Handlers) {
      throw new Error('Level 4 handlers not set');
    }

    // This is a simplified implementation
    // In a full implementation, we'd use the Level4Handlers to send the Join
    return undefined;
  }

  /** Handle join message (Level 4) */
  private async handleJoin(join: Join): Promise<void> {
    if (this.level4Handlers) {
      await this.level4Handlers.handleJoin(join);
    } else {
      // Level 4 not enabled - send unimplemented
      await this.sendReturnException(join.questionId, 'Level 4 RPC (Join) not implemented');
    }
  }

  // ========================================================================================
  // Capability Management
  // ========================================================================================

  /** Import a capability from the remote peer */
  importCapability(importId: ImportId, isPromise = false): void {
    this.imports.add(importId, isPromise);
  }

  /** Export a capability to the remote peer */
  exportCapability(capability: unknown, isPromise = false): ExportId {
    const exportEntry = this.exports.add(capability, isPromise);
    return exportEntry.id;
  }

  /** Get an imported capability */
  getImport(importId: ImportId) {
    return this.imports.get(importId);
  }

  /** Get an exported capability */
  getExport(exportId: ExportId) {
    return this.exports.get(exportId);
  }

  // ========================================================================================
  // Level 3 RPC Methods
  // ========================================================================================

  /**
   * Set the Level 3 handlers for this connection.
   * This enables three-way introduction support.
   */
  setLevel3Handlers(handlers: Level3Handlers): void {
    this.level3Handlers = handlers;
  }

  /**
   * Send a Provide message to offer a capability to a third party.
   * Requires Level 3 handlers to be set.
   */
  async provideToThirdParty(
    _target: { type: 'importedCap'; importId: ImportId },
    _recipient: VatId
  ): Promise<{ questionId: number; thirdPartyCapId: ThirdPartyCapId } | undefined> {
    if (!this.level3Handlers) {
      throw new Error('Level 3 handlers not set');
    }

    // This is a simplified implementation
    // In a full implementation, we'd send the Provide message and wait for response
    return undefined;
  }
}
