/**
 * Phase 2 Promise Pipelining Example
 *
 * This example demonstrates the Promise Pipelining feature of Phase 2.
 */

import { createPipelineClient, isPipelineClient } from '../rpc/pipeline.js';
import { RpcConnection } from '../rpc/rpc-connection.js';
import { WebSocketTransport } from '../rpc/websocket-transport.js';

/**
 * Example: Using Promise Pipelining
 *
 * Scenario: We want to call getDatabase() on a bootstrap capability,
 * then call query() on the returned database, all without waiting
 * for the first call to complete.
 */
async function promisePipeliningExample() {
  // Connect to the server
  const transport = await WebSocketTransport.connect('ws://localhost:8080');
  const connection = new RpcConnection(transport);
  await connection.start();

  try {
    // Get the bootstrap capability
    const bootstrap = await connection.bootstrap();

    // Make a pipelined call - returns immediately with a PipelineClient
    const databasePromise = await connection.callPipelined(
      bootstrap as number, // importId
      BigInt('0x1234567890abcdef'), // Database interface ID
      0, // getDatabase method ID
      { content: new Uint8Array(), capTable: [] }
    );

    // databasePromise is a PipelineClient - we can make calls on it
    // before the actual database capability arrives!
    console.log('Is PipelineClient:', isPipelineClient(databasePromise));

    // Make a pipelined call on the database
    // This sends a Call message with target.promisedAnswer pointing to
    // the previous call's result
    const queryResultPromise = databasePromise.call(
      BigInt('0xfedcba0987654321'), // Query interface ID
      1, // executeQuery method ID
      { content: new Uint8Array(), capTable: [] }
    );

    // We can also access fields of the promised result
    const specificTable = databasePromise.getPointerField(0);

    // And make calls on that field
    const tableResultPromise = specificTable.call(BigInt('0xaaaaaaaaaaaaaaaa'), 2, {
      content: new Uint8Array(),
      capTable: [],
    });

    // Now wait for all results
    const [queryResult, tableResult] = await Promise.all([queryResultPromise, tableResultPromise]);

    console.log('Query result:', queryResult);
    console.log('Table result:', tableResult);
  } finally {
    await connection.stop();
  }
}

/**
 * Example: Pipeline Transform Chain
 *
 * Demonstrates how field access operations are chained.
 */
async function transformChainExample() {
  const transport = await WebSocketTransport.connect('ws://localhost:8080');
  const connection = new RpcConnection(transport);
  await connection.start();

  try {
    const bootstrap = await connection.bootstrap();

    // Start a pipelined call
    const result = await connection.callPipelined(
      bootstrap as number,
      BigInt('0x1234567890abcdef'),
      0,
      { content: new Uint8Array(), capTable: [] }
    );

    // Chain multiple field accesses
    // This builds up a transform chain: [getPointer(0), getPointer(2), getPointer(1)]
    const deepField = result
      .getPointerField(0) // First field
      .getPointerField(2) // Third field of that
      .getPointerField(1); // Second field of that

    // The transform chain will be sent to the server
    const finalResult = await deepField.call(BigInt('0xbbbbbbbbbbbbbbbb'), 0, {
      content: new Uint8Array(),
      capTable: [],
    });

    console.log('Deep field result:', finalResult);
  } finally {
    await connection.stop();
  }
}

/**
 * Example: Capability Lifecycle
 *
 * Demonstrates proper capability management with Release messages.
 */
async function capabilityLifecycleExample() {
  const transport = await WebSocketTransport.connect('ws://localhost:8080');
  const connection = new RpcConnection(transport);
  await connection.start();

  try {
    const bootstrap = await connection.bootstrap();

    // Make a call that returns a capability
    const _result = await connection.call(bootstrap as number, BigInt('0x1234567890abcdef'), 0, {
      content: new Uint8Array(),
      capTable: [],
    });

    // The result contains a capability in its capTable
    // We would extract it and use it...

    // When done, release the capability
    // This sends a Release message to the server
    await connection.release(1, 1); // importId=1, referenceCount=1
  } finally {
    await connection.stop();
  }
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Promise Pipelining Example');
  console.log('==========================');
  console.log();
  console.log('This example demonstrates Phase 2 features:');
  console.log('1. Promise Pipelining - make calls on results before they arrive');
  console.log('2. Transform chains - access nested fields of promised results');
  console.log('3. Capability lifecycle - proper release of capabilities');
  console.log();
  console.log('Note: This requires a running RPC server on ws://localhost:8080');
  console.log();

  // Uncomment to run:
  // promisePipeliningExample().catch(console.error);
}

export { promisePipeliningExample, transformChainExample, capabilityLifecycleExample };
