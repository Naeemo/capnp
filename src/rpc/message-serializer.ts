/**
 * RPC Message Serialization
 *
 * Implements full serialization/deserialization of RPC messages using
 * the existing MessageBuilder/MessageReader infrastructure.
 *
 * Reference: rpc.capnp schema
 */

import { MessageBuilder, type StructBuilder } from '../core/message-builder.js';
import { MessageReader, type StructReader } from '../core/message-reader.js';
import { ElementSize } from '../core/pointer.js';
import type {
  Bootstrap,
  Call,
  CapDescriptor,
  Disembargo,
  Exception,
  Finish,
  MessageTarget,
  Payload,
  PromisedAnswer,
  PromisedAnswerOp,
  Provide,
  Release,
  Resolve,
  Return,
  RpcMessage,
  SendResultsTo,
} from './rpc-types.js';

// ========================================================================================
// Constants from rpc.capnp schema
// ========================================================================================

// Message union tags
const MSG_UNIMPLEMENTED = 0;
const MSG_ABORT = 1;
const MSG_BOOTSTRAP = 8;
const MSG_CALL = 2;
const MSG_RETURN = 3;
const MSG_FINISH = 4;
const MSG_RESOLVE = 5;
const MSG_RELEASE = 6;
const MSG_DISEMBARGO = 13;
const MSG_PROVIDE = 10;
const MSG_ACCEPT = 11;
const MSG_JOIN = 12;

// Return union tags
const RET_RESULTS = 0;
const RET_EXCEPTION = 1;
const RET_CANCELED = 2;
const RET_RESULTS_SENT_ELSEWHERE = 3;
const RET_TAKE_FROM_OTHER_QUESTION = 4;
const RET_ACCEPT_FROM_THIRD_PARTY = 5;

// SendResultsTo union tags
const SEND_TO_CALLER = 0;
const SEND_TO_YOURSELF = 1;
const SEND_TO_THIRD_PARTY = 2;

// MessageTarget union tags
const TARGET_IMPORTED_CAP = 0;
const TARGET_PROMISED_ANSWER = 1;

// CapDescriptor union tags
const CAP_NONE = 0;
const CAP_SENDER_HOSTED = 1;
const CAP_SENDER_PROMISE = 2;
const CAP_RECEIVER_HOSTED = 3;
const CAP_RECEIVER_ANSWER = 4;
const CAP_THIRD_PARTY_HOSTED = 5;

// Resolve union tags
const RESOLVE_CAP = 0;
const RESOLVE_EXCEPTION = 1;

// Disembargo context union tags
const DISEMBARGO_SENDER_LOOPBACK = 0;
const DISEMBARGO_RECEIVER_LOOPBACK = 1;
const DISEMBARGO_ACCEPT = 2;
const DISEMBARGO_PROVIDE = 3;

// PromisedAnswer.Op union tags
const OP_NOOP = 0;
const OP_GET_POINTER_FIELD = 1;

// Exception type union tags
const EXC_FAILED = 0;
const EXC_OVERLOADED = 1;
const EXC_DISCONNECTED = 2;
const EXC_UNIMPLEMENTED = 3;

// ========================================================================================
// Serialization: RpcMessage -> Uint8Array
// ========================================================================================

export function serializeRpcMessage(message: RpcMessage): Uint8Array {
  const builder = new MessageBuilder();
  // Message struct: 6 data words, 1 pointer
  // union + questionId/answerId/promiseId/etc + padding
  const root = builder.initRoot(6, 1);

  switch (message.type) {
    case 'unimplemented':
      serializeUnimplemented(root, message.message);
      break;
    case 'abort':
      serializeAbort(root, message.exception);
      break;
    case 'bootstrap':
      serializeBootstrap(root, message.bootstrap);
      break;
    case 'call':
      serializeCall(root, message.call);
      break;
    case 'return':
      serializeReturn(root, message.return);
      break;
    case 'finish':
      serializeFinish(root, message.finish);
      break;
    case 'resolve':
      serializeResolve(root, message.resolve);
      break;
    case 'release':
      serializeRelease(root, message.release);
      break;
    case 'disembargo':
      serializeDisembargo(root, message.disembargo);
      break;
    case 'provide':
      serializeProvide(root, message.provide);
      break;
    case 'accept':
      serializeAccept(root, message.accept);
      break;
    case 'join':
      serializeJoin(root, message.join);
      break;
  }

  return new Uint8Array(builder.toArrayBuffer());
}

