/**
 * Phase 7: Dynamic Schema Usage Example
 *
 * This example demonstrates how to use the Dynamic Schema Transfer Protocol
 * to fetch schema information from a remote server and use it to read/write
 * Cap'n Proto messages at runtime.
 */

import {
  RpcConnection,
  SchemaCapabilityClient,
  SchemaCapabilityServer,
  type SchemaNode,
  SchemaNodeType,
  WebSocketTransport,
  createDynamicReader,
  createDynamicWriter,
} from '@naeemo/capnp';

// ============================================================================
// Example 1: Server-side Schema Provider
// ============================================================================

async function setupSchemaServer() {
  // Define some example schemas
  const personSchema: SchemaNode = {
    id: BigInt('0x1234567890abcdef'),
    displayName: 'example.Person',
    displayNamePrefixLength: 8,
    scopeId: BigInt(0),
    nestedNodes: [],
    annotations: [],
    type: SchemaNodeType.STRUCT,
    structInfo: {
      dataWordCount: 1,
      pointerCount: 2,
      preferredListEncoding: 0,
      isGroup: false,
      discriminantCount: 0,
      discriminantOffset: 0,
      fields: [
        {
          name: 'id',
          codeOrder: 0,
          discriminantValue: 0,
          offset: 0,
          type: { kind: { type: 'uint32' } },
          hadExplicitDefault: false,
        },
        {
          name: 'name',
          codeOrder: 1,
          discriminantValue: 0,
          offset: 64,
          type: { kind: { type: 'text' } },
          hadExplicitDefault: false,
        },
        {
          name: 'email',
          codeOrder: 2,
          discriminantValue: 0,
          offset: 128,
          type: { kind: { type: 'text' } },
          hadExplicitDefault: false,
        },
      ],
    },
  };

  const addressSchema: SchemaNode = {
    id: BigInt('0xfedcba0987654321'),
    displayName: 'example.Address',
    displayNamePrefixLength: 8,
    scopeId: BigInt(0),
    nestedNodes: [],
    annotations: [],
    type: SchemaNodeType.STRUCT,
    structInfo: {
      dataWordCount: 0,
      pointerCount: 3,
      preferredListEncoding: 0,
      isGroup: false,
      discriminantCount: 0,
      discriminantOffset: 0,
      fields: [
        {
          name: 'street',
          codeOrder: 0,
          discriminantValue: 0,
          offset: 0,
          type: { kind: { type: 'text' } },
          hadExplicitDefault: false,
        },
        {
          name: 'city',
          codeOrder: 1,
          discriminantValue: 0,
          offset: 64,
          type: { kind: { type: 'text' } },
          hadExplicitDefault: false,
        },
        {
          name: 'country',
          codeOrder: 2,
          discriminantValue: 0,
          offset: 128,
          type: { kind: { type: 'text' } },
          hadExplicitDefault: false,
        },
      ],
    },
  };

  // Create a registry with the schemas
  const registry = new Map<bigint, SchemaNode>();
  registry.set(personSchema.id, personSchema);
  registry.set(addressSchema.id, addressSchema);

  // Create the schema capability server
  const schemaServer = new SchemaCapabilityServer(registry);

  // Set up the RPC connection with WebSocket transport
  const transport = new WebSocketTransport('ws://localhost:8080');
  const connection = new RpcConnection(transport);

  // Register the schema provider
  connection.registerSchemaProvider(schemaServer);

  // Start the connection
  await connection.start();

  console.log('Schema server started on ws://localhost:8080');
  console.log(`Serving ${schemaServer.getSchemaCount()} schemas`);

  return connection;
}

// ============================================================================
// Example 2: Client-side Schema Fetching
// ============================================================================

async function useDynamicSchemaClient() {
  // Connect to the schema server
  const transport = new WebSocketTransport('ws://localhost:8080');
  const connection = new RpcConnection(transport);
  await connection.start();

  // Create a schema capability client
  const schemaClient = new SchemaCapabilityClient(connection);

  // List all available schemas
  const schemas = await schemaClient.listAvailableSchemas();
  console.log('Available schemas:');
  for (const schema of schemas) {
    console.log(`  - ${schema.displayName} (0x${schema.typeId.toString(16)})`);
  }

  // Fetch a specific schema by ID
  const personSchema = await schemaClient.getSchemaById(BigInt('0x1234567890abcdef'));
  console.log(`\nFetched schema: ${personSchema.displayName}`);
  console.log(`Fields: ${personSchema.structInfo?.fields.map((f) => f.name).join(', ')}`);

  // Fetch by name
  const addressSchema = await schemaClient.getSchemaByName('example.Address');
  console.log(`\nFetched schema: ${addressSchema.displayName}`);

  return { connection, schemaClient, personSchema };
}

// ============================================================================
// Example 3: Dynamic Message Writing
// ============================================================================

function createPersonMessage(schema: SchemaNode) {
  // Create a dynamic writer for the Person schema
  const writer = createDynamicWriter(schema);

  // Set field values by name
  writer.set('id', 42);
  writer.setText('name', 'Alice Smith');
  writer.setText('email', 'alice@example.com');

  // Serialize to buffer
  const buffer = writer.toBuffer();
  console.log(`\nCreated Person message: ${buffer.byteLength} bytes`);

  return buffer;
}

// ============================================================================
// Example 4: Dynamic Message Reading
// ============================================================================

