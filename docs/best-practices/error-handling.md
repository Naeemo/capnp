# 错误处理最佳实践

Cap'n Proto 的错误处理遵循特定的模式。理解这些模式可以让你的代码更健壮。

## 错误类型

### 标准异常类型

```typescript
interface RpcException {
  type: 'failed' | 'overloaded' | 'disconnected' | 'unimplemented';
  reason: string;
}
```

| 类型 | 含义 | 处理方式 |
|------|------|----------|
| `failed` | 方法执行失败 | 检查参数，重试可能无效 |
| `overloaded` | 服务器过载 | 指数退避后重试 |
| `disconnected` | 连接断开 | 重连，可能需要重新获取能力 |
| `unimplemented` | 方法未实现 | 检查版本兼容性 |

### 序列化错误

```typescript
try {
  const reader = new MessageReader(data);
} catch (error) {
  if (error.code === 'INVALID_POINTER') {
    // 指针越界或无效
    console.error('Message corrupted');
  } else if (error.code === 'MULTI_SEGMENT_NOT_SUPPORTED') {
    // 使用了不支持的多段消息
  }
}
```

## RPC 错误处理

### 基本模式

```typescript
async function safeRpcCall() {
  try {
    const result = await capability.someMethod();
    return result;
  } catch (error) {
    switch (error.type) {
      case 'failed':
        console.error('Method failed:', error.reason);
        // 记录日志，可能需要告警
        throw new UserError(`Operation failed: ${error.reason}`);
        
      case 'overloaded':
        console.warn('Server overloaded, retrying...');
        await delay(1000);
        return safeRpcCall();  // 重试
        
      case 'disconnected':
        console.error('Connection lost');
        await reconnect();
        throw new Error('Please retry your request');
        
      case 'unimplemented':
        console.error('Method not implemented');
        throw new Error('Feature not available');
        
      default:
        throw error;
    }
  }
}
```

### 带重试的错误处理

```typescript
async function callWithRetry(
  operation: () => Promise<T>,
  options = { maxRetries: 3, baseDelay: 100 }
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i <= options.maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // 不重试的错误
      if (error.type === 'failed' || error.type === 'unimplemented') {
        throw error;
      }
      
      // 最后一次尝试
      if (i === options.maxRetries) break;
      
      // 指数退避
      const delay = options.baseDelay * Math.pow(2, i);
      console.log(`Retry ${i + 1}/${options.maxRetries} after ${delay}ms`);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

// 使用
const result = await callWithRetry(
  () => calculator.compute({ expression })
);
```

### 连接断开处理

```typescript
class ResilientClient {
  private connection: RpcConnection | null = null;
  private bootstrap: any = null;
  
  async ensureConnected() {
    if (this.connection?.connected) return;
    
    // 重连
    const transport = await EzRpcTransport.connect(this.host, this.port);
    this.connection = new RpcConnection(transport);
    
    // 重新获取 bootstrap
    this.bootstrap = await this.connection.bootstrap().getAs(MyService);
    
    // 设置断开监听
    transport.onClose = () => {
      console.log('Connection closed, will reconnect on next call');
      this.connection = null;
    };
  }
  
  async call(method: string, params: any) {
    await this.ensureConnected();
    try {
      return await this.bootstrap[method](params);
    } catch (error) {
      if (error.type === 'disconnected') {
        this.connection = null;
        throw new Error('Connection lost, please retry');
      }
      throw error;
    }
  }
}
```

## 序列化错误处理

### 验证输入数据

```typescript
function safeDeserialize(data: Uint8Array): PersonReader | null {
  // 1. 检查数据大小
  if (data.length < 8) {
    console.error('Data too small to be valid Cap\'n Proto message');
    return null;
  }
  
  // 2. 检查最大大小（防止 DoS）
  const MAX_SIZE = 10 * 1024 * 1024;  // 10MB
  if (data.length > MAX_SIZE) {
    console.error('Message too large');
    return null;
  }
  
  try {
    const reader = new MessageReader(data);
    
    // 3. 验证 magic number / 版本
    // （如果有自定义协议头）
    
    return reader.getRoot(PersonReader);
  } catch (error) {
    console.error('Failed to deserialize:', error);
    return null;
  }
}
```