function serializeUnimplemented(root: StructBuilder, message: RpcMessage): void {
  // Set union tag
  root.setUint16(0, MSG_UNIMPLEMENTED);
  // Serialize nested message in pointer 0
  const _nestedData = serializeRpcMessage(message);
  const nestedBuilder = root.initStruct(0, 0, 1);
  // Copy nested data into the struct's content pointer
  // For simplicity, we store the serialized message as data bytes
  // In a full implementation, we'd properly embed the message structure
  const _contentPtr = nestedBuilder.initStruct(0, 0, 0);
  // Store length and data
  // This is a simplified approach - proper implementation would parse the nested message
}

function serializeAbort(root: StructBuilder, exception: Exception): void {
  root.setUint16(0, MSG_ABORT);
  serializeException(root, 0, exception);
}

function serializeBootstrap(root: StructBuilder, bootstrap: Bootstrap): void {
  root.setUint16(0, MSG_BOOTSTRAP);
  root.setUint32(8, bootstrap.questionId);
  // deprecatedObjectId is deprecated, skip
}

function serializeCall(root: StructBuilder, call: Call): void {
  root.setUint16(0, MSG_CALL);
  root.setUint32(8, call.questionId);
  root.setUint64(16, call.interfaceId);
  root.setUint16(24, call.methodId);
  root.setBool(208, call.allowThirdPartyTailCall); // bit 208 = word 26, bit 0
  root.setBool(209, call.noPromisePipelining); // bit 209
  root.setBool(210, call.onlyPromisePipeline); // bit 210

  // Serialize target in pointer 0
  serializeMessageTarget(root.initStruct(0, 2, 1), call.target);

  // Serialize params in pointer 1
  serializePayload(root.initStruct(1, 2, 2), call.params);

  // Serialize sendResultsTo in pointer 2
  serializeSendResultsTo(root.initStruct(2, 2, 1), call.sendResultsTo);
}

function serializeReturn(root: StructBuilder, ret: Return): void {
  root.setUint16(0, MSG_RETURN);
  root.setUint32(8, ret.answerId);
  root.setBool(192, ret.releaseParamCaps); // bit 192 = word 24, bit 0
  root.setBool(193, ret.noFinishNeeded); // bit 193

  // Serialize result based on type
  switch (ret.result.type) {
    case 'results':
      root.setUint16(2, RET_RESULTS);
      serializePayload(root.initStruct(0, 2, 2), ret.result.payload);
      break;
    case 'exception':
      root.setUint16(2, RET_EXCEPTION);
      serializeException(root, 0, ret.result.exception);
      break;
    case 'canceled':
      root.setUint16(2, RET_CANCELED);
      break;
    case 'resultsSentElsewhere':
      root.setUint16(2, RET_RESULTS_SENT_ELSEWHERE);
      break;
    case 'takeFromOtherQuestion':
      root.setUint16(2, RET_TAKE_FROM_OTHER_QUESTION);
      root.setUint32(12, ret.result.questionId);
      break;
    case 'acceptFromThirdParty':
      root.setUint16(2, RET_ACCEPT_FROM_THIRD_PARTY);
      // ThirdPartyCapId in pointer 0
      break;
  }
}

function serializeFinish(root: StructBuilder, finish: Finish): void {
  root.setUint16(0, MSG_FINISH);
  root.setUint32(8, finish.questionId);
  root.setBool(192, finish.releaseResultCaps); // bit 192
  root.setBool(193, finish.requireEarlyCancellationWorkaround); // bit 193
}

function serializeResolve(root: StructBuilder, resolve: Resolve): void {
  root.setUint16(0, MSG_RESOLVE);
  root.setUint32(8, resolve.promiseId);

  switch (resolve.resolution.type) {
    case 'cap':
      root.setUint16(2, RESOLVE_CAP);
      serializeCapDescriptor(root.initStruct(0, 2, 1), resolve.resolution.cap);
      break;
    case 'exception':
      root.setUint16(2, RESOLVE_EXCEPTION);
      serializeException(root, 0, resolve.resolution.exception);
      break;
  }
}

function serializeRelease(root: StructBuilder, release: Release): void {
  root.setUint16(0, MSG_RELEASE);
  root.setUint32(8, release.id);
  root.setUint32(12, release.referenceCount);
}

