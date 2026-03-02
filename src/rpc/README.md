# Cap'n Proto RPC - Phase 5

Flow Control and Realtime Communication: Bulk/Realtime API with stream management.

## Overview

This module implements Phase 5 features of Cap'n Proto RPC:

- **Stream Abstraction**: Unified stream interface with flow control
- **Bulk API**: High-volume data transfer with backpressure
- **Realtime API**: Low-latency communication with prioritization
- **Stream Management**: Lifecycle management for multiple concurrent streams
- **Streaming RPC Connection**: Extended connection with streaming capabilities

## Features

### 1. Stream Abstraction (`stream.ts`)

Bidirectional streaming with flow control:

```typescript
import { Stream, StreamPriority } from '@naeemo/capnp';

const stream = new Stream({
  streamId: 1,
  direction: 'bidirectional',
  priority: StreamPriority.HIGH,
  flowControl: {
    initialWindowSize: 65536,  // 64KB
    maxWindowSize: 1048576,    // 1MB
  },
});

await stream.open();
await stream.send(data);
const chunk = await stream.receive();
await stream.close();
```

**Key Features:**
- Flow control window management
- Backpressure handling
- Progress notifications
- Priority levels (CRITICAL, HIGH, NORMAL, LOW, BACKGROUND)

### 2. Bulk API (`bulk.ts`)

High-volume data transfer:

```typescript
import { BulkTransferManager, createBulkTransferManager } from '@naeemo/capnp';

const manager = createBulkTransferManager();

const transfer = manager.createTransfer('upload', {
  id: 'file-1',
  name: 'video.mp4',
  totalSize: 100 * 1024 * 1024, // 100MB
});

transfer.setDataSource(fileStream);

await transfer.start();
```

**Key Features:**
- Chunked transfer (16KB default)
- Concurrent chunk management (8 in-flight default)
- Chunk acknowledgment with timeout
- Backpressure handling
- Progress tracking

### 3. Realtime API (`realtime.ts`)

Low-latency communication:

```typescript
import { RealtimeStreamManager, DropPolicy, MessagePriority } from '@naeemo/capnp';

const manager = new RealtimeStreamManager();

const rtStream = manager.createStream(baseStream, {
  targetLatencyMs: 50,
  maxLatencyMs: 200,
  dropPolicy: DropPolicy.DROP_STALE,
  adaptiveBitrate: true,
});

rtStream.start();
rtStream.sendMessage(data, MessagePriority.HIGH, { critical: true });
```

**Key Features:**
- Priority message queue (5 levels)
- Drop policies: NEVER, DROP_OLDEST, DROP_NEWEST, DROP_LOW_PRIORITY, DROP_STALE
- Jitter buffer management
- Bandwidth adaptation
- Latency tracking

### 4. Stream Management (`stream-manager.ts`)

Unified stream lifecycle management:

```typescript
import { StreamManager, StreamType, createStreamManager } from '@naeemo/capnp';

const manager = createStreamManager({
  maxStreams: 100,
  idleTimeoutMs: 300000,
});

// Create different stream types
const standardStream = manager.createStream({ type: StreamType.STANDARD });
const bulkStream = manager.createBulkStream('upload', metadata);
const realtimeStream = manager.createRealtimeStream(config);

// Get statistics
const stats = manager.getStatistics();
```

### 5. Streaming RPC Connection (`streaming-connection.ts`)

Extended connection with streaming:

```typescript
import { StreamingRpcConnection } from '@naeemo/capnp';

const conn = new StreamingRpcConnection(transport, {
  enableStreaming: true,
  localCapabilities: {
    bulkTransfer: true,
    realtimeStreams: true,
  },
});

// Create streams
const bulkStream = conn.createBulkTransfer('upload', metadata);
const rtStream = conn.createRealtimeStream(config);
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    StreamingRpcConnection                            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────────────────────────────┐   │
│  │   RpcConnection │  │           StreamManager                 │   │
│  │   (Base)        │  │  ┌─────────┐ ┌─────────┐ ┌──────────┐  │   │
│  │                 │  │  │ Stream  │ │ Bulk    │ │ Realtime │  │   │
│  │                 │  │  │ (Std)   │ │ Transfer│ │ Stream   │  │   │
│  └─────────────────┘  │  └─────────┘ └─────────┘ └──────────┘  │   │
│                       └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
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

## Usage Examples

### File Upload with Progress

```typescript
const transfer = conn.createBulkTransfer('upload', {
  id: 'upload-1',
  name: 'large-file.zip',
  totalSize: file.size,
}, {
  enableProgress: true,
  progressInterval: 65536, // Report every 64KB
}, {
  onProgress: (progress) => {
    console.log(`Progress: ${progress.percentage?.toFixed(1)}%`);
    console.log(`Rate: ${(progress.transferRate! / 1024 / 1024).toFixed(2)} MB/s`);
  },
  onComplete: () => console.log('Upload complete!'),
});

transfer.setDataSource(file.stream());
await transfer.start();
```

### Realtime Audio Streaming

```typescript
const audioStream = conn.createRealtimeStream({
  targetLatencyMs: 30,
  dropPolicy: DropPolicy.DROP_STALE,
  adaptiveBitrate: true,
}, {
  onMessage: (msg) => {
    // Play audio frame
    audioContext.decodeAudioData(msg.data.buffer, (buffer) => {
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.start();
    });
  },
  onBandwidthAdapt: (bitrate) => {
    // Adjust encoder bitrate
    encoder.setBitrate(bitrate);
  },
});

audioStream.start();

// Send audio frames
audioRecorder.ondataavailable = (e) => {
  audioStream.sendMessage(
    new Uint8Array(e.data),
    MessagePriority.HIGH,
    { critical: true }
  );
};
```

### Video Streaming with Adaptive Quality

```typescript
const videoStream = conn.createRealtimeStream({
  targetLatencyMs: 50,
  maxLatencyMs: 150,
  adaptiveBitrate: true,
  minBitrate: 100000,  // 100 Kbps
  maxBitrate: 5000000, // 5 Mbps
});

videoStream.start();

// Encode and send video frames
setInterval(() => {
  const frame = captureVideoFrame();
  const encoded = encodeVideoFrame(frame, currentQuality);
  
  const success = videoStream.sendMessage(
    encoded,
    MessagePriority.HIGH
  );
  
  if (!success) {
    // Frame dropped, reduce quality
    currentQuality = Math.max(0.3, currentQuality * 0.9);
  }
}, 1000 / 30); // 30 FPS
```

## Testing

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

## API Reference

See individual module files for detailed API documentation:
- `stream.ts` - Stream abstraction
- `bulk.ts` - Bulk transfer API
- `realtime.ts` - Realtime communication API
- `stream-manager.ts` - Stream lifecycle management
- `streaming-connection.ts` - Streaming RPC connection

## Progress

See `PHASE5_PROGRESS.md` for detailed implementation progress.

## References

- [Cap'n Proto RPC Protocol](https://capnproto.org/rpc.html)
- [TCP Flow Control](https://tools.ietf.org/html/rfc5681)
- [Adaptive Bitrate Streaming](https://en.wikipedia.org/wiki/Adaptive_bitrate_streaming)
- [Jitter Buffer Management](https://tools.ietf.org/html/rfc3550#section-8)
