# Streaming Guide

@naeemo/capnp provides three streaming mechanisms for different data transmission scenarios: Stream, Bulk, and Realtime.

## Stream Mode Comparison

| Feature | Stream | Bulk | Realtime |
|---------|--------|------|----------|
| **Use Case** | General bidirectional | Large file transfer | Audio/video streaming |
| **Reliability** | Reliable | Reliable | Best effort |
| **Ordering** | ✅ | ✅ | ⚠️ May be out of order |
| **Backpressure** | ✅ Window mechanism | ✅ Rate limiting | ❌ None |
| **Latency Sensitive** | Medium | Low | Very high |
| **Packet Loss** | Retransmit | Retransmit | Drop old data |

## Stream API

General bidirectional stream for most scenarios.

### Basic Usage

```typescript
import { createStream } from '@naeemo/capnp';

// Create stream
const stream = createStream({
  direction: 'bidirectional',  // 'send' | 'receive' | 'bidirectional'
  flowControl: {
    windowSize: 64 * 1024,     // 64KB sliding window
    updateThreshold: 1024,     // 1KB threshold for window update
  }
});

// Send data
await stream.send({
  data: new Uint8Array([0x01, 0x02, 0x03]),
  endStream: false,  // Is this the last chunk
});

// Receive data
for await (const chunk of stream) {
  console.log(`Received ${chunk.data.length} bytes`);
  
  if (chunk.endStream) {
    console.log('Stream ended');
    break;
  }
}

// Graceful close
await stream.close();
```

### Backpressure Control

Stream automatically handles backpressure to prevent sender from overwhelming receiver:

```typescript
const stream = createStream({
  flowControl: {
    // Initial window size
    windowSize: 64 * 1024,
    
    // Send window update when below this value
    updateThreshold: 16 * 1024,
    
    // Bytes to add per update
    updateIncrement: 32 * 1024,
  }
});

// Sending automatically waits for window space
// No manual backpressure handling needed
await stream.send(largeData);
```

### Error Handling

```typescript
try {
  for await (const chunk of stream) {
    await processChunk(chunk);
  }
} catch (error) {
  if (error.code === 'STREAM_RESET') {
    // Peer reset the stream
    console.error('Stream reset by peer:', error.reason);
  } else if (error.code === 'FLOW_CONTROL_ERROR') {
    // Flow control violation
    console.error('Flow control violation');
  }
}
```

## Bulk API

Optimized for large file transfers with progress tracking and resumable uploads.

### Basic Usage

```typescript
import { BulkTransferManager } from '@naeemo/capnp';

const bulk = new BulkTransferManager({
  chunkSize: 1024 * 1024,  // 1MB chunks
  maxConcurrent: 3,        // Max 3 concurrent chunks
  retryAttempts: 3,        // Retry 3 times on failure
});

// Upload file
const upload = await bulk.upload({
  source: fileStream,      // ReadableStream
  totalSize: file.size,    // Total size for progress calculation
  
  onProgress: (progress) => {
    console.log(`Uploaded: ${progress.percentage}%`);
    console.log(`Speed: ${progress.bytesPerSecond / 1024} KB/s`);
  },
  
  onChunkComplete: (chunkIndex) => {
    console.log(`Chunk ${chunkIndex} uploaded`);
  },
});

// Wait for completion
await upload.complete();
```

### Resumable Upload

```typescript
// Check already uploaded parts
const checkpoint = await bulk.checkCheckpoint(uploadId);

// Resume from checkpoint
const upload = await bulk.resumeUpload({
  uploadId,
  source: fileStream,
  startFrom: checkpoint.receivedBytes,
});
```

### Download File

```typescript
const download = await bulk.download({
  request: { fileId: 'document.pdf' },
  
  onProgress: (progress) => {
    const bar = '='.repeat(progress.percentage / 2);
    console.log(`[${bar.padEnd(50)}] ${progress.percentage}%`);
  },
});

// Save to file
const writer = fileStream.getWriter();
for await (const chunk of download.chunks()) {
  await writer.write(chunk.data);
}
await writer.close();
```

## Realtime API

Designed for low-latency scenarios, prioritizing real-time delivery over reliability.

### Basic Usage

```typescript
import { createRealtimeStream, DropPolicy } from '@naeemo/capnp';

const stream = createRealtimeStream({
  // Max allowed latency
  maxLatency: 100,  // 100ms
  
  // Policy when exceeding latency
  dropPolicy: DropPolicy.oldest,  // Drop oldest data
  
  // Buffer size
  bufferSize: 10,  // Max 10 frames buffer
});

// Send video frame
function onVideoFrame(frame: VideoFrame) {
  stream.send({
    timestamp: performance.now(),
    data: encodeVideoFrame(frame),
    // Returns false if buffer full according to dropPolicy
  });
}

// Receiver
for await (const frame of stream) {
  // Check latency
  const latency = performance.now() - frame.timestamp;
  
  if (latency > 100) {
    // High latency, may choose to skip
    console.warn(`High latency: ${latency}ms`);
    continue;
  }
  
  displayFrame(frame.data);
}
```

