# Error Handling Best Practices

Cap'n Proto error handling follows specific patterns. Understanding these patterns makes your code more robust.

## Error Types

### Standard Exception Types

```typescript
interface RpcException {
  type: 'failed' | 'overloaded' | 'disconnected' | 'unimplemented';
  reason: string;
}
```

| Type | Meaning | Handling |
|------|---------|----------|
| `failed` | Method execution failed | Check parameters, retry may not help |
| `overloaded` | Server overloaded | Retry with exponential backoff |
| `disconnected` | Connection lost | Reconnect, may need to re-acquire capabilities |
| `unimplemented` | Method not implemented | Check version compatibility |

### Serialization Errors

```typescript
try {
  const reader = new MessageReader(data);
} catch (error) {
  if (error.code === 'INVALID_POINTER') {
    // Pointer out of bounds or invalid
    console.error('Message corrupted');
  } else if (error.code === 'MULTI_SEGMENT_NOT_SUPPORTED') {
    // Multi-segment message not supported
  }
}
```

## RPC Error Handling

### Basic Pattern

```typescript
async function safeRpcCall() {
  try {
    const result = await capability.someMethod();
    return result;
  } catch (error) {
    switch (error.type) {
      case 'failed':
        console.error('Method failed:', error.reason);
        // Log error, may need alerting
        throw new UserError(`Operation failed: ${error.reason}`);
        
      case 'overloaded':
        console.warn('Server overloaded, retrying...');
        await delay(1000);
        return safeRpcCall();  // Retry
        
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

### Retry with Exponential Backoff

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
      
      // Don't retry these errors
      if (error.type === 'failed' || error.type === 'unimplemented') {
        throw error;
      }
      
      // Last attempt
      if (i === options.maxRetries) break;
      
      // Exponential backoff
      const delay = options.baseDelay * Math.pow(2, i);
      console.log(`Retry ${i + 1}/${options.maxRetries} after ${delay}ms`);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

// Usage
const result = await callWithRetry(
  () => calculator.compute({ expression })
);
```

### Connection Loss Handling

```typescript
class ResilientClient {
  private connection: RpcConnection | null = null;
  private bootstrap: any = null;
  
  async ensureConnected() {
    if (this.connection?.connected) return;
    
    // Reconnect
    const transport = await EzRpcTransport.connect(this.host, this.port);
    this.connection = new RpcConnection(transport);
    
    // Re-acquire bootstrap
    this.bootstrap = await this.connection.bootstrap().getAs(MyService);
    
    // Listen for disconnect
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

## Serialization Error Handling

### Validate Input Data

```typescript
function safeDeserialize(data: Uint8Array): PersonReader | null {
  // 1. Check data size
  if (data.length < 8) {
    console.error('Data too small to be valid Cap\'n Proto message');
    return null;
  }
  
  // 2. Check max size (prevent DoS)
  const MAX_SIZE = 10 * 1024 * 1024;  // 10MB
  if (data.length > MAX_SIZE) {
    console.error('Message too large');
    return null;
  }
  
  try {
    const reader = new MessageReader(data);
    
    // 3. Validate magic number / version
    // (if using custom protocol header)
    
    return reader.getRoot(PersonReader);
  } catch (error) {
    console.error('Failed to deserialize:', error);
    return null;
  }
}
```

### Defensive Programming

```typescript
function safeGetPerson(reader: PersonReader): SafePerson {
  return {
    // Use defaults for missing fields
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

## Stream Error Handling

### Stream Reset

```typescript
const stream = createStream();

stream.onError = (error) => {
  if (error.code === 'STREAM_RESET') {
    // Peer actively reset the stream
    console.log('Stream reset by peer:', error.reason);
    cleanupResources();
  }
};

// Sender can also reset
if (somethingWentWrong) {
  stream.reset({ reason: 'Invalid data received' });
}
```

### Backpressure Errors

```typescript
try {
  await stream.send(hugeData);
} catch (error) {
  if (error.code === 'FLOW_CONTROL_ERROR') {
    // Sending too fast, violating flow control
    console.error('Sending too fast, backing off');
    await delay(100);
    await stream.send(hugeData);  // Retry
  }
}
```

## Logging and Monitoring

### Structured Logging

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

### Error Metrics

```typescript
// Collect error metrics
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

## Testing Error Scenarios

### Mock Errors

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

### Fault Injection

```typescript
// Test retry logic
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

## Best Practices Summary

1. **Distinguish error types** - Handle differently based on `error.type`
2. **Implement exponential backoff** - Use backoff for retryable errors
3. **Don't retry fatal errors** - `failed` and `unimplemented` usually don't need retry
4. **Maintain connection state** - Listen to `onClose` events for disconnects
5. **Log context** - Include method name, params, error details in logs
6. **Set timeouts** - Avoid infinite waiting

## Reference

- [RPC Type Definitions](../../src/rpc/rpc-types.ts)
- [Error Handling Tests](../../src/test/error-handling.test.ts)