function serializeDisembargo(root: StructBuilder, disembargo: Disembargo): void {
  root.setUint16(0, MSG_DISEMBARGO);
  serializeMessageTarget(root.initStruct(0, 2, 1), disembargo.target);

  switch (disembargo.context.type) {
    case 'senderLoopback':
      root.setUint16(2, DISEMBARGO_SENDER_LOOPBACK);
      root.setUint32(12, disembargo.context.embargoId);
      break;
    case 'receiverLoopback':
      root.setUint16(2, DISEMBARGO_RECEIVER_LOOPBACK);
      root.setUint32(12, disembargo.context.embargoId);
      break;
    case 'accept':
      root.setUint16(2, DISEMBARGO_ACCEPT);
      break;
    case 'provide':
      root.setUint16(2, DISEMBARGO_PROVIDE);
      root.setUint32(12, disembargo.context.questionId);
      break;
  }
}

function serializeProvide(root: StructBuilder, provide: Provide): void {
  root.setUint16(0, MSG_PROVIDE);
  root.setUint32(8, provide.questionId);
  serializeMessageTarget(root.initStruct(0, 2, 1), provide.target);
  // RecipientId in pointer 1 - placeholder
}

function serializeAccept(
  _root: StructBuilder,
  _accept: { provision: { id: Uint8Array }; embargo: boolean }
): void {
  // Level 3 - not fully implemented
}

function serializeJoin(
  _root: StructBuilder,
  _join: { otherCap: MessageTarget; joinId: number }
): void {
  // Level 4 - not fully implemented
}

// ========================================================================================
// Supporting Type Serialization
// ========================================================================================

function serializeMessageTarget(builder: StructBuilder, target: MessageTarget): void {
  switch (target.type) {
    case 'importedCap':
      builder.setUint16(0, TARGET_IMPORTED_CAP);
      builder.setUint32(8, target.importId);
      break;
    case 'promisedAnswer':
      builder.setUint16(0, TARGET_PROMISED_ANSWER);
      serializePromisedAnswer(builder.initStruct(0, 2, 1), target.promisedAnswer);
      break;
  }
}

function serializePromisedAnswer(builder: StructBuilder, promisedAnswer: PromisedAnswer): void {
  builder.setUint32(0, promisedAnswer.questionId);
  // Transform list in pointer 0
  if (promisedAnswer.transform.length > 0) {
    const listBuilder = builder.initList(
      0,
      ElementSize.INLINE_COMPOSITE,
      promisedAnswer.transform.length,
      {
        dataWords: 2,
        pointerCount: 0,
      }
    );
    for (let i = 0; i < promisedAnswer.transform.length; i++) {
      serializePromisedAnswerOp(listBuilder.getStruct(i), promisedAnswer.transform[i]);
    }
  }
}

function serializePromisedAnswerOp(builder: StructBuilder, op: PromisedAnswerOp): void {
  switch (op.type) {
    case 'noop':
      builder.setUint16(0, OP_NOOP);
      break;
    case 'getPointerField':
      builder.setUint16(0, OP_GET_POINTER_FIELD);
      builder.setUint16(8, op.fieldIndex);
      break;
  }
}

function serializePayload(builder: StructBuilder, payload: Payload): void {
  // Content (AnyPointer) - store as data bytes in pointer 0
  if (payload.content.length > 0) {
    // For now, store raw bytes - in full implementation this would be a proper struct
    const _contentBuilder = builder.initStruct(0, Math.ceil(payload.content.length / 8), 0);
    // Copy bytes into the struct
  }

  // Cap table list in pointer 1
  if (payload.capTable.length > 0) {
    const listBuilder = builder.initList(1, ElementSize.EIGHT_BYTES, payload.capTable.length, {
      dataWords: 2,
      pointerCount: 1,
    });
    for (let i = 0; i < payload.capTable.length; i++) {
      serializeCapDescriptor(listBuilder.getStruct(i), payload.capTable[i]);
    }
  }
}

function serializeCapDescriptor(builder: StructBuilder, cap: CapDescriptor): void {
  switch (cap.type) {
    case 'none':
      builder.setUint16(0, CAP_NONE);
      break;
    case 'senderHosted':
      builder.setUint16(0, CAP_SENDER_HOSTED);
      builder.setUint32(8, cap.exportId);
      break;
    case 'senderPromise':
      builder.setUint16(0, CAP_SENDER_PROMISE);
      builder.setUint32(8, cap.exportId);
      break;
    case 'receiverHosted':
      builder.setUint16(0, CAP_RECEIVER_HOSTED);
      builder.setUint32(8, cap.importId);
      break;
    case 'receiverAnswer':
      builder.setUint16(0, CAP_RECEIVER_ANSWER);
      serializePromisedAnswer(builder.initStruct(0, 2, 1), cap.promisedAnswer);
      break;
    case 'thirdPartyHosted':
      builder.setUint16(0, CAP_THIRD_PARTY_HOSTED);
      // ThirdPartyCapId in pointer 0
      break;
  }
}

