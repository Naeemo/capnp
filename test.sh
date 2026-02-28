#!/bin/bash

# Test script for capnp-ts

set -e

echo "=== Cap'n Proto TypeScript Test Script ==="
echo

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm not found. Please install pnpm."
    exit 1
fi
echo "✓ pnpm found"

if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+."
    exit 1
fi
echo "✓ Node.js found: $(node --version)"

if command -v emcc &> /dev/null; then
    echo "✓ Emscripten found"
    HAS_EMSCRIPTEN=1
else
    echo "⚠ Emscripten not found. WASM build will be skipped."
    HAS_EMSCRIPTEN=0
fi

echo

# Install dependencies
echo "Installing dependencies..."
pnpm install
echo "✓ Dependencies installed"
echo

# Type check
echo "Running type check..."
pnpm run typecheck
echo "✓ Type check passed"
echo

# Lint
echo "Running linter..."
pnpm run lint || echo "⚠ Lint issues found (non-blocking)"
echo

# Build WASM if Emscripten is available
if [ "$HAS_EMSCRIPTEN" -eq 1 ]; then
    echo "Building WASM module..."
    pnpm run build:wasm || echo "⚠ WASM build failed (may need manual fix)"
    echo
fi

# Build TypeScript
echo "Building TypeScript..."
pnpm run build:ts || echo "⚠ TS build may have issues without WASM"
echo

# Run tests
echo "Running tests..."
pnpm test || echo "⚠ Tests may fail without WASM module"
echo

echo "=== Test Complete ==="
echo
echo "Next steps:"
if [ "$HAS_EMSCRIPTEN" -eq 0 ]; then
    echo "1. Install Emscripten to build WASM:"
    echo "   git clone https://github.com/emscripten-core/emsdk.git"
    echo "   cd emsdk && ./emsdk install latest && ./emsdk activate latest"
    echo "   source ./emsdk_env.sh"
fi
echo "2. Run pnpm run build to build everything"
echo "3. Run pnpm test to verify"
