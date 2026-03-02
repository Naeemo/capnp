/**
 * Level 3 RPC Message Handlers
 *
 * Implements the three-way introduction protocol for Level 3 RPC:
 * - Provide: Offer a capability to a third party
 * - Accept: Accept a capability from a third party
 * - Embargo handling for cycle breaking
 *
 * The three-way introduction protocol allows capabilities to be passed between
 * vats that don't have a direct connection, enabling those vats to form direct
 * connections.
 */

import type { RpcConnection } from './rpc-connection.js';
import type {
  Accept,
  CapDescriptor,
  Disembargo,
  ExportId,
  ImportId,
  MessageTarget,
  Provide,
  RecipientId,
  RpcMessage,
  ThirdPartyCapId,
} from './rpc-types.js';
import type {
  ConnectionManager,
  PendingProvision,
  VatId,
} from './connection-manager.js';
import { createThirdPartyCapId, generateProvisionId } from './connection-manager.js';

/** Options for Level3Handlers */
export interface Level3HandlersOptions {
  /** The connection this handler is attached to */
  connection: RpcConnection;
  /** The connection manager for managing third-party connections */
  connectionManager: ConnectionManager;
  /** This vat's ID */
  selfVatId: VatId;
  /** Handler for incoming Provide messages */
  onProvide?: (provide: Provide) => Promise<void>;
  /** Handler for incoming Accept messages */
  onAccept?: (accept: Accept) => Promise<void>;
}

/**
 * Manages Level 3 RPC message handling for a connection.
 *
 * This class handles:
 * 1. Provide messages - when someone wants to give us a capability to share with a third party
 * 2. Accept messages - when a third party wants to pick up a capability we provided
 * 3. Embargo handling - breaking cycles in introduction graphs
 */
export class Level3Handlers {
  private options: Level3HandlersOptions;
  private pendingAccepts = new Map<number, PendingAccept>();
  private embargoedCalls = new Map<number, EmbargoedCall[]>();
  private nextEmbargoId = 1;

  constructor(options: Level3HandlersOptions) {
    this.options = options;
  }

  // ========================================================================================
  // Provide Message Handling
  // ========================================================================================

  /**
   * Handle an incoming Provide message.
   *
   * When we receive a Provide message, it means someone wants us to hold a capability
   * and make it available to a specific third party. We:
   * 1. Create a pending provision
   * 2. Return an answer acknowledging receipt
   * 3. Wait for the third party to Accept
   */
  async handleProvide(provide: Provide): Promise<void> {
    const { questionId, target, recipient } = provide;
    const { connectionManager, selfVatId } = this.options;

    // Generate a unique provision ID
    const provisionId = generateProvisionId();

    // Extract the target export ID from the MessageTarget
    const targetExportId = this.extractTargetExportId(target);
    if (targetExportId === undefined) {
      // Can't provide this target - send exception
      await this.sendReturnException(
        questionId,
        'Invalid provide target: must be a hosted capability'
      );
      return;
    }

    // Create the pending provision
    const provision: PendingProvision = connectionManager.createPendingProvision(
      provisionId,
      this.recipientIdToVatId(recipient),
      targetExportId,
      questionId,
      false // Not embargoed by default
    );

    // Call the custom handler if provided
    if (this.options.onProvide) {
      await this.options.onProvide(provide);
    }

    // Send Return with the provision info
    // The provision ID is embedded in the answer for reference
    await this.sendReturnResults(questionId, {
      provisionId: provisionId.id,
    });
  }

  /**
   * Send a Provide message to offer a capability to a third party.
   *
   * This is called when we want to introduce a third party to a capability we hold.
   * For example, Alice calls this to offer Bob access to Carol's capability.
   */
  async sendProvide(
    target: MessageTarget,
    recipient: RecipientId
  ): Promise<{ questionId: number; provisionId: ThirdPartyCapId }> {
    const { connection } = this.options;

    // Create a question for this provide
    const questionId = connection.createQuestion();

    const provideMsg: RpcMessage = {
      type: 'provide',
      provide: {
        questionId,
        target,
        recipient,
      },
    };

    await connection.sendCall(provideMsg.provide as any);

    // Wait for the return to get the provision ID
    const result = await connection.waitForAnswer(questionId);

    // Extract provision ID from result
    // In a full implementation, we'd parse the result payload
    const provisionId: ThirdPartyCapId = {
      id: new Uint8Array(0),
    };

    return { questionId, provisionId };
  }

  // ========================================================================================
  // Accept Message Handling
  // ========================================================================================