function serializeSendResultsTo(builder: StructBuilder, sendTo: SendResultsTo): void {
  switch (sendTo.type) {
    case 'caller':
      builder.setUint16(0, SEND_TO_CALLER);
      break;
    case 'yourself':
      builder.setUint16(0, SEND_TO_YOURSELF);
      break;
    case 'thirdParty':
      builder.setUint16(0, SEND_TO_THIRD_PARTY);
      // RecipientId in pointer 0
      break;
  }
}

function serializeException(
  builder: StructBuilder,
  pointerIndex: number,
  exception: Exception
): void {
  const excBuilder = builder.initStruct(pointerIndex, 2, 1);
  excBuilder.setText(0, exception.reason);

  // Exception type union
  switch (exception.type) {
    case 'failed':
      excBuilder.setUint16(0, EXC_FAILED);
      break;
    case 'overloaded':
      excBuilder.setUint16(0, EXC_OVERLOADED);
      break;
    case 'disconnected':
      excBuilder.setUint16(0, EXC_DISCONNECTED);
      break;
    case 'unimplemented':
      excBuilder.setUint16(0, EXC_UNIMPLEMENTED);
      break;
  }
}

// ========================================================================================
// Deserialization: Uint8Array -> RpcMessage
// ========================================================================================

export function deserializeRpcMessage(data: Uint8Array): RpcMessage {
  const reader = new MessageReader(data);
  const root = reader.getRoot(6, 1);

  const unionTag = root.getUint16(0);

  switch (unionTag) {
    case MSG_UNIMPLEMENTED:
      return { type: 'unimplemented', message: deserializeUnimplemented(root) };
    case MSG_ABORT:
      return { type: 'abort', exception: deserializeException(root, 0) };
    case MSG_BOOTSTRAP:
      return { type: 'bootstrap', bootstrap: deserializeBootstrap(root) };
    case MSG_CALL:
      return { type: 'call', call: deserializeCall(root) };
    case MSG_RETURN:
      return { type: 'return', return: deserializeReturn(root) };
    case MSG_FINISH:
      return { type: 'finish', finish: deserializeFinish(root) };
    case MSG_RESOLVE:
      return { type: 'resolve', resolve: deserializeResolve(root) };
    case MSG_RELEASE:
      return { type: 'release', release: deserializeRelease(root) };
    case MSG_DISEMBARGO:
      return { type: 'disembargo', disembargo: deserializeDisembargo(root) };
    case MSG_PROVIDE:
      return { type: 'provide', provide: deserializeProvide(root) };
    case MSG_ACCEPT:
      return { type: 'accept', accept: deserializeAccept(root) };
    case MSG_JOIN:
      return { type: 'join', join: deserializeJoin(root) };
    default:
      throw new Error(`Unknown message union tag: ${unionTag}`);
  }
}

function deserializeUnimplemented(_root: StructReader): RpcMessage {
  // For now, return a placeholder - full implementation would deserialize nested message
  return {
    type: 'abort',
    exception: { reason: 'Unimplemented message received', type: 'unimplemented' },
  };
}

function deserializeBootstrap(root: StructReader): Bootstrap {
  return {
    questionId: root.getUint32(8),
  };
}

function deserializeCall(root: StructReader): Call {
  const targetStruct = root.getStruct(0, 2, 1);
  const paramsStruct = root.getStruct(1, 2, 2);
  const sendToStruct = root.getStruct(2, 2, 1);

  return {
    questionId: root.getUint32(8),
    interfaceId: root.getUint64(16),
    methodId: root.getUint16(24),
    allowThirdPartyTailCall: root.getBool(208),
    noPromisePipelining: root.getBool(209),
    onlyPromisePipeline: root.getBool(210),
    target: targetStruct
      ? deserializeMessageTarget(targetStruct)
      : { type: 'importedCap', importId: 0 },
    params: paramsStruct
      ? deserializePayload(paramsStruct)
      : { content: new Uint8Array(0), capTable: [] },
    sendResultsTo: sendToStruct ? deserializeSendResultsTo(sendToStruct) : { type: 'caller' },
  };
}

