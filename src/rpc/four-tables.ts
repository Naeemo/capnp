/**
 * The Four Tables
 *
 * Cap'n Proto RPC connections maintain four state tables per connection:
 * - Questions: Outbound calls awaiting answers
 * - Answers: Inbound calls being processed
 * - Imports: Capabilities received from remote
 * - Exports: Capabilities sent to remote
 *
 * See: http://www.erights.org/elib/distrib/captp/4tables.html
 */

import type { AnswerId, ExportId, ImportId, QuestionId, RpcMessage } from './rpc-types.js';

// ========================================================================================
// Question Table
// ========================================================================================

/** Entry in the question table (outbound calls) */
export interface Question {
  id: QuestionId;
  /** Whether the call has completed */
  isComplete: boolean;
  /** Whether a Finish message has been sent */
  finishSent: boolean;
  /** Promise that resolves when the call completes */
  completionPromise: Promise<unknown>;
  /** Resolve function for the completion promise */
  resolveCompletion: (value: unknown) => void;
  /** Reject function for the completion promise */
  rejectCompletion: (error: Error) => void;
}

/** Manages the question table for outbound calls */
export class QuestionTable {
  private questions = new Map<QuestionId, Question>();
  private nextId = 1;

  /** Create a new question entry */
  create(): Question {
    const id = this.allocateId();
    let resolveCompletion: (value: unknown) => void;
    let rejectCompletion: (error: Error) => void;

    const completionPromise = new Promise<unknown>((resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    });

    const question: Question = {
      id,
      isComplete: false,
      finishSent: false,
      completionPromise,
      resolveCompletion: resolveCompletion!,
      rejectCompletion: rejectCompletion!,
    };

    this.questions.set(id, question);
    return question;
  }

  /** Get a question by ID */
  get(id: QuestionId): Question | undefined {
    return this.questions.get(id);
  }

  /** Mark a question as complete */
  complete(id: QuestionId, result: unknown): void {
    const question = this.questions.get(id);
    if (question && !question.isComplete) {
      question.isComplete = true;
      question.resolveCompletion(result);
    }
  }

  /** Mark a question as canceled */
  cancel(id: QuestionId, error: Error): void {
    const question = this.questions.get(id);
    if (question && !question.isComplete) {
      question.isComplete = true;
      question.rejectCompletion(error);
    }
  }

  /** Mark that Finish has been sent for a question */
  markFinishSent(id: QuestionId): void {
    const question = this.questions.get(id);
    if (question) {
      question.finishSent = true;
    }
  }

  /** Remove a question from the table (when both sides are done) */
  remove(id: QuestionId): void {
    const question = this.questions.get(id);
    if (question?.isComplete && question.finishSent) {
      this.questions.delete(id);
    }
  }

  /** Clean up all questions (e.g., on disconnect) */
  clear(): void {
    for (const question of this.questions.values()) {
      if (!question.isComplete) {
        question.rejectCompletion(new Error('Connection closed'));
      }
    }
    this.questions.clear();
    this.nextId = 1;
  }

  private allocateId(): QuestionId {
    // Simple allocation - in production, reuse freed IDs
    return this.nextId++;
  }
}

// ========================================================================================
// Answer Table
// ========================================================================================

/** Entry in the answer table (inbound calls) */
export interface Answer {
  id: AnswerId;
  /** Whether the call has completed */
  isComplete: boolean;
  /** Whether a Return message has been sent */
  returnSent: boolean;
  /** Whether a Finish message has been received */
  finishReceived: boolean;
  /** The result of the call (if complete) */
  result?: unknown;
}

/** Manages the answer table for inbound calls */
export class AnswerTable {
  private answers = new Map<AnswerId, Answer>();

  /** Create a new answer entry */
  create(id: AnswerId): Answer {
    const answer: Answer = {
      id,
      isComplete: false,
      returnSent: false,
      finishReceived: false,
    };
    this.answers.set(id, answer);
    return answer;
  }

  /** Get an answer by ID */
  get(id: AnswerId): Answer | undefined {
    return this.answers.get(id);
  }

