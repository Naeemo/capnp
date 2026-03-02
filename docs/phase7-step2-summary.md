# Phase 7 Step 2: Dynamic Reader/Writer Implementation

## Summary

Successfully implemented dynamic Reader and Writer for Cap'n Proto messages, allowing runtime reading and writing of messages without compile-time type information.

## Files Created

### Core Implementation

1. **`src/rpc/dynamic-reader.ts`** - Dynamic Reader implementation
   - `createDynamicReader(schema, buffer)` - Create reader from schema and buffer
   - `createDynamicReaderFromStruct(schema, structReader, messageReader)` - Create from existing StructReader
   - `createDynamicReaderByTypeId(typeId, buffer, schemaRegistry)` - Create using type ID lookup
   - `dumpDynamicReader(reader)` - Utility to dump all field values
   - `DynamicReader` interface with methods:
     - `get(fieldName)` - Get field value by name
     - `has(fieldName)` - Check if field exists
     - `getFieldNames()` - Get all field names
     - `getSchema()` - Get underlying schema
     - `getStruct(fieldName)` - Get nested struct reader
     - `getList(fieldName)` - Get list field
     - `getRawReader()` - Get underlying StructReader

2. **`src/rpc/dynamic-writer.ts`** - Dynamic Writer implementation
   - `createDynamicWriter(schema)` - Create writer from schema
   - `createNestedDynamicWriter(schema, structBuilder, messageBuilder)` - Create nested writer
   - `createDynamicWriterByTypeId(typeId, schemaRegistry)` - Create using type ID lookup
   - `serializeDynamic(schema, data)` - Serialize data directly
   - `serializeDynamicByTypeId(typeId, data, schemaRegistry)` - Serialize using type ID
   - `DynamicWriter` interface with methods:
     - `set(fieldName, value)` - Set field value
     - `setFields(fields)` - Set multiple fields
     - `initStruct(fieldName)` - Initialize nested struct
     - `initList(fieldName, size)` - Initialize list
     - `setText(fieldName, value)` - Set text field
     - `setData(fieldName, value)` - Set data field
     - `toBuffer()` - Serialize to buffer
   - `DynamicListWriter` interface with methods:
     - `set(index, value)` - Set element
     - `setAll(values)` - Set all elements
     - `initStruct(index)` - Initialize struct element
     - `getSize()` - Get list size

### Tests

3. **`src/rpc/dynamic-reader.test.ts`** - Tests for Dynamic Reader
   - Creation tests
   - Field access tests
   - Type ID lookup tests
   - Dump utility tests
   - Enum handling tests

4. **`src/rpc/dynamic-writer.test.ts`** - Tests for Dynamic Writer
   - Creation tests
   - Field setting tests (all primitive types)
   - List handling tests
   - Text/Data field tests
   - Serialization tests
   - Type ID lookup tests

### Examples

5. **`examples/dynamic-schema.ts`** - Usage examples
   - Writing a Person struct
   - Reading a Person struct
   - Working with lists

### Integration

6. **`src/rpc/index.ts`** - Updated exports
   - Added all dynamic reader/writer exports

## Features Implemented

### Dynamic Reader
- ✅ Runtime field access by name
- ✅ Support for all primitive types (bool, int8/16/32/64, uint8/16/32/64, float32/64)
- ✅ Text field reading
- ✅ Data field reading
- ✅ List field reading (primitive and struct elements)
- ✅ Nested struct reading
- ✅ Enum field reading
- ✅ Schema introspection (get field names, check field existence)

### Dynamic Writer
- ✅ Runtime field setting by name
- ✅ Support for all primitive types
- ✅ Text field writing
- ✅ Data field writing
- ✅ List field writing (with element type inference)
- ✅ Nested struct initialization
- ✅ Enum field writing
- ✅ Batch field setting
- ✅ Serialization to ArrayBuffer

## Usage Example

```typescript
import { 
  createDynamicReader, 
  createDynamicWriter,
  type SchemaNode,
  SchemaNodeType,
} from "@naeemo/capnp";

// Define schema at runtime
const schema: SchemaNode = {
  id: BigInt("0x123"),
  displayName: "Person",
  // ... schema definition
};

// Write
const writer = createDynamicWriter(schema);
writer.set("name", "John");
writer.set("age", 30);
const buffer = writer.toBuffer();

// Read
const reader = createDynamicReader(schema, buffer);
console.log(reader.get("name")); // "John"
console.log(reader.get("age"));  // 30
```

## Testing

All 33 new tests pass:
- 9 tests for Dynamic Reader
- 24 tests for Dynamic Writer

Full test suite: 407 passed, 7 skipped

## Next Steps

1. **RpcConnection Integration** - Add `getDynamicSchema(typeId)` method to fetch schemas from remote servers
2. **CLI Tool Enhancement** - Add `--dynamic` flag and interactive schema query tool
3. **Performance Optimization** - Add caching for repeated schema lookups
4. **Advanced Types** - Full support for unions, groups, and capabilities