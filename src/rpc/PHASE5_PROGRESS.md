# Phase 5: Flow Control and Realtime Communication - Progress Report

## Overview

Phase 5 implements Bulk/Realtime API for Cap'n Proto RPC, supporting flow control and real-time communication scenarios.

## Implementation Status

### ✅ Completed

#### 1. Stream Abstraction (`stream.ts`)
- [x] Stream interface with bidirectional support
- [x] Flow control window management
- [x] Backpressure mechanism
- [x] Chunked data transfer
- [x] Progress notifications
- [x] Stream lifecycle management (connecting → open → closing → closed)
- [x] Priority levels (CRITICAL, HIGH, NORMAL, LOW, BACKGROUND)
- [x] Configurable flow control parameters
- [x] Comprehensive unit tests (`stream.test.ts`)

**Key Features:**
```typescript
const stream = new Stream({
  streamId: 1,
  direction: 'bidirectional',
  priority: StreamPriority.HIGH,
  flowControl: {
    initialWindowSize: 65536,
    maxWindowSize: 1048576,
  },
});

await stream.open();
await stream.send(data);
const chunk = await stream.receive();
await stream.close();
```

#### 2. Bulk API (`bulk.ts`)
- [x] BulkTransfer class for high-volume transfers
- [x] Chunked transfer with configurable chunk size
- [x] Concurrent chunk management (max in-flight)
- [x] Chunk acknowledgment with timeout
- [x] Backpressure handling
- [x] Progress tracking and notifications
- [x] Support for async iterable and function data sources
- [x] Transfer state management (pending → transferring → completed/cancelled/error)
- [x] BulkTransferManager for multiple concurrent transfers
- [x] Comprehensive unit tests (`bulk.test.ts`)

**Key Features:**
```typescript
const transfer = bulkManager.createTransfer('upload', {
  id: 'file-1',
  name: 'large-file.bin',
  totalSize: 100 * 1024 * 1024, // 100MB
});

transfer.setDataSource(fileStream);
transfer.setDataSink(fileWriter);

await transfer.start();
```

#### 3. Realtime API (`realtime.ts`)
- [x] RealtimeStream class for low-latency communication
- [x] Priority message queue (5 priority levels)
- [x] Message drop policies:
  - NEVER: Never drop messages
  - DROP_OLDEST: Drop oldest when full
  - DROP_NEWEST: Drop newest when full
  - DROP_LOW_PRIORITY: Drop low priority first
  - DROP_STALE: Drop messages exceeding max latency
- [x] Jitter buffer management
- [x] Bandwidth adaptation (adaptive bitrate)
- [x] Bandwidth statistics tracking:
  - Current/measured bitrate
  - Packet loss rate
  - Average latency
  - Jitter
  - Congestion level
- [x] RealtimeStreamManager for multiple streams
- [x] Comprehensive unit tests (`realtime.test.ts`)

**Key Features:**
```typescript
const rtStream = realtimeManager.createStream(baseStream, {
  targetLatencyMs: 50,
  maxLatencyMs: 200,
  dropPolicy: DropPolicy.DROP_STALE,
  adaptiveBitrate: true,
});

rtStream.start();
rtStream.sendMessage(data, MessagePriority.HIGH, { critical: true });
```

#### 4. Stream Management (`stream-manager.ts`)
- [x] Unified StreamManager for all stream types
- [x] Stream lifecycle management
- [x] Stream multiplexing support
- [x] Stream type tracking (STANDARD, BULK, REALTIME)
- [x] Statistics aggregation
- [x] Idle timeout handling
- [x] Event handlers for stream lifecycle

**Key Features:**
```typescript
const manager = createStreamManager({
  maxStreams: 100,
  idleTimeoutMs: 300000,
});

const stream = manager.createStream({ type: StreamType.BULK });
const stats = manager.getStatistics();
```

#### 5. Streaming RPC Connection (`streaming-connection.ts`)
- [x] StreamingRpcConnection extending RpcConnection
- [x] Capability negotiation for streaming features
- [x] Integration with existing Pipeline
- [x] Stream creation methods for all types
- [x] Backward compatibility with RpcConnection

**Key Features:**
```typescript
const conn = new StreamingRpcConnection(transport, {
  enableStreaming: true,
  localCapabilities: {
    bulkTransfer: true,
    realtimeStreams: true,
  },
});

const bulkStream = conn.createBulkTransfer('upload', metadata);
const rtStream = conn.createRealtimeStream(config);
```

#### 6. Module Exports (`index.ts`)
- [x] All new types and classes exported
- [x] Backward compatibility maintained
- [x] Clear organization by feature

### 🔄 Partially Implemented

#### Integration Tests
- [ ] Full end-to-end streaming test with WebSocket
- [ ] Multi-stream concurrency test
- [ ] Backpressure stress test
- [ ] Realtime latency benchmark

### ⏳ Not Yet Implemented

