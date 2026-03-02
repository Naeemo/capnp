/**
 * Echo Service Test
 *
 * Simple test for RPC message handling without actual network transport.
 */

import { describe, expect, it } from 'vitest';
import { AnswerTable, QuestionTable } from './four-tables.js';
import type { Payload, RpcMessage } from './rpc-types.js';

describe('Echo Service (Simulated)', () => {
  it('should simulate a bootstrap request/response', async () => {
    // Server-side answer table
    const serverAnswers = new AnswerTable();

    // Client-side question table
    const clientQuestions = new QuestionTable();

    // Simulate client sending bootstrap
    const clientQuestion = clientQuestions.create();
    const bootstrapRequest: RpcMessage = {
      type: 'bootstrap',
      bootstrap: {
        questionId: clientQuestion.id,
      },
    };

    // Simulate server receiving bootstrap
    expect(bootstrapRequest.type).toBe('bootstrap');
    expect(bootstrapRequest.bootstrap.questionId).toBe(1);

    // Server creates answer entry
    serverAnswers.create(bootstrapRequest.bootstrap.questionId);

    // Server sends return
    const returnMsg: RpcMessage = {
      type: 'return',
      return: {
        answerId: bootstrapRequest.bootstrap.questionId,
        releaseParamCaps: true,
        noFinishNeeded: false,
        result: {
          type: 'results',
          payload: {
            content: new Uint8Array([1, 2, 3]), // Mock capability
            capTable: [],
          },
        },
      },
    };

    // Simulate client receiving return
    expect(returnMsg.type).toBe('return');
    expect(returnMsg.return.answerId).toBe(clientQuestion.id);

    // Client completes the question
    clientQuestions.complete(clientQuestion.id, returnMsg.return.result);

    expect(clientQuestion.isComplete).toBe(true);
    await expect(clientQuestion.completionPromise).resolves.toBeDefined();
  });

  it('should simulate a call/return exchange', async () => {
    const clientQuestions = new QuestionTable();
    const serverAnswers = new AnswerTable();

    // Client makes a call
    const question = clientQuestions.create();
    const params: Payload = {
      content: new TextEncoder().encode('hello'),
      capTable: [],
    };

    const callMsg: RpcMessage = {
      type: 'call',
      call: {
        questionId: question.id,
        target: { type: 'importedCap', importId: 1 },
        interfaceId: BigInt(0x12345678),
        methodId: 0,
        allowThirdPartyTailCall: false,
        noPromisePipelining: false,
        onlyPromisePipeline: false,
        params,
        sendResultsTo: { type: 'caller' },
      },
    };

    // Server receives call
    expect(callMsg.type).toBe('call');
    expect(callMsg.call.params.content).toEqual(params.content);

    // Server processes and responds
    serverAnswers.create(callMsg.call.questionId);

    const returnMsg: RpcMessage = {
      type: 'return',
      return: {
        answerId: callMsg.call.questionId,
        releaseParamCaps: true,
        noFinishNeeded: false,
        result: {
          type: 'results',
          payload: {
            content: new TextEncoder().encode('hello back'),
            capTable: [],
          },
        },
      },
    };

    // Client receives return
    clientQuestions.complete(question.id, returnMsg.return.result);

    const result = (await question.completionPromise) as { type: string; payload: Payload };
    expect(result.type).toBe('results');
    expect(new TextDecoder().decode(result.payload.content)).toBe('hello back');
  });

  it('should handle call cancellation', async () => {
    const clientQuestions = new QuestionTable();
    const question = clientQuestions.create();

    // Client cancels the call
    clientQuestions.cancel(question.id, new Error('User canceled'));

    expect(question.isComplete).toBe(true);
    await expect(question.completionPromise).rejects.toThrow('User canceled');
  });

  it('should handle exception responses', async () => {
    const clientQuestions = new QuestionTable();
    const question = clientQuestions.create();

    const returnMsg: RpcMessage = {
      type: 'return',
      return: {
        answerId: question.id,
        releaseParamCaps: true,
        noFinishNeeded: false,
        result: {
          type: 'exception',
          exception: {
            reason: 'Method not found',
            type: 'unimplemented',
          },
        },
      },
    };

    const result = returnMsg.return.result;
    const errorMessage = result.type === 'exception' ? result.exception.reason : 'Unknown error';
    clientQuestions.cancel(question.id, new Error(errorMessage));

    await expect(question.completionPromise).rejects.toThrow('Method not found');
  });
});
