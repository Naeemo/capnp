# 流控制指南

@naeemo/capnp 提供三种流控制机制，适用于不同场景的数据传输：Stream、Bulk 和 Realtime。

## 三种流模式对比

| 特性 | Stream | Bulk | Realtime |
|------|--------|------|----------|
| **适用场景** | 通用双向流 | 大文件传输 | 音视频流 |
| **可靠性** | 可靠 | 可靠 | 尽力而为 |
| **顺序保证** | ✅ | ✅ | ⚠️ 可能乱序 |
| **背压控制** | ✅ 窗口机制 | ✅ 速率限制 | ❌ 无 |
| **延迟敏感** | 中等 | 低 | 极高 |
| **丢包处理** | 重传 | 重传 | 丢弃旧数据 |

## Stream API

通用双向流，适用于大多数场景。

### 基本使用

```typescript
import { createStream } from '@naeemo/capnp';

// 创建流
const stream = createStream({
  direction: 'bidirectional',  // 'send' | 'receive' | 'bidirectional'
  flowControl: {
    windowSize: 64 * 1024,     // 64KB 滑动窗口
    updateThreshold: 1024,     // 1KB 阈值触发窗口更新
  }
});

// 发送数据
await stream.send({
  data: new Uint8Array([0x01, 0x02, 0x03]),
  endStream: false,  // 是否为最后一块
});

// 接收数据
for await (const chunk of stream) {
  console.log(`Received ${chunk.data.length} bytes`);
  
  if (chunk.endStream) {
    console.log('Stream ended');
    break;
  }
}

// 优雅关闭
await stream.close();
```

### 背压控制

Stream 自动处理背压，防止发送方淹没接收方：

```typescript
const stream = createStream({
  flowControl: {
    // 初始窗口大小
    windowSize: 64 * 1024,
    
    // 当窗口低于此值时，发送窗口更新
    updateThreshold: 16 * 1024,
    
    // 每次更新的字节数
    updateIncrement: 32 * 1024,
  }
});

// 发送会自动等待窗口空间
// 无需手动处理背压
await stream.send(largeData);
```

### 错误处理

```typescript
try {
  for await (const chunk of stream) {
    await processChunk(chunk);
  }
} catch (error) {
  if (error.code === 'STREAM_RESET') {
    // 对端重置了流
    console.error('Stream reset by peer:', error.reason);
  } else if (error.code === 'FLOW_CONTROL_ERROR') {
    // 流控制错误
    console.error('Flow control violation');
  }
}
```

## Bulk API

专为大文件传输优化，提供进度追踪和断点续传。

### 基本使用

```typescript
import { BulkTransferManager } from '@naeemo/capnp';

const bulk = new BulkTransferManager({
  chunkSize: 1024 * 1024,  // 1MB 分块
  maxConcurrent: 3,        // 最多 3 个并发块
  retryAttempts: 3,        // 失败重试 3 次
});

// 上传文件
const upload = await bulk.upload({
  source: fileStream,      // ReadableStream
  totalSize: file.size,    // 总大小用于进度计算
  
  onProgress: (progress) => {
    console.log(`Uploaded: ${progress.percentage}%`);
    console.log(`Speed: ${progress.bytesPerSecond / 1024} KB/s`);
  },
  
  onChunkComplete: (chunkIndex) => {
    console.log(`Chunk ${chunkIndex} uploaded`);
  },
});

// 等待完成
await upload.complete();
```

### 断点续传

```typescript
// 检查已上传的部分
const checkpoint = await bulk.checkCheckpoint(uploadId);

// 从断点继续
const upload = await bulk.resumeUpload({
  uploadId,
  source: fileStream,
  startFrom: checkpoint.receivedBytes,
});
```

### 下载文件

```typescript
const download = await bulk.download({
  request: { fileId: 'document.pdf' },
  
  onProgress: (progress) => {
    const bar = '='.repeat(progress.percentage / 2);
    console.log(`[${bar.padEnd(50)}] ${progress.percentage}%`);
  },
});

// 保存到文件
const writer = fileStream.getWriter();
for await (const chunk of download.chunks()) {
  await writer.write(chunk.data);
}
await writer.close();
```

## Realtime API

为低延迟场景设计，优先保证实时性而非可靠性。

### 基本使用