  /** Mark that Return has been sent */
  markReturnSent(id: AnswerId): void {
    const answer = this.answers.get(id);
    if (answer) {
      answer.returnSent = true;
    }
  }

  /** Mark that Finish has been received */
  markFinishReceived(id: AnswerId): void {
    const answer = this.answers.get(id);
    if (answer) {
      answer.finishReceived = true;
    }
  }

  /** Remove an answer from the table (when both sides are done) */
  remove(id: AnswerId): void {
    const answer = this.answers.get(id);
    if (answer?.returnSent && answer.finishReceived) {
      this.answers.delete(id);
    }
  }

  /** Clean up all answers (e.g., on disconnect) */
  clear(): void {
    this.answers.clear();
  }
}

// ========================================================================================
// Import Table
// ========================================================================================

/** Entry in the import table (capabilities from remote) */
export interface Import {
  id: ImportId;
  /** Reference count */
  refCount: number;
  /** Whether this is a promise (not yet resolved) */
  isPromise: boolean;
}

/** Manages the import table for capabilities received from remote */
export class ImportTable {
  private imports = new Map<ImportId, Import>();

  /** Add a new import */
  add(id: ImportId, isPromise: boolean): Import {
    const importEntry: Import = {
      id,
      refCount: 1,
      isPromise,
    };
    this.imports.set(id, importEntry);
    return importEntry;
  }

  /** Get an import by ID */
  get(id: ImportId): Import | undefined {
    return this.imports.get(id);
  }

  /** Increment reference count */
  addRef(id: ImportId): void {
    const importEntry = this.imports.get(id);
    if (importEntry) {
      importEntry.refCount++;
    }
  }

  /** Decrement reference count, returns true if refCount reached 0 */
  release(id: ImportId, count: number): boolean {
    const importEntry = this.imports.get(id);
    if (importEntry) {
      importEntry.refCount -= count;
      if (importEntry.refCount <= 0) {
        this.imports.delete(id);
        return true;
      }
    }
    return false;
  }

  /** Mark a promise as resolved */
  markResolved(id: ImportId): void {
    const importEntry = this.imports.get(id);
    if (importEntry) {
      importEntry.isPromise = false;
    }
  }

  /** Clean up all imports (e.g., on disconnect) */
  clear(): void {
    this.imports.clear();
  }
}

// ========================================================================================
// Export Table
// ========================================================================================

/** Entry in the export table (capabilities sent to remote) */
export interface Export {
  id: ExportId;
  /** Reference count */
  refCount: number;
  /** Whether this is a promise (not yet resolved) */
  isPromise: boolean;
  /** The actual capability object */
  capability: unknown;
}

/** Manages the export table for capabilities sent to remote */
export class ExportTable {
  private exports = new Map<ExportId, Export>();
  private nextId = 1;

  /** Add a new export */
  add(capability: unknown, isPromise: boolean): Export {
    const id = this.allocateId();
    const exportEntry: Export = {
      id,
      refCount: 1,
      isPromise,
      capability,
    };
    this.exports.set(id, exportEntry);
    return exportEntry;
  }

  /** Get an export by ID */
  get(id: ExportId): Export | undefined {
    return this.exports.get(id);
  }

  /** Increment reference count */
  addRef(id: ExportId): void {
    const exportEntry = this.exports.get(id);
    if (exportEntry) {
      exportEntry.refCount++;
    }
  }

  /** Decrement reference count, returns true if refCount reached 0 */
  release(id: ExportId, count: number): boolean {
    const exportEntry = this.exports.get(id);
    if (exportEntry) {
      exportEntry.refCount -= count;
      if (exportEntry.refCount <= 0) {
        this.exports.delete(id);
        return true;
      }
    }
    return false;
  }

  /** Mark a promise as resolved */
  markResolved(id: ExportId): void {
    const exportEntry = this.exports.get(id);
    if (exportEntry) {
      exportEntry.isPromise = false;
    }
  }

  /** Clean up all exports (e.g., on disconnect) */
  clear(): void {
    this.exports.clear();
    this.nextId = 1;
  }

  private allocateId(): ExportId {
    // Simple allocation - in production, reuse freed IDs
    return this.nextId++;
  }
}