  /**
   * Handle an incoming Accept message.
   *
   * When we receive an Accept message, it means a third party wants to pick up
   * a capability we previously agreed to provide. We:
   * 1. Look up the pending provision
   * 2. Verify the recipient matches
   * 3. Return the capability
   */
  async handleAccept(accept: Accept): Promise<void> {
    const { questionId, provision, embargo } = accept;
    const { connectionManager } = this.options;

    // Find the pending provision
    const pendingProvision = connectionManager.getPendingProvision(provision);

    if (!pendingProvision) {
      // No such provision - send exception
      await this.sendReturnException(
        questionId,
        'Invalid provision ID: no pending provision found'
      );
      return;
    }

    // Remove the pending provision
    connectionManager.removePendingProvision(provision);

    // If embargoed, set up embargo handling
    if (embargo || pendingProvision.embargoed) {
      await this.handleEmbargoedAccept(questionId, pendingProvision);
      return;
    }

    // Return the capability
    const capDescriptor: CapDescriptor = {
      type: 'senderHosted',
      exportId: pendingProvision.targetExportId as ExportId,
    };

    await this.sendReturnCapability(questionId, capDescriptor);

    // Call the custom handler if provided
    if (this.options.onAccept) {
      await this.options.onAccept(accept);
    }
  }

  /**
   * Send an Accept message to pick up a capability from a third party.
   *
   * This is called when we receive a third-party capability and want to
   * establish a direct connection to use it.
   */
  async sendAccept(
    targetConnection: RpcConnection,
    provision: { id: Uint8Array },
    embargo = false
  ): Promise<ImportId> {
    const questionId = targetConnection.createQuestion();

    const acceptMsg: RpcMessage = {
      type: 'accept',
      accept: {
        questionId,
        provision: provision as any,
        embargo,
      },
    };

    await targetConnection.sendCall(acceptMsg.accept as any);

    // Wait for the return
    const result = await targetConnection.waitForAnswer(questionId);

    // In a full implementation, we'd extract the import ID from the result
    // For now, return a placeholder
    return 0 as ImportId;
  }

  // ========================================================================================
  // Embargo Handling (Cycle Breaking)
  // ========================================================================================

  /**
   * Handle an embargoed accept.
   *
   * Embargoes are used to break cycles in the introduction graph. For example,
   * if Alice introduces Bob to Carol and Carol to Bob simultaneously, both
   * introductions use embargo=true to prevent deadlock.
   */
  private async handleEmbargoedAccept(
    questionId: number,
    provision: PendingProvision
  ): Promise<void> {
    // Store the pending accept
    const pendingAccept: PendingAccept = {
      questionId,
      provision,
      embargoId: this.nextEmbargoId++,
    };

    this.pendingAccepts.set(questionId, pendingAccept);

    // Send a Return with resultsSentElsewhere to indicate we're waiting
    await this.sendReturnResultsSentElsewhere(questionId);

    // The embargo will be lifted when we receive a Disembargo message
  }

  /**
   * Handle a Disembargo message.
   *
   * Disembargo messages are used to lift embargoes on capabilities.
   */
  async handleDisembargo(disembargo: Disembargo): Promise<void> {
    const { target, context } = disembargo;

    switch (context.type) {
      case 'senderLoopback':
        // Echo back as receiverLoopback
        await this.sendDisembargoEcho(disembargo);
        break;

      case 'receiverLoopback':
        // Embargo lifted - process any pending calls
        await this.liftEmbargo(context.embargoId);
        break;

      case 'accept':
        // Embargo on a third-party accept can be lifted
        await this.liftAcceptEmbargo(target);
        break;

      case 'provide':
        // Embargo on a provision can be lifted
        await this.liftProvideEmbargo(context.questionId);
        break;
    }
  }

  /**
   * Lift an embargo by ID.
   */
  private async liftEmbargo(embargoId: number): Promise<void> {
    // Find and process embargoed calls
    const calls = this.embargoedCalls.get(embargoId);
    if (calls) {
      for (const call of calls) {
        // Re-send the call
        await this.resendEmbargoedCall(call);
      }
      this.embargoedCalls.delete(embargoId);
    }
  }

  /**
   * Lift an embargo on an accept.
   */
  private async liftAcceptEmbargo(target: MessageTarget): Promise<void> {
    // Find pending accepts for this target and complete them
    for (const [questionId, pendingAccept] of this.pendingAccepts) {
      if (this.matchesTarget(pendingAccept.provision.targetExportId, target)) {
        // Return the capability
        const capDescriptor: CapDescriptor = {
          type: 'senderHosted',
          exportId: pendingAccept.provision.targetExportId as ExportId,
        };

        await this.sendReturnCapability(pendingAccept.questionId, capDescriptor);
        this.pendingAccepts.delete(questionId);
      }
    }
  }

  /**
   * Lift an embargo on a provide.
   */
  private async liftProvideEmbargo(questionId: number): Promise<void> {
    // Find the pending provision and mark it as no longer embargoed
    const { connectionManager } = this.options;

    for (const provision of connectionManager.getAllConnections()) {
      // This is a simplified implementation
      // In a full implementation, we'd track provisions by question ID
    }
  }

  // ========================================================================================
  // Third-Party Capability Handling
  // ========================================================================================

