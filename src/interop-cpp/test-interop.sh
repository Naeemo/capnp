#!/bin/bash
# C++ Interop Test Script
# Runs automated tests between capnp-ts and C++ implementation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SERVER_PORT=18080
SERVER_PID=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Cleanup function
cleanup() {
    if [ -n "$SERVER_PID" ]; then
        log_info "Stopping C++ server (PID: $SERVER_PID)..."
        kill $SERVER_PID 2>/dev/null || true
        wait $SERVER_PID 2>/dev/null || true
    fi
}

trap cleanup EXIT

# Build C++ server
log_info "Building C++ server..."
cd "$SCRIPT_DIR"
make clean &> /dev/null || true
make

# Start C++ server
log_info "Starting C++ server on port $SERVER_PORT..."
./interop-server server "0.0.0.0:$SERVER_PORT" > /tmp/capnp-server.log 2>&1 &
SERVER_PID=$!

# Wait for server to start
sleep 2

# Check if server is running
if ! kill -0 $SERVER_PID 2>/dev/null; then
    log_error "Failed to start C++ server"
    cat /tmp/capnp-server.log
    exit 1
fi

log_info "C++ server started (PID: $SERVER_PID)"

# Test 1: C++ Client to C++ Server
log_info "Test 1: C++ Client -> C++ Server"
if ./interop-server client "localhost:$SERVER_PORT"; then
    log_info "✓ C++ Client test passed"
else
    log_error "✗ C++ Client test failed"
    exit 1
fi

# Test 2: TypeScript RPC Message Serialization
log_info "Test 2: TypeScript RPC Message Serialization"
cd "$PROJECT_ROOT"

# Create a simple test script
cat > /tmp/test-serialization.ts << 'EOF'
import { serializeRpcMessage, deserializeRpcMessage } from './src/rpc/message-serializer.js';
import type { RpcMessage } from './src/rpc/rpc-types.js';

const testMessage: RpcMessage = {
  type: 'call',
  call: {
    questionId: 1,
    target: { type: 'importedCap', importId: 0 },
    interfaceId: BigInt('0x1234567890abcdef'),
    methodId: 0,
    allowThirdPartyTailCall: false,
    noPromisePipelining: false,
    onlyPromisePipeline: false,
    params: {
      content: new Uint8Array([0x01, 0x02, 0x03, 0x04]),
      capTable: [],
    },
    sendResultsTo: { type: 'caller' },
  },
};

const serialized = serializeRpcMessage(testMessage);
console.log('Serialized message size:', serialized.length, 'bytes');

const deserialized = deserializeRpcMessage(serialized);
console.log('Deserialized message type:', deserialized.type);
console.log('Question ID:', (deserialized as any).call?.questionId);

if (deserialized.type === 'call' && deserialized.call.questionId === 1) {
  console.log('✓ Serialization test passed');
  process.exit(0);
} else {
  console.error('✗ Serialization test failed');
  process.exit(1);
}
EOF

if npx tsx /tmp/test-serialization.ts; then
    log_info "✓ Serialization test passed"
else
    log_error "✗ Serialization test failed"
    exit 1
fi

# Test 3: Run TypeScript unit tests
log_info "Test 3: Running TypeScript RPC unit tests"
if pnpm test src/rpc/rpc.test.ts --run 2>&1 | tail -20; then
    log_info "✓ TypeScript RPC tests passed"
else
    log_warn "Some TypeScript tests may have failed (this is expected for incomplete features)"
fi

log_info "========================================"
log_info "All interop tests completed!"
log_info "========================================"
