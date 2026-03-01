import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MessageReader } from '../core/index.js';

const __dirname = new URL('.', import.meta.url).pathname;

describe('Schema Reader Debug', () => {
  it('should debug binary schema structure', () => {
    const buffer = readFileSync(join(__dirname, '../../test-schema.capnp.bin'));
    const message = new MessageReader(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    
    console.log('Segment count:', message.segmentCount);
    
    const segment = message.getSegment(0);
    if (!segment) {
      console.log('No segment 0');
      return;
    }
    
    console.log('Segment 0 size (words):', segment.length);
    
    // 读取前几个 word
    for (let i = 0; i < Math.min(20, segment.length); i++) {
      const word = segment.getWord(i);
      console.log(`Word ${i}: 0x${word.toString(16).padStart(16, '0')}`);
    }
    
    // CodeGeneratorRequest: 0 data words, 4 pointers
    // Root pointer at word 0
    const rootPtr = segment.getWord(0);
    console.log('\nRoot pointer:', `0x${rootPtr.toString(16).padStart(16, '0')}`);
    
    // Parse root pointer (should be struct pointer)
    const tag = Number(rootPtr & BigInt(3));
    console.log('Root pointer tag:', tag, '(0=struct, 1=list, 2=far, 3=other)');
    
    if (tag === 0) {
      const offset = Number(rootPtr >> BigInt(2)) & 0x3fffffff;
      const signedOffset = offset >= 0x20000000 ? offset - 0x40000000 : offset;
      const dataWords = Number((rootPtr >> BigInt(32)) & BigInt(0xffff));
      const pointerCount = Number((rootPtr >> BigInt(48)) & BigInt(0xffff));
      console.log('Root struct: offset=', signedOffset, 'dataWords=', dataWords, 'pointerCount=', pointerCount);
      
      // Root struct starts at word 1 + offset
      const rootStart = 1 + signedOffset;
      console.log('Root struct starts at word:', rootStart);
      
      // Read the first pointer of root (nodes list)
      const nodesPtrOffset = rootStart + dataWords; // first pointer after data section
      const nodesPtr = segment.getWord(nodesPtrOffset);
      console.log('\nNodes pointer at word', nodesPtrOffset, ':', `0x${nodesPtr.toString(16).padStart(16, '0')}`);
      
      const nodesTag = Number(nodesPtr & BigInt(3));
      console.log('Nodes pointer tag:', nodesTag);
      
      if (nodesTag === 1) {
        // List pointer
        const listOffset = Number(nodesPtr >> BigInt(2)) & 0x3fffffff;
        const signedListOffset = listOffset >= 0x20000000 ? listOffset - 0x40000000 : listOffset;
        const elementSize = Number((nodesPtr >> BigInt(32)) & BigInt(7));
        const elementCount = Number((nodesPtr >> BigInt(35)) & BigInt(0x1fffffff));
        console.log('Nodes list: offset=', signedListOffset, 'elementSize=', elementSize, 'elementCount=', elementCount);
        
        // For INLINE_COMPOSITE, the list content starts with a tag word
        const listStart = nodesPtrOffset + 1 + signedListOffset;
        console.log('\nList starts at word:', listStart);
        
        // Read tag word
        const tagWord = segment.getWord(listStart);
        console.log('Tag word:', `0x${tagWord.toString(16).padStart(16, '0')}`);
        
        // Tag word encodes: elementCount (32 bits) | dataWords (16 bits) | pointerCount (16 bits)
        const tagElementCount = Number(tagWord & BigInt(0xffffffff));
        const tagDataWords = Number((tagWord >> BigInt(32)) & BigInt(0xffff));
        const tagPointerCount = Number((tagWord >> BigInt(48)) & BigInt(0xffff));
        console.log('Tag: elementCount=', tagElementCount, 'dataWords=', tagDataWords, 'pointerCount=', tagPointerCount);
        
        // First element starts at listStart + 1
        console.log('\nFirst element (Node) at word:', listStart + 1);
        for (let i = 0; i < 20; i++) {
          const word = segment.getWord(listStart + 1 + i);
          console.log(`  Word ${i}: 0x${word.toString(16).padStart(16, '0')}`);
        }
        
        // Node struct: 5 data words, 6 pointers
        // First node (test-schema.capnp file) starts at word 7
        // Data section: words 7-11
        // Pointer section: words 12-17
        console.log('\n=== Node 0 (file) pointers ===');
        for (let i = 0; i < 6; i++) {
          const ptrWord = segment.getWord(12 + i);
          console.log(`  ptr[${i}] at word ${12 + i}: 0x${ptrWord.toString(16).padStart(16, '0')}`);
        }
        
        // Second node (Person) starts after first node
        // Node size = 5 + 6 = 11 words
        // Person starts at word 7 + 11 = word 18
        console.log('\n=== Node 1 (Person) ===');
        console.log('Person starts at word:', 7 + 11);
        for (let i = 0; i < 11; i++) {
          const word = segment.getWord(18 + i);
          console.log(`  Word ${i}: 0x${word.toString(16).padStart(16, '0')}`);
        }
        
        // Person data section: words 18-22
        // Person pointer section: words 23-28
        console.log('\n=== Person pointers ===');
        for (let i = 0; i < 6; i++) {
          const ptrWord = segment.getWord(23 + i);
          console.log(`  ptr[${i}] at word ${23 + i}: 0x${ptrWord.toString(16).padStart(16, '0')}`);
        }
      }
    }
  });
});

// Additional debug for Person union tag
describe('Person Union Tag Debug', () => {
  it('should check Person union tag', () => {
    const buffer = readFileSync(join(__dirname, '../../test-schema.capnp.bin'));
    const message = new MessageReader(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    const segment = message.getSegment(0)!;
    
    // Person starts at word 18
    // Node structure:
    // - id @0 :UInt64; (word 18)
    // - displayNamePrefixLength @2 :UInt32; (bits 64-96 = word 18, bytes 8-12)
    // - scopeId @3 :UInt64; (bits 128-192 = word 18-19)
    // - union tag @ ? bits [96, 112) = bytes 12-14 = word 18, bytes 12-14
    
    // Word 18: id (8 bytes) + displayNamePrefixLength (4 bytes) + union tag (2 bytes) + padding
    const word18 = segment.getWord(18);
    console.log('Word 18 (Person):', `0x${word18.toString(16).padStart(16, '0')}`);
    
    // Union tag at bits [96, 112) = bytes 12-14
    // In little-endian: byte 12 is the low byte of the uint16
    const unionTag = Number((word18 >> BigInt(96)) & BigInt(0xffff));
    console.log('Union tag:', unionTag);
    
    // Read as uint16 at byte offset 12
    const view = new DataView(segment.dataView.buffer);
    const tagFromView = view.getUint16(18 * 8 + 12, true);
    console.log('Union tag from view:', tagFromView);
  });
});

describe('Person Data Debug', () => {
  it('should check Person data section', () => {
    const buffer = readFileSync(join(__dirname, '../../test-schema.capnp.bin'));
    const message = new MessageReader(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    const segment = message.getSegment(0)!;
    
    // Person data section: words 18-23
    console.log('\n=== Person data section ===');
    for (let i = 0; i < 6; i++) {
      const word = segment.getWord(18 + i);
      console.log(`Word ${18 + i} (data ${i}): 0x${word.toString(16).padStart(16, '0')}`);
    }
    
    // Parse word 19
    const word19 = segment.getWord(19);
    const view = new DataView(segment.dataView.buffer);
    
    // displayNamePrefixLength @2 :UInt32; bits [64, 96) = bytes 8-12
    const displayNamePrefixLength = view.getUint32(19 * 8, true);
    console.log('\ndisplayNamePrefixLength:', displayNamePrefixLength);
    
    // union tag bits [96, 112) = bytes 12-14
    const unionTag = view.getUint16(19 * 8 + 4, true);
    console.log('Union tag:', unionTag);
    
    // scopeId @3 :UInt64; bits [128, 192) = bytes 16-24 = word 20
    const scopeId = segment.getWord(20);
    console.log('scopeId:', `0x${scopeId.toString(16)}`);
  });
});
