/**
 * Dynamic Schema Client Example
 *
 * This example demonstrates how to use the Phase 7 Dynamic Schema feature
 * to interact with a Cap'n Proto service without compile-time type information.
 *
 * Usage:
 *   1. Start a Cap'n Proto server that supports schema queries
 *   2. Run this example: tsx examples/dynamic-schema-client.ts
 */

import {
  RpcConnection,
  type SchemaNode,
  WebSocketTransport,
  createDynamicReader,
  createDynamicWriter,
  dumpDynamicReader,
} from '../src/index.js';

// Configuration
const SERVER_URL = 'ws://localhost:8080';

/**
 * Example 1: Basic Dynamic Schema Usage
 *
 * Connect to a server and fetch schema information dynamically.
 */
async function example1BasicUsage() {
  console.log('=== Example 1: Basic Dynamic Schema Usage ===\n');

  try {
    // Connect to the server
    const transport = await WebSocketTransport.connect(SERVER_URL);
    const connection = new RpcConnection(transport);
    await connection.start();

    console.log('✅ Connected to server');

    // Fetch schema for a type by its ID
    // In a real scenario, you would know the type ID from documentation
    // or from a previous bootstrap call
    const typeId = 0x1234567890abcdefn; // Example type ID

    try {
      const schema = await connection.getDynamicSchema(typeId);
      console.log(`📋 Fetched schema: ${schema.displayName}`);
      console.log(`   Type: ${schema.type === 1 ? 'struct' : 'other'}`);

      if (schema.structInfo) {
        console.log(`   Data words: ${schema.structInfo.dataWordCount}`);
        console.log(`   Pointers: ${schema.structInfo.pointerCount}`);
        console.log(`   Fields: ${schema.structInfo.fields.length}`);

        // List all fields
        console.log('\n   Fields:');
        for (const field of schema.structInfo.fields) {
          console.log(`     - ${field.name}: ${field.type.kind.type}`);
        }
      }
    } catch (err) {
      console.log('⚠️  Could not fetch schema (server may not support dynamic schema)');
      console.log('   Error:', (err as Error).message);
    }

    await connection.stop();
    console.log('\n✅ Connection closed\n');
  } catch (err) {
    console.error('❌ Connection failed:', (err as Error).message);
    console.log('   Make sure the server is running on', SERVER_URL);
  }
}

/**
 * Example 2: Reading Messages with Dynamic Reader
 *
 * Read a Cap'n Proto message using dynamically loaded schema.
 */
async function example2ReadingMessages() {
  console.log('=== Example 2: Reading Messages with Dynamic Reader ===\n');

  // In a real scenario, you would receive this buffer from a server
  // Here we create a mock buffer for demonstration
  const mockBuffer = new ArrayBuffer(64);

  // Define a schema inline (normally this would come from the server)
  const personSchema: SchemaNode = {
    id: BigInt('0x1234567890abcdef'),
    displayName: 'Person',
    displayNamePrefixLength: 0,
    scopeId: BigInt(0),
    nestedNodes: [],
    annotations: [],
    type: 1, // STRUCT
    structInfo: {
      dataWordCount: 1,
      pointerCount: 2,
      preferredListEncoding: 0,
      isGroup: false,
      discriminantCount: 0,
      discriminantOffset: 0,
      fields: [
        {
          name: 'age',
          codeOrder: 0,
          discriminantValue: 0,
          offset: 0,
          type: { kind: { type: 'int32' } },
          hadExplicitDefault: false,
        },
        {
          name: 'active',
          codeOrder: 1,
          discriminantValue: 0,
          offset: 32,
          type: { kind: { type: 'bool' } },
          hadExplicitDefault: false,
        },
        {
          name: 'name',
          codeOrder: 2,
          discriminantValue: 0,
          offset: 64,
          type: { kind: { type: 'text' } },
          hadExplicitDefault: false,
        },
        {
          name: 'email',
          codeOrder: 3,
          discriminantValue: 0,
          offset: 128,
          type: { kind: { type: 'text' } },
          hadExplicitDefault: false,
        },
      ],
    },
  };

  try {
    // Create a dynamic reader with the schema
    const reader = createDynamicReader(personSchema, mockBuffer);

    console.log('📖 Created dynamic reader');
    console.log('   Schema:', personSchema.displayName);
    console.log('   Available fields:', reader.getFieldNames().join(', '));

    // In a real scenario with actual data, you would read values like this:
    // console.log('   Age:', reader.get('age'));
    // console.log('   Name:', reader.get('name'));

    // Dump all fields (will show default values for mock buffer)
    console.log('\n   Field dump:');
    const dump = dumpDynamicReader(reader);
    console.log('   ', JSON.stringify(dump, null, 2));
  } catch (err) {
    console.error('❌ Error:', (err as Error).message);
  }

  console.log('');
}

/**
 * Example 3: Writing Messages with Dynamic Writer
 *
 * Write a Cap'n Proto message using dynamically loaded schema.
 */
