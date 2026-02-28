import { MessageReader, MessageBuilder } from '@capnp-ts/core';

// Example: Simple address book message
async function main() {
  // Initialize WASM
  const { initWasm } = await import('@capnp-ts/core/wasm');
  await initWasm();

  // Create a message
  console.log('Creating message...');
  const builder = new MessageBuilder();
  
  // Initialize root struct (2 data words, 1 pointer for name)
  const rootOffset = builder.initRoot(2, 1);
  console.log('Root offset:', rootOffset);
  
  // Serialize
  const buffer = builder.toArrayBuffer();
  console.log('Serialized size:', buffer.length, 'bytes');
  
  // Read it back
  console.log('\nReading message...');
  const reader = new MessageReader(buffer);
  console.log('Segments:', reader.segmentCount);
  console.log('Root offset:', reader.getRootOffset());
  
  // Read root pointer
  const ptr = reader.readPointer(0, 0);
  console.log('Root pointer:', ptr);
}

main().catch(console.error);