### 防御性编程

```typescript
function safeGetPerson(reader: PersonReader): SafePerson {
  return {
    // 使用默认值处理缺失字段
    name: safeGet(() => reader.getName(), 'Unknown'),
    age: safeGet(() => reader.getAge(), 0),
    email: reader.hasEmail() ? reader.getEmail() : null,
  };
}

function safeGet<T>(getter: () => T, defaultValue: T): T {
  try {
    return getter();
  } catch {
    return defaultValue;
  }
}
```

## 流错误处理

### 流重置

```typescript
const stream = createStream();

stream.onError = (error) => {
  if (error.code === 'STREAM_RESET') {
    // 对端主动重置流
    console.log('Stream reset by peer:', error.reason);
    cleanupResources();
  }
};

// 发送端也可以重置
if (somethingWentWrong) {
  stream.reset({ reason: 'Invalid data received' });
}
```

### 背压错误

```typescript
try {
  await stream.send(hugeData);
} catch (error) {
  if (error.code === 'FLOW_CONTROL_ERROR') {
    // 发送太快，违反了流控制
    console.error('Sending too fast, backing off');
    await delay(100);
    await stream.send(hugeData);  // 重试
  }
}
```

## 日志和监控

### 结构化日志

```typescript
import { logger } from './logger';

async function rpcCallWithLogging() {
  const startTime = Date.now();
  
  try {
    const result = await capability.method();
    
    logger.info({
      event: 'rpc_success',
      method: 'method',
      duration: Date.now() - startTime,
    });
    
    return result;
  } catch (error) {
    logger.error({
      event: 'rpc_error',
      method: 'method',
      errorType: error.type,
      errorReason: error.reason,
      duration: Date.now() - startTime,
    });
    
    throw error;
  }
}
```

### 错误指标

```typescript
// 收集错误指标
class RpcMetrics {
  private errors = new Map<string, number>();
  
  recordError(type: string) {
    this.errors.set(type, (this.errors.get(type) ?? 0) + 1);
  }
  
  report() {
    return {
      totalErrors: Array.from(this.errors.values()).reduce((a, b) => a + b, 0),
      breakdown: Object.fromEntries(this.errors),
    };
  }
}
```

## 测试错误场景

### 模拟错误

```typescript
import { mock } from 'vitest';

it('should handle disconnected error', async () => {
  const mockCap = {
    method: mock.fn().mockRejectedValue({
      type: 'disconnected',
      reason: 'Connection reset',
    }),
  };
  
  const result = await handleRpcCall(mockCap);
  
  expect(result.error).toBe('Connection lost');
});
```

### 故障注入

```typescript
// 测试重试逻辑
it('should retry on overloaded', async () => {
  let attempts = 0;
  const flakyCap = {
    method: () => {
      attempts++;
      if (attempts < 3) {
        throw { type: 'overloaded', reason: 'Busy' };
      }
      return 'success';
    },
  };
  
  const result = await callWithRetry(() => flakyCap.method());
  
  expect(result).toBe('success');
  expect(attempts).toBe(3);
});
```

## 最佳实践总结

1. **区分错误类型** - 根据 `error.type` 采取不同策略
2. **实现指数退避** - 对可重试错误使用退避策略
3. **不要重试致命错误** - `failed` 和 `unimplemented` 通常不需要重试
4. **保持连接状态** - 监听 `onClose` 事件处理断开
5. **记录上下文** - 日志中包含方法名、参数、错误详情
6. **设置超时** - 避免无限等待

## 参考

- [RPC 类型定义](../../src/rpc/rpc-types.ts)
- [错误处理测试](../../src/test/error-handling.test.ts)
