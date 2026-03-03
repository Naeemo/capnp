/**
 * Dynamic Reader/Writer Example
 *
 * This example demonstrates how to use the dynamic reader and writer
 * to read and write Cap'n Proto messages without compile-time type information.
 */

import {
  type SchemaNode,
  SchemaNodeType,
  createDynamicReader,
  createDynamicWriter,
  dumpDynamicReader,
} from '../src/index.js';

// Example: Define a schema at runtime
const personSchema: SchemaNode = {
  id: BigInt('0x123456789abcdef0'),
  displayName: 'Person',
  displayNamePrefixLength: 0,
  scopeId: BigInt(0),
  nestedNodes: [],
  annotations: [],
  type: SchemaNodeType.STRUCT,
  structInfo: {
    dataWordCount: 1, // 1 data word = 64 bits
    pointerCount: 2, // 2 pointers (name and email)
    preferredListEncoding: 0,
    isGroup: false,
    discriminantCount: 0,
    discriminantOffset: 0,
    fields: [
      // Age field: int32 at bits 0-31
      {
        name: 'age',
        codeOrder: 0,
        discriminantValue: 0,
        offset: 0,
        type: { kind: { type: 'int32' } },
        hadExplicitDefault: false,
      },
      // Active field: bool at bit 32
      {
        name: 'active',
        codeOrder: 1,
        discriminantValue: 0,
        offset: 32,
        type: { kind: { type: 'bool' } },
        hadExplicitDefault: false,
      },
      // Name field: text at pointer 0 (offset = dataWordCount * 64 = 64)
      {
        name: 'name',
        codeOrder: 2,
        discriminantValue: 0,
        offset: 64,
        type: { kind: { type: 'text' } },
        hadExplicitDefault: false,
      },
      // Email field: text at pointer 1 (offset = 64 + 64 = 128)
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

// Example: Create a dynamic writer and serialize data
function exampleWrite() {
  console.log('=== Dynamic Writer Example ===');

  // Create a dynamic writer from the schema
  const writer = createDynamicWriter(personSchema);

  // Set fields dynamically
  writer.set('age', 30);
  writer.set('active', true);
  writer.setText('name', 'John Doe');
  writer.setText('email', 'john@example.com');

  // Serialize to buffer
  const buffer = writer.toBuffer();
  console.log('Serialized message size:', buffer.byteLength, 'bytes');

  return buffer;
}

// Example: Create a dynamic reader and read data
function exampleRead(buffer: ArrayBuffer) {
  console.log('\n=== Dynamic Reader Example ===');

  // Create a dynamic reader from the schema and buffer
  const reader = createDynamicReader(personSchema, buffer);

  // Read fields dynamically
  console.log('Age:', reader.get('age'));
  console.log('Active:', reader.get('active'));
  console.log('Name:', reader.get('name'));
  console.log('Email:', reader.get('email'));

  // Dump all fields
  console.log('\nAll fields:');
  console.log(dumpDynamicReader(reader));
}

// Example: Working with lists
function exampleWithLists() {
  console.log('\n=== List Example ===');

  // Define a schema with a list field
  const listSchema: SchemaNode = {
    id: BigInt('0xabcdef'),
    displayName: 'NumberList',
    displayNamePrefixLength: 0,
    scopeId: BigInt(0),
    nestedNodes: [],
    annotations: [],
    type: SchemaNodeType.STRUCT,
    structInfo: {
      dataWordCount: 0,
      pointerCount: 1,
      preferredListEncoding: 0,
      isGroup: false,
      discriminantCount: 0,
      discriminantOffset: 0,
      fields: [
        {
          name: 'numbers',
          codeOrder: 0,
          discriminantValue: 0,
          offset: 0,
          type: {
            kind: {
              type: 'list',
              elementType: { kind: { type: 'int32' } },
            },
          },
          hadExplicitDefault: false,
        },
      ],
    },
  };

  // Create writer and set list
  const writer = createDynamicWriter(listSchema);
  const listWriter = writer.initList('numbers', 5);
  listWriter.setAll([1, 2, 3, 4, 5]);

  const buffer = writer.toBuffer();
  console.log('List message size:', buffer.byteLength, 'bytes');

  // Read back
  const reader = createDynamicReader(listSchema, buffer);
  const numbers = reader.getList('numbers');
  console.log('Numbers:', numbers);
}

// Run examples
if (import.meta.main) {
  const buffer = exampleWrite();
  exampleRead(buffer);
  exampleWithLists();
}

export { exampleWrite, exampleRead, exampleWithLists };
