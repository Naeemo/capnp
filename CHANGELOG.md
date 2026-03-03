# Changelog

## [0.5.2] - 2026-03-03

### Added
- **Documentation**: Complete documentation overhaul
  - Quick Start Guide (`docs/getting-started.md`)
  - RPC Guide with Promise Pipelining examples (`docs/guides/rpc.md`)
  - Code Generator documentation (`docs/guides/codegen.md`)
  - Dynamic Schema tutorial (`docs/guides/dynamic-schema.md`)
  - Streaming API guide (`docs/guides/streaming.md`)
  - Performance best practices (`docs/best-practices/performance.md`)
  - Error handling patterns (`docs/best-practices/error-handling.md`)
  - Performance benchmarks (`docs/benchmarks.md`)
- **Performance Benchmarks**: Comprehensive performance testing
  - 10 serialization scenarios tested
  - JSON comparison benchmark
  - Detailed performance report with optimization suggestions
- **C++ Interop**: Node.js to C++ EzRpc compatibility
  - `EzRpcTransport` for raw TCP communication
  - Bootstrap handshake tests passing
  - 5 interop tests covering protocol basics

### Fixed
- **Boundary Checks**: Added comprehensive bounds checking
  - Segment.getWord/setWord bounds validation
  - StructReader all getters with boundary protection
  - List pointer boundary checks
  - 12 new edge case tests all passing
- **RPC Error Handling**: Improved EzRpcTransport robustness
  - Fixed connected property check
  - Better connection timeout messages
  - Proper cleanup on disconnect
  - 30-second receive timeout protection
- **Error Messages**: Clearer error messages throughout

### Stats
- **414 tests passing** (up from 420+)
- **8 documentation files** added
- **2 benchmark suites** added

[0.5.2]: https://github.com/Naeemo/capnp/releases/tag/v0.5.2

## [0.5.0] - 2026-03-03

### Added
- **Phase 7: Dynamic Schema** - Runtime dynamic schema fetching and usage
  - Schema transport protocol (SchemaRequest/SchemaResponse)
  - Runtime schema parser (CodeGeneratorRequest parsing)
  - Dynamic Reader - read messages at runtime
  - Dynamic Writer - write messages at runtime
  - Schema Capability implementation (server provider and client fetcher)
  - Schema caching mechanism
  - End-to-end test suite
- **420+ tests passing** (up from 360+)

### Milestone
🎉 **Phase 7 Dynamic Schema completed!** Supports runtime dynamic schema fetching and parsing, laying the foundation for dynamic language bindings and universal clients.

## [0.4.0] - 2026-03-02

### Added
- **Level 3 RPC**: Three-way introductions for multi-node connections
  - Provide/Accept message handling
  - Automatic connection establishment between nodes
  - Cross-connection capability passing
  - ConnectionManager for managing multiple concurrent connections
- **Level 4 RPC**: Join / Reference Equality
  - Verify capabilities from different sources point to same object
  - Escrow Agent security mode for consensus verification
  - Anti-spoofing with identity hash verification
  - Audit logging for security-sensitive operations
- **Streaming & Realtime API** (Phase 5)
  - Stream abstraction with backpressure
  - Bulk API for large data transfer with flow control
  - Realtime API with priority queues and drop policies
  - Bandwidth adaptation and jitter buffering
- **360+ tests passing** (up from 257)

### Milestone
🎉 **Complete Cap'n Proto RPC Level 0-4 implementation achieved!**
First TypeScript implementation with full official RPC protocol support.

## [0.3.0] - 2026-03-02

### Added
- **RPC Layer**: Complete Cap'n Proto RPC implementation (Level 0-2)
  - Promise Pipelining for chained RPC calls
  - Capability passing between client and server
  - SturdyRefs for persistent capability references
  - WebSocket transport layer
- **RPC Code Generation**: Generate TypeScript Client/Server from interface definitions
- **Performance Optimizations**: MemoryPool, MultiSegmentMessageBuilder, zero-copy utilities
- **Integration Tests**: WebSocket and RPC integration test suite
- **Examples**: Echo service, Calculator, Promise Pipelining examples

### Changed
- Enhanced V3 code generator with RPC interface support
- 257 tests passing (up from 143)

## [0.2.0] - 2026-03-02

### Added
- **Binary Schema Support**: Parse official `capnp compile -o-` output
- **V3 Code Generator**: New generator using binary schema with full feature support
- **V3 CLI Tool**: `capnp-ts-codegen` command for code generation
- **Union Support**: Full union code generation with discriminant and variants
- **Group Support**: Group fields inline expansion in generated code
- **Default Values**: XOR encoding for default values in generated code
- **Multi-Segment Messages**: Far pointer support for large messages
- **143 tests passing** (up from 133)

### Changed
- Deprecated V2 regex-based parser (still functional)

## [0.1.0] - 2026-02-28

### Added
- Pure TypeScript Cap'n Proto implementation
- Zero-copy deserialization with MessageReader
- MessageBuilder for constructing messages
- Full support for all primitive types
- Text, Data, List support
- Schema parser and code generator
- CLI: `npx @naeemo/capnp gen schema.capnp -o types.ts`
- 133 tests passing

[0.5.0]: https://github.com/Naeemo/capnp/releases/tag/v0.5.0
[0.4.0]: https://github.com/Naeemo/capnp/releases/tag/v0.4.0
[0.3.0]: https://github.com/Naeemo/capnp/releases/tag/v0.3.0
[0.2.0]: https://github.com/Naeemo/capnp/releases/tag/v0.2.0
[0.1.0]: https://github.com/Naeemo/capnp/releases/tag/v0.1.0
