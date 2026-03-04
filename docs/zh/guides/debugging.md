# 调试指南

本文档介绍如何使用调试配置 API 来排查 Cap'n Proto RPC 连接和消息处理中的问题。

## 启用调试模式

### 环境变量 (Node.js)

最简单的启用方式是通过 `CAPNP_DEBUG` 环境变量：

```bash
CAPNP_DEBUG=1 node your-app.js
```

或者在导入库之前设置：

```typescript
process.env.CAPNP_DEBUG = '1';
import { enableDebug } from '@naeemo/capnp';
```

### 程序化 API

你也可以在运行时通过代码启用调试模式：

```typescript
import { enableDebug, disableDebug, isDebugEnabled } from '@naeemo/capnp';

// 使用默认选项启用
enableDebug();

// 使用自定义选项启用
enableDebug({
  colors: true,      // 启用彩色输出
  maxBytes: 512,     // 最多记录 512 字节的二进制数据
  filter: 'Call'     // 只记录包含 'Call' 的消息
});

// 检查是否已启用调试模式
if (isDebugEnabled()) {
  console.log('调试模式已激活');
}

// 禁用调试模式
disableDebug();
```

## 调试选项

### `colors?: boolean`

在调试输出中启用 ANSI 颜色代码。默认：`true`

颜色有助于区分不同类型的消息，让终端中的日志更易读。

### `maxBytes?: number`

记录二进制消息数据时显示的最大字节数。默认：`256`

大消息可能产生过多的输出，此选项限制显示的原始二进制数据量。

```typescript
enableDebug({ maxBytes: 1024 }); // 最多显示 1KB 二进制数据
```

### `filter?: string | RegExp`

按消息类型或对端标识符过滤调试输出。默认：`''`（不过滤）

当你只想查看特定类型的消息时很有用：

```typescript
// 按消息类型名称过滤
enableDebug({ filter: 'Call' });

// 使用正则表达式过滤
enableDebug({ filter: /^(Call|Return)$/ });

// 按对端过滤（格式："messageType:peerId"）
enableDebug({ filter: 'Call:client1' });
```

## 记录的信息

启用调试模式后，会记录以下信息：

### 消息事件

- **发送/接收**: 所有发送和接收的 RPC 消息
- **消息类型**: Bootstrap、Call、Return、Finish、Resolve、Release 等
- **载荷大小**: 消息的字节数
- **二进制预览**: 消息内容的十六进制转储（遵守 `maxBytes` 设置）

### 连接事件

- **连接建立**: 当新的 RPC 连接建立时
- **连接关闭**: 当连接终止时
- **能力解析**: 当 Promise 被解析时
- **管道操作**: Promise 管道活动

### 错误事件

- **序列化错误**: 编码/解码消息时的问题
- **协议错误**: RPC 协议违规
- **传输错误**: WebSocket/TCP 连接问题
- **超时事件**: 操作超时

### 调试输出示例

```
[CAPNP:DEBUG] [SND] Call (questionId=1, interfaceId=0x12345678, methodId=0)
  Target: imported capability #5
  Payload: 45 bytes
  Hex: 00 00 00 00 05 00 00 00 00 00 00 00 ...
[CAPNP:DEBUG] [RCV] Return (answerId=1)
  Result: success (30 bytes)
  Hex: 00 00 00 00 00 00 00 00 0a 00 00 00 ...
```

## 性能影响

调试模式有以下性能影响：

### 禁用时（默认）

当调试模式禁用时：
- 调试检查无运行时开销
- 调试代码在生产构建中可被 tree-shake
- 零内存开销

### 启用时

当调试模式启用时：
- **CPU**: 由于消息检查，约 5-10% 的开销
- **内存**: 十六进制格式化需要额外的缓冲
- **I/O**: 控制台输出可能在高吞吐场景下拖慢速度

### 建议

1. **开发环境**: 开发时始终启用调试模式
2. **生产环境**: 使用环境变量条件启用
3. **高吞吐**: 使用过滤减少日志量
4. **大数据**: 在大消息场景下降低 `maxBytes`

```typescript
// 生产环境安全的调试设置
import { enableDebug } from '@naeemo/capnp';

if (process.env.NODE_ENV !== 'production' || process.env.CAPNP_DEBUG) {
  enableDebug({
    colors: process.env.NODE_ENV !== 'production',
    maxBytes: 128,
    filter: process.env.CAPNP_FILTER
  });
}
```

## 故障排除技巧

### 无调试输出

1. 验证调试模式是否启用：`console.log(isDebugEnabled())`
2. 检查过滤设置 - 可能过于严格
3. 确保在启用调试后再导入其他模块

### 输出过多

1. 使用 `filter` 选项缩小范围
2. 降低 `maxBytes` 限制二进制数据
3. 如果输出到文件，考虑禁用颜色

### 性能问题

1. 生产构建中禁用调试
2. 对高频消息使用积极的过滤
3. 设置 `maxBytes: 0` 完全跳过二进制数据

## 与日志库集成

调试 API 可以与结构化日志系统集成：

```typescript
import { enableDebug, isDebugEnabled } from '@naeemo/capnp';
import { createLogger } from './my-logger';

const logger = createLogger();

// 启用 Cap'n Proto 调试模式
enableDebug({
  colors: false,  // 让日志库处理颜色
  maxBytes: 256
});

// 重定向调试输出到你的日志库
const originalLog = console.log;
console.log = (...args) => {
  if (isDebugEnabled() && args[0]?.includes('[CAPNP:DEBUG]')) {
    logger.debug('capnp', args.join(' '));
  } else {
    originalLog.apply(console, args);
  }
};
```