```typescript
import { createRealtimeStream, DropPolicy } from '@naeemo/capnp';

const stream = createRealtimeStream({
  // 最大允许延迟
  maxLatency: 100,  // 100ms
  
  // 超出延迟时的处理策略
  dropPolicy: DropPolicy.oldest,  // 丢弃最旧的数据
  
  // 缓冲区大小
  bufferSize: 10,  // 最多缓冲 10 帧
});

// 发送视频帧
function onVideoFrame(frame: VideoFrame) {
  stream.send({
    timestamp: performance.now(),
    data: encodeVideoFrame(frame),
    // 如果缓冲区满，根据 dropPolicy 可能返回 false
  });
}

// 接收端
for await (const frame of stream) {
  // 检查延迟
  const latency = performance.now() - frame.timestamp;
  
  if (latency > 100) {
    // 延迟过高，可能选择跳过这帧
    console.warn(`High latency: ${latency}ms`);
    continue;
  }
  
  displayFrame(frame.data);
}
```

### Drop Policy 策略

```typescript
enum DropPolicy {
  // 丢弃最旧的数据（适合直播）
  oldest = 'oldest',
  
  // 丢弃最新的数据（适合传感器）
  newest = 'newest',
  
  // 丢弃关键帧之间的数据
  nonKeyFrames = 'nonKeyFrames',
  
  // 不清除，等待（可能阻塞发送）
  none = 'none',
}
```

### 自适应码率

```typescript
const stream = createRealtimeStream({
  maxLatency: 100,
  dropPolicy: DropPolicy.oldest,
  
  // 启用自适应
  adaptiveBitrate: {
    enabled: true,
    minBitrate: 100_000,   // 100 Kbps
    maxBitrate: 10_000_000, // 10 Mbps
    adjustmentStep: 0.1,    // 每次调整 10%
  },
  
  onBitrateChange: (newBitrate) => {
    // 通知编码器调整码率
    videoEncoder.setBitrate(newBitrate);
  },
});
```

## 与 RPC 集成

流可以作为 RPC 方法的一部分：

```capnp
interface FileService {
  download @0 (fileId :Text) -> (stream :Stream);
  upload   @1 (stream :Stream) -> (fileId :Text);
}
```

### 服务端实现

```typescript
class FileServiceImpl implements FileService.Server {
  async download(params: { fileId: string }) {
    const fileStream = fs.createReadStream(params.fileId);
    const stream = createStream({ direction: 'send' });
    
    // 管道文件到流
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

### 客户端使用

```typescript
const fileService = await connection.bootstrap().getAs(FileService);

// 下载
const { stream } = await fileService.download({ fileId: 'document.pdf' });

for await (const chunk of stream) {
  await fileWriter.write(chunk.data);
}

// 上传
const uploadStream = createStream({ direction: 'send' });
const { fileId } = await fileService.upload({ stream: uploadStream });

// 边读取文件边发送
fileReader.on('data', (chunk) => {
  uploadStream.send({ data: new Uint8Array(chunk) });
});
```

## 性能对比

### 场景 1：传输 100MB 文件

```
Stream:  850 MB/s, CPU 15%
Bulk:    920 MB/s, CPU 12%  ✅ 最优
Raw RPC: 780 MB/s, CPU 20%
```

### 场景 2：实时视频流（1080p60）

```
Stream:   平均延迟 45ms, 偶尔卡顿
Realtime: 平均延迟 18ms, 无卡顿 ✅ 最优
```

### 场景 3：大量小消息（10000 x 1KB）

```
Stream:   12 MB/s, 延迟 2ms
Bulk:     45 MB/s, 延迟 50ms  ✅ 批量优化
Raw RPC:  8 MB/s,  延迟 5ms
```

## 最佳实践

1. **选择合适的 API**
   - 文件传输 → Bulk
   - 音视频 → Realtime
   - 其他 → Stream

2. **合理设置缓冲区**
   ```typescript
   // 太小：频繁阻塞
   windowSize: 4 * 1024,     // ❌ 太小
   
   // 适中：平衡延迟和吞吐
   windowSize: 64 * 1024,    // ✅ 推荐
   
   // 太大：内存占用高
   windowSize: 1024 * 1024,  // ⚠️ 仅在必要时
   ```

3. **始终处理错误**
   ```typescript
   stream.onError = (err) => {
     console.error('Stream error:', err);
     // 清理资源
     cleanup();
   };
   ```

4. **及时关闭流**
   ```typescript
   // 好的做法
   try {
     await processStream(stream);
   } finally {
     await stream.close();
   }
   ```

## 参考

- [API 参考 - Stream](../api/stream.md)
- [API 参考 - Bulk](../api/bulk.md)
- [API 参考 - Realtime](../api/realtime.md)