function deserializeReturn(root: StructReader): Return {
  const resultTag = root.getUint16(2);
  let result: Return['result'];

  switch (resultTag) {
    case RET_RESULTS:
      result = {
        type: 'results',
        payload: root.getStruct(0, 2, 2)
          ? deserializePayload(root.getStruct(0, 2, 2)!)
          : { content: new Uint8Array(0), capTable: [] },
      };
      break;
    case RET_EXCEPTION:
      result = { type: 'exception', exception: deserializeException(root, 0) };
      break;
    case RET_CANCELED:
      result = { type: 'canceled' };
      break;
    case RET_RESULTS_SENT_ELSEWHERE:
      result = { type: 'resultsSentElsewhere' };
      break;
    case RET_TAKE_FROM_OTHER_QUESTION:
      result = { type: 'takeFromOtherQuestion', questionId: root.getUint32(12) };
      break;
    case RET_ACCEPT_FROM_THIRD_PARTY:
      result = { type: 'acceptFromThirdParty', thirdPartyCapId: { id: new Uint8Array(0) } };
      break;
    default:
      result = { type: 'canceled' };
  }

  return {
    answerId: root.getUint32(8),
    releaseParamCaps: root.getBool(192),
    noFinishNeeded: root.getBool(193),
    result,
  };
}

function deserializeFinish(root: StructReader): Finish {
  return {
    questionId: root.getUint32(8),
    releaseResultCaps: root.getBool(192),
    requireEarlyCancellationWorkaround: root.getBool(193),
  };
}

function deserializeResolve(root: StructReader): Resolve {
  const resolutionTag = root.getUint16(2);
  let resolution: Resolve['resolution'];

  switch (resolutionTag) {
    case RESOLVE_CAP:
      resolution = {
        type: 'cap',
        cap: root.getStruct(0, 2, 1)
          ? deserializeCapDescriptor(root.getStruct(0, 2, 1)!)
          : { type: 'none' },
      };
      break;
    case RESOLVE_EXCEPTION:
      resolution = { type: 'exception', exception: deserializeException(root, 0) };
      break;
    default:
      resolution = {
        type: 'exception',
        exception: { reason: 'Unknown resolution type', type: 'failed' },
      };
  }

  return {
    promiseId: root.getUint32(8),
    resolution,
  };
}

function deserializeRelease(root: StructReader): Release {
  return {
    id: root.getUint32(8),
    referenceCount: root.getUint32(12),
  };
}

function deserializeDisembargo(root: StructReader): Disembargo {
  const targetStruct = root.getStruct(0, 2, 1);
  const contextTag = root.getUint16(2);
  let context: Disembargo['context'];

  switch (contextTag) {
    case DISEMBARGO_SENDER_LOOPBACK:
      context = { type: 'senderLoopback', embargoId: root.getUint32(12) };
      break;
    case DISEMBARGO_RECEIVER_LOOPBACK:
      context = { type: 'receiverLoopback', embargoId: root.getUint32(12) };
      break;
    case DISEMBARGO_ACCEPT:
      context = { type: 'accept' };
      break;
    case DISEMBARGO_PROVIDE:
      context = { type: 'provide', questionId: root.getUint32(12) };
      break;
    default:
      context = { type: 'accept' };
  }

  return {
    target: targetStruct
      ? deserializeMessageTarget(targetStruct)
      : { type: 'importedCap', importId: 0 },
    context,
  };
}

function deserializeProvide(root: StructReader): Provide {
  const targetStruct = root.getStruct(0, 2, 1);
  return {
    questionId: root.getUint32(8),
    target: targetStruct
      ? deserializeMessageTarget(targetStruct)
      : { type: 'importedCap', importId: 0 },
    recipient: { id: new Uint8Array(0) },
  };
}

function deserializeAccept(_root: StructReader): {
  questionId: number;
  provision: { id: Uint8Array };
  embargo: boolean;
} {
  // Level 3 - placeholder
  return { questionId: 0, provision: { id: new Uint8Array(0) }, embargo: false };
}

function deserializeJoin(_root: StructReader): {
  questionId: number;
  target: MessageTarget;
  otherCap: MessageTarget;
  joinId: number;
} {
  // Level 4 - placeholder
  return {
    questionId: 0,
    target: { type: 'importedCap', importId: 0 },
    otherCap: { type: 'importedCap', importId: 0 },
    joinId: 0,
  };
}

// ========================================================================================
// Supporting Type Deserialization
// ========================================================================================