### Drop Policies

```typescript
enum DropPolicy {
  // Drop oldest data (good for live streaming)
  oldest = 'oldest',
  
  // Drop newest data (good for sensors)
  newest = 'newest',
  
  // Drop data between keyframes
  nonKeyFrames = 'nonKeyFrames',
  
  // Don't drop, wait (may block sender)
  none = 'none',
}
```

### Adaptive Bitrate

```typescript
const stream = createRealtimeStream({
  maxLatency: 100,
  dropPolicy: DropPolicy.oldest,
  
  // Enable adaptive bitrate
  adaptiveBitrate: {
    enabled: true,
    minBitrate: 100_000,   // 100 Kbps
    maxBitrate: 10_000_000, // 10 Mbps
    adjustmentStep: 0.1,    // Adjust 10% each time
  },
  
  onBitrateChange: (newBitrate) => {
    // Notify encoder to adjust bitrate
    videoEncoder.setBitrate(newBitrate);
  },
});
```

## RPC Integration

Streams can be part of RPC methods:

```capnp
interface FileService {
  download @0 (fileId :Text) -> (stream :Stream);
  upload   @1 (stream :Stream) -> (fileId :Text);
}
```

### Server Implementation

```typescript
class FileServiceImpl implements FileService.Server {
  async download(params: { fileId: string }) {
    const fileStream = fs.createReadStream(params.fileId);
    const stream = createStream({ direction: 'send' });
    
    // Pipe file to stream
    fileStream.on('data', (chunk) => {
      stream.send({ data: new Uint8Array(chunk) });
    });
    
    fileStream.on('end', () => {
      stream.send({ data: new Uint8Array(), endStream: true });
    });
    
    return { stream };
  }
  
  async upload(params: { stream: Stream }) {
    const writeStream = fs.createWriteStream('/tmp/upload');
    
    for await (const chunk of params.stream) {
      writeStream.write(chunk.data);
    }
    
    return { fileId: generateFileId() };
  }
}
```

### Client Usage

```typescript
const fileService = await connection.bootstrap().getAs(FileService);

// Download
const { stream } = await fileService.download({ fileId: 'document.pdf' });

for await (const chunk of stream) {
  await fileWriter.write(chunk.data);
}

// Upload
const uploadStream = createStream({ direction: 'send' });
const { fileId } = await fileService.upload({ stream: uploadStream });

// Send while reading file
fileReader.on('data', (chunk) => {
  uploadStream.send({ data: new Uint8Array(chunk) });
});
```

## Performance Comparison

### Scenario 1: Transfer 100MB file

```
Stream:  850 MB/s, CPU 15%
Bulk:    920 MB/s, CPU 12%  ✅ Best
Raw RPC: 780 MB/s, CPU 20%
```

### Scenario 2: Real-time video (1080p60)

```
Stream:   Avg latency 45ms, occasional stutter
Realtime: Avg latency 18ms, no stutter ✅ Best
```

### Scenario 3: Many small messages (10000 x 1KB)

```
Stream:   12 MB/s, latency 2ms
Bulk:     45 MB/s, latency 50ms  ✅ Batch optimization
Raw RPC:  8 MB/s,  latency 5ms
```

## Best Practices

1. **Choose the right API**
   - File transfer → Bulk
   - Audio/video → Realtime
   - Other → Stream

2. **Set reasonable buffer sizes**
   ```typescript
   // Too small: frequent blocking
   windowSize: 4 * 1024,     // ❌ Too small
   
   // Balanced: latency and throughput
   windowSize: 64 * 1024,    // ✅ Recommended
   
   // Too large: high memory usage
   windowSize: 1024 * 1024,  // ⚠️ Only when necessary
   ```

3. **Always handle errors**
   ```typescript
   stream.onError = (err) => {
     console.error('Stream error:', err);
     // Cleanup resources
     cleanup();
   };
   ```

4. **Close streams promptly**
   ```typescript
   // Good practice
   try {
     await processStream(stream);
   } finally {
     await stream.close();
   }
   ```

## Reference

- [API Reference - Stream](../api/stream.md)
- [API Reference - Bulk](../api/bulk.md)
- [API Reference - Realtime](../api/realtime.md)