#### Performance Optimizations
- [ ] Zero-copy buffer pooling for streams
- [ ] SIMD-optimized data copying
- [ ] Memory-mapped file I/O for bulk transfers

#### Advanced Features
- [ ] Stream compression
- [ ] End-to-end encryption for streams
- [ ] Stream multiplexing over single connection

## Architecture

### Stream Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    StreamingRpcConnection                    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────────────────────────┐│
│  │   RpcConnection │  │        StreamManager                ││
│  │   (Base)        │  │  ┌─────────┐ ┌─────────┐ ┌────────┐ ││
│  │                 │  │  │ Stream  │ │ Stream  │ │ Stream │ ││
│  │                 │  │  │  (Std)  │ │ (Bulk)  │ │ (Real) │ ││
│  └─────────────────┘  │  └─────────┘ └─────────┘ └────────┘ ││
│                       └─────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Bulk Transfer Flow
```
┌──────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────┐
│  Source  │───▶│ Chunk Buffer │───▶│ Flow Control│───▶│  Stream  │
│ (File/   │    │ (max 8       │    │ (Window     │    │ (Network)│
│  Network)│    │  concurrent) │    │  Management)│    │          │
└──────────┘    └──────────────┘    └─────────────┘    └──────────┘
                                              │
                                              ▼
                                       ┌─────────────┐
                                       │ Ack Handler │
                                       │ (Timeout)   │
                                       └─────────────┘
```

### Realtime Stream Flow
```
┌─────────────┐    ┌──────────────────┐    ┌─────────────┐
│   Sender    │───▶│ Priority Queue   │───▶│   Stream    │
│  (App)      │    │ (5 levels +      │    │  (Network)  │
└─────────────┘    │  Drop Policy)    │    └─────────────┘
                   └──────────────────┘

┌─────────────┐    ┌──────────────────┐    ┌─────────────┐
│   Receiver  │◀───│ Jitter Buffer    │◀───│   Stream    │
│   (App)     │    │ (Playout Time)   │    │  (Network)  │
└─────────────┘    └──────────────────┘    └─────────────┘
```

## Testing

### Unit Tests
```bash
# Run stream tests
npm test -- src/rpc/stream.test.ts

# Run bulk tests
npm test -- src/rpc/bulk.test.ts

# Run realtime tests
npm test -- src/rpc/realtime.test.ts

# Run all RPC tests
npm test -- src/rpc/
```

### Test Coverage
- Stream: State transitions, flow control, progress tracking
- Bulk: Chunk management, acknowledgments, backpressure
- Realtime: Priority queue, drop policies, bandwidth adaptation

## Usage Examples

### Basic Stream Usage
```typescript
import { StreamingRpcConnection, StreamPriority } from '@naeemo/capnp';

const conn = new StreamingRpcConnection(transport);
await conn.start();

const stream = conn.createStream({
  direction: 'outbound',
  priority: StreamPriority.HIGH,
});

await stream.open();
await stream.send(data);
await stream.close();
```

### Bulk File Upload
```typescript
const transfer = conn.createBulkTransfer('upload', {
  id: 'upload-1',
  name: 'video.mp4',
  totalSize: file.size,
  contentType: 'video/mp4',
});

transfer.setDataSource(file.stream());

await transfer.start();
```

### Realtime Communication
```typescript
const rtStream = conn.createRealtimeStream({
  targetLatencyMs: 30,
  dropPolicy: DropPolicy.DROP_STALE,
}, {
  onMessage: (msg) => console.log('Received:', msg),
  onBandwidthAdapt: (bitrate) => console.log('New bitrate:', bitrate),
});

rtStream.start();
rtStream.sendMessage(audioFrame, MessagePriority.HIGH);
```

## Performance Characteristics

### Bulk Transfer
- **Chunk Size**: 16KB default, configurable
- **Max Concurrent**: 8 chunks in-flight default
- **Window Size**: 64KB initial, up to 1MB max
- **Timeout**: 30 seconds for chunk acknowledgment

### Realtime Stream
- **Target Latency**: 50ms default
- **Max Latency**: 200ms default
- **Jitter Buffer**: 30ms default
- **Queue Size**: 1000 messages max
- **Bandwidth Window**: 1 second measurement window

## Next Steps

1. **Integration Tests**: Full end-to-end tests with WebSocket transport
2. **Performance Benchmarks**: Measure throughput and latency
3. **Documentation**: API documentation and usage guides
4. **Examples**: Real-world examples (file transfer, video streaming)

## References

- [Cap'n Proto RPC Protocol](https://capnproto.org/rpc.html)
- [Flow Control in TCP](https://tools.ietf.org/html/rfc5681)
- [Adaptive Bitrate Streaming](https://en.wikipedia.org/wiki/Adaptive_bitrate_streaming)
- [Jitter Buffer Management](https://tools.ietf.org/html/rfc3550#section-8)