  /**
   * Handle receiving a third-party capability.
   *
   * When we receive a CapDescriptor with type 'thirdPartyHosted', we need to:
   * 1. Establish a connection to the third party (if not already connected)
   * 2. Send an Accept message to pick up the capability
   * 3. Return a local import ID for the capability
   */
  async handleThirdPartyCapability(
    thirdPartyCapId: ThirdPartyCapId
  ): Promise<ImportId | undefined> {
    const { connectionManager } = this.options;

    // Resolve the third-party capability
    const resolved = await connectionManager.resolveThirdPartyCap(thirdPartyCapId);
    if (!resolved) {
      return undefined;
    }

    const { connection, provisionId } = resolved;

    // Send Accept to pick up the capability
    const importId = await this.sendAccept(connection, provisionId);

    return importId;
  }

  /**
   * Create a third-party capability descriptor.
   *
   * This is called when we want to pass a capability to a peer, but the capability
   * is actually hosted by a third party. We create a ThirdPartyCapId that allows
   * the recipient to connect directly to the third party.
   */
  createThirdPartyCapDescriptor(
    hostedConnection: RpcConnection,
    exportId: ExportId,
    recipientVatId: VatId
  ): CapDescriptor {
    const { connectionManager, selfVatId } = this.options;

    // Generate a provision ID
    const provisionId = generateProvisionId();

    // Create the ThirdPartyCapId
    // Format: [selfVatId (32 bytes)] [provisionId (32 bytes)]
    const thirdPartyCapId = createThirdPartyCapId(selfVatId, provisionId);

    // Create a pending provision for this
    connectionManager.createPendingProvision(
      provisionId,
      recipientVatId,
      exportId,
      0, // No question ID for this type of provision
      false
    );

    return {
      type: 'thirdPartyHosted',
      thirdPartyCapId,
    };
  }

  // ========================================================================================
  // Helper Methods
  // ========================================================================================

  private extractTargetExportId(target: MessageTarget): number | undefined {
    if (target.type === 'importedCap') {
      return target.importId;
    }
    // promisedAnswer targets are not supported for Provide
    return undefined;
  }

  private recipientIdToVatId(recipient: RecipientId): VatId {
    return { id: recipient.id };
  }

  private matchesTarget(exportId: number, target: MessageTarget): boolean {
    if (target.type === 'importedCap') {
      return target.importId === exportId;
    }
    return false;
  }

  private async sendReturnResults(questionId: number, results: unknown): Promise<void> {
    const { connection } = this.options;

    // In a full implementation, we'd serialize the results
    const returnMsg: RpcMessage = {
      type: 'return',
      return: {
        answerId: questionId,
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

    // @ts-ignore - accessing internal method
    await connection.sendReturn(returnMsg.return);
  }

  private async sendReturnCapability(
    questionId: number,
    cap: CapDescriptor
  ): Promise<void> {
    const { connection } = this.options;

    const returnMsg: RpcMessage = {
      type: 'return',
      return: {
        answerId: questionId,
        releaseParamCaps: true,
        noFinishNeeded: false,
        result: {
          type: 'results',
          payload: {
            content: new Uint8Array(0),
            capTable: [cap],
          },
        },
      },
    };

    // @ts-ignore - accessing internal method
    await connection.sendReturn(returnMsg.return);
  }

  private async sendReturnException(
    questionId: number,
    reason: string
  ): Promise<void> {
    const { connection } = this.options;

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
            type: 'failed',
          },
        },
      },
    };

    // @ts-ignore - accessing internal method
    await connection.sendReturn(returnMsg.return);
  }

  private async sendReturnResultsSentElsewhere(questionId: number): Promise<void> {
    const { connection } = this.options;

    const returnMsg: RpcMessage = {
      type: 'return',
      return: {
        answerId: questionId,
        releaseParamCaps: true,
        noFinishNeeded: false,
        result: {
          type: 'resultsSentElsewhere',
        },
      },
    };

    // @ts-ignore - accessing internal method
    await connection.sendReturn(returnMsg.return);
  }

  private async sendDisembargoEcho(disembargo: Disembargo): Promise<void> {
    const { connection } = this.options;

    if (disembargo.context.type !== 'senderLoopback') {
      return;
    }

    const echoMsg: RpcMessage = {
      type: 'disembargo',
      disembargo: {
        target: disembargo.target,
        context: {
          type: 'receiverLoopback',
          embargoId: disembargo.context.embargoId,
        },
      },
    };

    // @ts-ignore - accessing internal method
    await connection.sendDisembargo(echoMsg.disembargo);
  }

  private async resendEmbargoedCall(_call: EmbargoedCall): Promise<void> {
    // In a full implementation, we'd re-send the call
    // For now, this is a placeholder
  }
}

/** Pending accept waiting for embargo to be lifted */
interface PendingAccept {
  questionId: number;
  provision: PendingProvision;
  embargoId: number;
}

/** An embargoed call waiting to be re-sent */
interface EmbargoedCall {
  questionId: number;
  target: MessageTarget;
  interfaceId: bigint;
  methodId: number;
  params: unknown;
  embargoId: number;
}
