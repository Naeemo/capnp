# Cap'n Proto TypeScript Architecture

## Project Structure

```
capnp-ts/
├── src/                          # TypeScript source
│   ├── index.ts                  # Main entry (Node.js/Bun/Deno)
│   ├── browser.ts                # Browser entry
│   ├── message.ts                # MessageReader/MessageBuilder
│   ├── struct.ts                 # StructReader/StructBuilder
│   ├── codegen/                  # Code generation
│   │   ├── generator.ts          # TS code generator
│   │   └── types.ts              # Schema types
│   └── wasm/                     # WASM bridge
│       └── index.ts              # Emscripten bindings
│
├── wasm/                         # C++/WASM source
│   ├── CMakeLists.txt            # CMake configuration
│   ├── build.sh                  # Build script
│   ├── src/
│   │   ├── main.cpp              # Emscripten bindings
│   │   ├── common.h              # Common types/constants
│   │   ├── arena.h/cpp           # Arena allocator
│   │   ├── segment.h/cpp         # Segment operations
│   │   ├── pointer.h/cpp         # Pointer encode/decode
│   │   ├── message_reader.h/cpp  # Message reading
│   │   └── message_builder.h/cpp # Message building
│   └── dist/                     # WASM output
│       ├── capnp_ts_wasm.js
│       └── capnp_ts_wasm.wasm
│
├── package.json                  # pnpm configuration
├── rolldown.config.ts            # Build configuration
├── tsconfig.json
└── vitest.config.ts
```

## C++ Core Design

### Arena Allocator

The arena allocator manages memory in segments:

```cpp
class Arena {
    std::vector<std::unique_ptr<Segment>> segments_;
    uint32_t currentSegment_;
    
    std::pair<int32_t, int32_t> allocate(size_t size, size_t alignment);
};
```

### Pointer Encoding

Cap'n Proto pointers are 64-bit words with different formats:

**Struct Pointer:**
```
[ offset (30 bits) ] [ 00 ] [ dataWords (16 bits) ] [ pointerCount (16 bits) ]
```

**List Pointer:**
```
[ offset (30 bits) ] [ 01 ] [ elementSize (3 bits) ] [ elementCount (29 bits) ]
```

**Far Pointer:**
```
[ offset (29 bits) ] [ A ] [ 10 ] [ segment (32 bits) ]
```

### Emscripten Bindings

Uses embind for seamless JS/C++ interop:

```cpp
EMSCRIPTEN_BINDINGS(capnp_ts) {
    class_<MessageReaderWrapper>("MessageReader")
        .constructor<val>()
        .function("getRootOffset", &MessageReaderWrapper::getRootOffset)
        ...
}
```

## Build System

### WASM Build (Emscripten)

```bash
emcmake cmake .. -DCMAKE_BUILD_TYPE=Release
emmake make
```

Output:
- `capnp_ts_wasm.js` - JS loader
- `capnp_ts_wasm.wasm` - WASM binary

### TypeScript Build (Rolldown)

Targets:
- `dist/index.js` - ESM for Node/Bun/Deno
- `dist/index.cjs` - CommonJS
- `dist/index.browser.js` - Browser optimized

## Multi-Environment Support

| Environment | WASM Loading | Notes |
|-------------|--------------|-------|
| Node.js | `import()` | Standard ES modules |
| Bun | `import()` | Native ES module support |
| Deno | `import()` | Compatible import |
| Browser | `import()` | Dynamic import |

## License

MIT