async function example3WritingMessages() {
  console.log('=== Example 3: Writing Messages with Dynamic Writer ===\n');

  const personSchema: SchemaNode = {
    id: BigInt('0x1234567890abcdef'),
    displayName: 'Person',
    displayNamePrefixLength: 0,
    scopeId: BigInt(0),
    nestedNodes: [],
    annotations: [],
    type: 1, // STRUCT
    structInfo: {
      dataWordCount: 1,
      pointerCount: 2,
      preferredListEncoding: 0,
      isGroup: false,
      discriminantCount: 0,
      discriminantOffset: 0,
      fields: [
        {
          name: 'age',
          codeOrder: 0,
          discriminantValue: 0,
          offset: 0,
          type: { kind: { type: 'int32' } },
          hadExplicitDefault: false,
        },
        {
          name: 'active',
          codeOrder: 1,
          discriminantValue: 0,
          offset: 32,
          type: { kind: { type: 'bool' } },
          hadExplicitDefault: false,
        },
        {
          name: 'name',
          codeOrder: 2,
          discriminantValue: 0,
          offset: 64,
          type: { kind: { type: 'text' } },
          hadExplicitDefault: false,
        },
        {
          name: 'email',
          codeOrder: 3,
          discriminantValue: 0,
          offset: 128,
          type: { kind: { type: 'text' } },
          hadExplicitDefault: false,
        },
      ],
    },
  };

  try {
    // Create a dynamic writer
    const writer = createDynamicWriter(personSchema);

    console.log('✏️  Created dynamic writer');

    // Set field values
    writer.set('age', 30);
    writer.set('active', true);
    writer.setText('name', 'John Doe');
    writer.setText('email', 'john@example.com');

    console.log('   Set fields:');
    console.log('     age: 30');
    console.log('     active: true');
    console.log('     name: John Doe');
    console.log('     email: john@example.com');

    // Serialize to buffer
    const buffer = writer.toBuffer();
    console.log(`\n📦 Serialized to buffer: ${buffer.byteLength} bytes`);

    // Read it back to verify
    const reader = createDynamicReader(personSchema, buffer);
    console.log('\n📖 Read back:');
    console.log('   Age:', reader.get('age'));
    console.log('   Active:', reader.get('active'));
    console.log('   Name:', reader.get('name'));
    console.log('   Email:', reader.get('email'));
  } catch (err) {
    console.error('❌ Error:', (err as Error).message);
  }

  console.log('');
}

/**
 * Example 4: Schema Registry and Caching
 *
 * Demonstrate how schema caching works across multiple requests.
 */
async function example4SchemaCaching() {
  console.log('=== Example 4: Schema Registry and Caching ===\n');

  try {
    const transport = await WebSocketTransport.connect(SERVER_URL);
    const connection = new RpcConnection(transport);
    await connection.start();

    console.log('✅ Connected to server');

    // Check if schema is cached
    const typeId = 0x1234567890abcdefn;
    console.log(`📦 Schema cached (before): ${connection.hasCachedSchema(typeId)}`);

    // Get the schema registry
    const registry = connection.getSchemaRegistry();
    console.log(`📋 Registry entries: ${registry.getNodesByFile(BigInt(0)).length}`);

    // In a real scenario, fetching a schema would cache it:
    // await connection.getDynamicSchema(typeId);
    // console.log(`📦 Schema cached (after): ${connection.hasCachedSchema(typeId)}`);

    // Clear the cache
    connection.clearSchemaCache();
    console.log('🧹 Cache cleared');

    await connection.stop();
    console.log('\n✅ Connection closed\n');
  } catch (err) {
    console.error('❌ Connection failed:', (err as Error).message);
  }
}

/**
 * Example 5: Listing Available Schemas
 *
 * Query the server for all available schemas.
 */
async function example5ListingSchemas() {
  console.log('=== Example 5: Listing Available Schemas ===\n');

  try {
    const transport = await WebSocketTransport.connect(SERVER_URL);
    const connection = new RpcConnection(transport);
    await connection.start();

    console.log('✅ Connected to server');
    console.log('📋 Requesting schema list...');

    try {
      const schemas = await connection.listAvailableSchemas();

      console.log(`\n📦 Found ${schemas.length} schemas:`);
      for (const schema of schemas) {
        console.log(`   - ${schema.displayName} (0x${schema.typeId.toString(16)})`);
      }
    } catch (err) {
      console.log('⚠️  Could not list schemas (server may not support this feature)');
      console.log('   Error:', (err as Error).message);
    }

    await connection.stop();
    console.log('\n✅ Connection closed\n');
  } catch (err) {
    console.error('❌ Connection failed:', (err as Error).message);
  }
}

/**
 * Example 6: Using Dynamic Schema with RPC Calls
 *
 * Make an RPC call and parse the result using dynamic schema.
 */
async function example6RpcWithDynamicSchema() {
  console.log('=== Example 6: RPC with Dynamic Schema ===\n');

  try {
    const transport = await WebSocketTransport.connect(SERVER_URL);
    const connection = new RpcConnection(transport);
    await connection.start();

    console.log('✅ Connected to server');
    console.log('📞 Making RPC call...');

    // In a real scenario:
    // 1. Get the bootstrap capability
    // const bootstrap = await connection.bootstrap();
    //
    // 2. Make a call that returns a struct
    // const result = await connection.call(...);
    //
    // 3. Fetch the schema for the result type
    // const resultTypeId = ...; // Extract from response
    // const schema = await connection.getDynamicSchema(resultTypeId);
    //
    // 4. Parse the result using dynamic reader
    // const reader = createDynamicReader(schema, resultBuffer);
    // console.log('Result:', dumpDynamicReader(reader));

    console.log('💡 See code comments for implementation details');

    await connection.stop();
    console.log('\n✅ Connection closed\n');
  } catch (err) {
    console.error('❌ Connection failed:', (err as Error).message);
  }
}

/**
 * Main function - run all examples
 */
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log("║     Cap'n Proto Dynamic Schema Client Examples               ║");
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Run examples
  await example1BasicUsage();
  await example2ReadingMessages();
  await example3WritingMessages();
  await example4SchemaCaching();
  await example5ListingSchemas();
  await example6RpcWithDynamicSchema();

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     All examples completed!                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
}

// Run if executed directly
if (import.meta.main) {
  main().catch(console.error);
}

export {
  example1BasicUsage,
  example2ReadingMessages,
  example3WritingMessages,
  example4SchemaCaching,
  example5ListingSchemas,
  example6RpcWithDynamicSchema,
};
