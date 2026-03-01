# Changelog

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

[0.2.0]: https://github.com/Naeemo/capnp/releases/tag/v0.2.0
[0.1.0]: https://github.com/Naeemo/capnp/releases/tag/v0.1.0