function readPersonMessage(schema: SchemaNode, buffer: ArrayBuffer) {
  // Create a dynamic reader from the schema and buffer
  const reader = createDynamicReader(schema, buffer);

  // Access fields by name
  const id = reader.get('id') as number;
  const name = reader.get('name') as string;
  const email = reader.get('email') as string;

  console.log('\nRead Person message:');
  console.log(`  ID: ${id}`);
  console.log(`  Name: ${name}`);
  console.log(`  Email: ${email}`);

  // Get all field names
  const fields = reader.getFieldNames();
  console.log(`\nAll fields: ${fields.join(', ')}`);

  return { id, name, email };
}

// ============================================================================
// Example 5: Working with Lists
// ============================================================================

function createMessageWithList() {
  const schema: SchemaNode = {
    id: BigInt('0x1111111111111111'),
    displayName: 'example.Team',
    displayNamePrefixLength: 8,
    scopeId: BigInt(0),
    nestedNodes: [],
    annotations: [],
    type: SchemaNodeType.STRUCT,
    structInfo: {
      dataWordCount: 1,
      pointerCount: 1,
      preferredListEncoding: 0,
      isGroup: false,
      discriminantCount: 0,
      discriminantOffset: 0,
      fields: [
        {
          name: 'name',
          codeOrder: 0,
          discriminantValue: 0,
          offset: 0,
          type: { kind: { type: 'text' } },
          hadExplicitDefault: false,
        },
        {
          name: 'members',
          codeOrder: 1,
          discriminantValue: 0,
          offset: 64,
          type: { kind: { type: 'list', elementType: { kind: { type: 'text' } } } },
          hadExplicitDefault: false,
        },
        {
          name: 'count',
          codeOrder: 2,
          discriminantValue: 0,
          offset: 32,
          type: { kind: { type: 'uint32' } },
          hadExplicitDefault: false,
        },
      ],
    },
  };

  const writer = createDynamicWriter(schema);
  writer.setText('name', 'Engineering Team');
  writer.set('count', 3);

  // Initialize and populate the list
  const listWriter = writer.initList('members', 3);
  listWriter.set(0, 'Alice');
  listWriter.set(1, 'Bob');
  listWriter.set(2, 'Charlie');

  const buffer = writer.toBuffer();

  // Read back
  const reader = createDynamicReader(schema, buffer);
  const teamName = reader.get('name');
  const members = reader.getList('members') as string[];

  console.log('\nTeam:');
  console.log(`  Name: ${teamName}`);
  console.log(`  Members: ${members.join(', ')}`);

  return buffer;
}

// ============================================================================
// Example 6: Using RpcConnection Directly
// ============================================================================

async function useConnectionDirectly() {
  const transport = new WebSocketTransport('ws://localhost:8080');
  const connection = new RpcConnection(transport);
  await connection.start();

  // Fetch schema directly through the connection
  const typeId = BigInt('0x1234567890abcdef');

  try {
    const schema = await connection.getDynamicSchema(typeId);
    console.log(`\nFetched schema via connection: ${schema.displayName}`);

    // Check if schema is cached
    if (connection.hasCachedSchema(typeId)) {
      console.log('Schema is now cached');
    }

    // Get the registry
    const registry = connection.getSchemaRegistry();
    console.log(`Registry has ${registry.hasNode(typeId) ? 'the' : 'no'} schema`);
  } catch (error) {
    console.error('Failed to fetch schema:', error);
  }

  return connection;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('=== Dynamic Schema Transfer Protocol Examples ===\n');

  // Note: These examples require a running WebSocket server
  // For demonstration purposes, we'll just show the code structure

  console.log('Example 1: Server-side setup');
  console.log('----------------------------');
  console.log('See setupSchemaServer() function\n');

  console.log('Example 2: Client-side schema fetching');
  console.log('--------------------------------------');
  console.log('See useDynamicSchemaClient() function\n');

  console.log('Example 3: Dynamic message writing');
  console.log('----------------------------------');
  // Create a sample schema for demonstration
  const sampleSchema: SchemaNode = {
    id: BigInt('0x1234567890abcdef'),
    displayName: 'example.Person',
    displayNamePrefixLength: 8,
    scopeId: BigInt(0),
    nestedNodes: [],
    annotations: [],
    type: SchemaNodeType.STRUCT,
    structInfo: {
      dataWordCount: 1,
      pointerCount: 2,
      preferredListEncoding: 0,
      isGroup: false,
      discriminantCount: 0,
      discriminantOffset: 0,
      fields: [
        {
          name: 'id',
          codeOrder: 0,
          discriminantValue: 0,
          offset: 0,
          type: { kind: { type: 'uint32' } },
          hadExplicitDefault: false,
        },
        {
          name: 'name',
          codeOrder: 1,
          discriminantValue: 0,
          offset: 64,
          type: { kind: { type: 'text' } },
          hadExplicitDefault: false,
        },
        {
          name: 'email',
          codeOrder: 2,
          discriminantValue: 0,
          offset: 128,
          type: { kind: { type: 'text' } },
          hadExplicitDefault: false,
        },
      ],
    },
  };
  const buffer = createPersonMessage(sampleSchema);

  console.log('\nExample 4: Dynamic message reading');
  console.log('----------------------------------');
  readPersonMessage(sampleSchema, buffer);

  console.log('\nExample 5: Working with lists');
  console.log('-----------------------------');
  createMessageWithList();

  console.log('\n=== Examples Complete ===');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  setupSchemaServer,
  useDynamicSchemaClient,
  createPersonMessage,
  readPersonMessage,
  createMessageWithList,
  useConnectionDirectly,
};