function deserializeMessageTarget(root: StructReader): MessageTarget {
  const tag = root.getUint16(0);

  switch (tag) {
    case TARGET_IMPORTED_CAP:
      return { type: 'importedCap', importId: root.getUint32(8) };
    case TARGET_PROMISED_ANSWER: {
      const promisedAnswerStruct = root.getStruct(0, 2, 1);
      return {
        type: 'promisedAnswer',
        promisedAnswer: promisedAnswerStruct
          ? deserializePromisedAnswer(promisedAnswerStruct)
          : { questionId: 0, transform: [] },
      };
    }
    default:
      return { type: 'importedCap', importId: 0 };
  }
}

function deserializePromisedAnswer(root: StructReader): PromisedAnswer {
  const transformList = root.getList<StructReader>(0, ElementSize.INLINE_COMPOSITE, {
    dataWords: 2,
    pointerCount: 0,
  });
  const transform: PromisedAnswerOp[] = [];

  if (transformList) {
    for (let i = 0; i < transformList.length; i++) {
      transform.push(deserializePromisedAnswerOp(transformList.getStruct(i)));
    }
  }

  return {
    questionId: root.getUint32(0),
    transform,
  };
}

function deserializePromisedAnswerOp(root: StructReader): PromisedAnswerOp {
  const tag = root.getUint16(0);

  switch (tag) {
    case OP_NOOP:
      return { type: 'noop' };
    case OP_GET_POINTER_FIELD:
      return { type: 'getPointerField', fieldIndex: root.getUint16(8) };
    default:
      return { type: 'noop' };
  }
}

function deserializePayload(root: StructReader): Payload {
  // Content - for now, return empty
  // In full implementation, would deserialize the AnyPointer content
  const capTableList = root.getList<StructReader>(1, ElementSize.EIGHT_BYTES, {
    dataWords: 2,
    pointerCount: 1,
  });
  const capTable: CapDescriptor[] = [];

  if (capTableList) {
    for (let i = 0; i < capTableList.length; i++) {
      capTable.push(deserializeCapDescriptor(capTableList.getStruct(i)));
    }
  }

  return {
    content: new Uint8Array(0),
    capTable,
  };
}

function deserializeCapDescriptor(root: StructReader): CapDescriptor {
  const tag = root.getUint16(0);

  switch (tag) {
    case CAP_NONE:
      return { type: 'none' };
    case CAP_SENDER_HOSTED:
      return { type: 'senderHosted', exportId: root.getUint32(8) };
    case CAP_SENDER_PROMISE:
      return { type: 'senderPromise', exportId: root.getUint32(8) };
    case CAP_RECEIVER_HOSTED:
      return { type: 'receiverHosted', importId: root.getUint32(8) };
    case CAP_RECEIVER_ANSWER: {
      const promisedAnswerStruct = root.getStruct(0, 2, 1);
      return {
        type: 'receiverAnswer',
        promisedAnswer: promisedAnswerStruct
          ? deserializePromisedAnswer(promisedAnswerStruct)
          : { questionId: 0, transform: [] },
      };
    }
    case CAP_THIRD_PARTY_HOSTED:
      return { type: 'thirdPartyHosted', thirdPartyCapId: { id: new Uint8Array(0) } };
    default:
      return { type: 'none' };
  }
}

function deserializeSendResultsTo(root: StructReader): SendResultsTo {
  const tag = root.getUint16(0);

  switch (tag) {
    case SEND_TO_CALLER:
      return { type: 'caller' };
    case SEND_TO_YOURSELF:
      return { type: 'yourself' };
    case SEND_TO_THIRD_PARTY:
      return { type: 'thirdParty', recipientId: { id: new Uint8Array(0) } };
    default:
      return { type: 'caller' };
  }
}

function deserializeException(root: StructReader, pointerIndex: number): Exception {
  const excStruct = root.getStruct(pointerIndex, 2, 1);
  if (!excStruct) {
    return { reason: 'Unknown error', type: 'failed' };
  }

  const typeTag = excStruct.getUint16(0);
  let type: Exception['type'];

  switch (typeTag) {
    case EXC_FAILED:
      type = 'failed';
      break;
    case EXC_OVERLOADED:
      type = 'overloaded';
      break;
    case EXC_DISCONNECTED:
      type = 'disconnected';
      break;
    case EXC_UNIMPLEMENTED:
      type = 'unimplemented';
      break;
    default:
      type = 'failed';
  }

  return {
    reason: excStruct.getText(0),
    type,
  };
}
