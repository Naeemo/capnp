# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release of Cap'n Proto TypeScript implementation
- Pure TypeScript implementation with zero dependencies
- MessageReader and MessageBuilder for serialization/deserialization
- Support for all primitive types (int8/16/32/64, uint8/16/32/64, float32/64, bool)
- Support for Text and Data blob types
- List support for all element sizes (Void, Bit, Byte, TwoBytes, FourBytes, EightBytes, Pointer, Composite)
- Union type support with discriminant
- Nested struct support
- Far pointer support for multi-segment messages
- Schema parser and TypeScript code generator
- CLI tool for code generation
- 160 comprehensive tests covering all features
- Interoperability tests with official C++ implementation
- Performance benchmarks
- Full documentation (English and Chinese)

### Performance
- Simple struct serialization: ~1.4μs
- Simple struct deserialization: ~0.6μs
- List (100 items) serialization: ~6.8μs

### Known Limitations
- Zero-sized struct encoding may differ from spec (offset=-1 requirement)
- MessageBuilder currently creates single-segment messages only
- Packed encoding not yet implemented

## [0.1.0] - 2026-02-28

### Added
- First public release
- Core serialization/deserialization functionality
- Basic documentation and examples

---

Contributors: **Naeemo**, **Kimi**
