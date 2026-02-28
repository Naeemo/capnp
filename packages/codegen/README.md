# @capnp-ts/codegen

CLI tool for generating TypeScript code from Cap'n Proto schemas.

## Installation

```bash
npm install -g @capnp-ts/codegen
# or
npx @capnp-ts/codegen
```

## Usage

```bash
# Generate TypeScript from schema
capnp-ts-codegen -o ts addressbook.capnp

# Generate to specific directory
capnp-ts-codegen -o ts -d ./generated addressbook.capnp

# Watch mode
capnp-ts-codegen -o ts --watch addressbook.capnp
```

## Output Structure

```
addressbook.capnp →
  addressbook.ts       # Main module with all types
```
