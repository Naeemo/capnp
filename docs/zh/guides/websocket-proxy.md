# WebSocket-to-TCP 代理

通过 WebSocket 让浏览器连接原生 Cap'n Proto 服务（C++ 等）。

## 概述

浏览器只能使用 WebSocket，而原生 Cap'n Proto 服务使用原始 TCP。本代理桥接两者：

```
浏览器 ──WebSocket──→ 代理 ──TCP──→ C++ Cap'n Proto 服务
```

## 快速开始

### 1. 启动 Cap'n Proto 服务

例如，一个在 7000 端口的 C++ 服务：

```bash
./my-cpp-capnp-server --port 7000
```

### 2. 启动代理

```bash
npx @naeemo/capnp proxy -p 9000 -t localhost:7000
```

选项：
- `-p, --ws-port`: WebSocket 服务器端口（默认：8080）
- `-t, --target`: 目标 TCP 服务（默认：localhost:8081）
- `-d, --debug`: 启用调试日志

### 3. 从浏览器连接

```typescript
import { RpcConnection, WebSocketTransport } from '@naeemo/capnp';
import { MyService } from './my-service.js';

// 通过代理连接
const transport = await WebSocketTransport.connect('ws://localhost:9000');
const connection = new RpcConnection(transport);

// 像直接连接一样使用服务
const service = await connection.bootstrap().getAs(MyService);
const result = await service.myMethod({ data: 'hello' });
```

## 编程方式使用

```typescript
import { CapnpWebSocketProxy } from '@naeemo/capnp';

const proxy = new CapnpWebSocketProxy({
  wsPort: 9000,
  targetHost: 'localhost',
  targetPort: 7000,
  maxMessageSize: 16 * 1024 * 1024, // 16MB
  connectionTimeout: 30000, // 30 秒
  debug: true,
});

// 监控连接
proxy.on('connection', (conn) => {
  console.log('新连接');
});

proxy.on('disconnection', (conn) => {
  console.log('连接关闭');
  console.log('统计:', conn.getStats());
});

// 关闭
await proxy.close();
```

## 架构

### 消息流

1. **浏览器 → 代理**: WebSocket 二进制消息
2. **代理 → TCP 服务**: 原始字节（无修改）
3. **TCP 服务 → 代理**: 原始字节
4. **代理 → 浏览器**: WebSocket 二进制消息

### 协议兼容性

| 特性 | 浏览器 | 代理 | TCP 服务 |
|---------|---------|-------|-------------|
| 传输 | WebSocket | 桥接 | TCP |
| 帧 | WebSocket 帧 | 透传 | Cap'n Proto 消息 |
| 二进制 | ✅ | ✅ | ✅ |
| 全双工 | ✅ | ✅ | ✅ |

## 使用场景

### 原生服务的 Web 仪表板

```typescript
// 浏览器：来自 C++ 后端的实时指标
const transport = await WebSocketTransport.connect('ws://proxy:9000');
const metrics = await connection.bootstrap().getAs(MetricsService);

// 流式实时数据
for await (const update of metrics.subscribe()) {
  updateChart(update);
}
```

### 跨语言 RPC

```typescript
// 浏览器 (TypeScript) 调用 Python 服务
// 浏览器 → 代理 → Python Cap'n Proto 服务器
const transport = await WebSocketTransport.connect('ws://proxy:9000');
const pythonService = await connection.bootstrap().getAs(PythonService);
```

### 开发和调试

```bash
# 为浏览器开发工具代理本地 C++ 服务
npx @naeemo/capnp proxy -p 9000 -t localhost:7000 --debug
```

## 性能

| 指标 | 值 |
|--------|-------|
| 延迟开销 | ~1-2ms |
| 吞吐量 | 900+ MB/s |
| 并发连接 | 1000+ |
| 消息大小限制 | 可配置（默认 16MB） |

## 安全注意事项

1. **CORS**: 代理接受来自任何源的连接。生产环境部署在反向代理（nginx 等）后面。

2. **TLS**: 生产环境使用 WSS（WebSocket Secure）：
   ```
   浏览器 ──WSS──→ nginx ──WS──→ 代理 ──TCP──→ 服务
   ```

3. **认证**: 在应用层实现认证（Cap'n Proto capabilities）或在 WebSocket URL 中使用 token。

## 故障排除

### 连接被拒绝

检查目标 TCP 服务是否正在运行：
```bash
telnet localhost 7000
```

### 大消息失败

增加最大消息大小：
```typescript
const proxy = new CapnpWebSocketProxy({
  wsPort: 9000,
  targetHost: 'localhost',
  targetPort: 7000,
  maxMessageSize: 64 * 1024 * 1024, // 64MB
});
```

### 调试模式

启用详细日志：
```bash
npx @naeemo/capnp proxy -p 9000 -t localhost:7000 --debug
```

## 完整示例

参见 [examples/websocket-proxy](../../examples/websocket-proxy/) 获取完整工作示例，包括：
- C++ Cap'n Proto 服务器
- WebSocket-to-TCP 代理
- 浏览器客户端

## API 参考

### `CapnpWebSocketProxy`

主代理类。

#### 构造函数

```typescript
new CapnpWebSocketProxy(options: ProxyOptions)
```

#### 方法

- `getConnectionCount(): number` - 活跃连接数
- `getAllStats(): ConnectionStats[]` - 所有连接的统计
- `close(): Promise<void>` - 优雅关闭

#### 事件

- `connection` - 新客户端连接
- `disconnection` - 客户端断开
- `error` - 发生错误

### `ProxyOptions`

| 选项 | 类型 | 默认 | 描述 |
|--------|------|---------|-------------|
| `wsPort` | `number` | 必需 | WebSocket 服务器端口 |
| `targetHost` | `string` | 必需 | 目标 TCP 主机 |
| `targetPort` | `number` | 必需 | 目标 TCP 端口 |
| `maxMessageSize` | `number` | `16MB` | 最大 WebSocket 消息大小 |
| `connectionTimeout` | `number` | `30000` | TCP 连接超时（毫秒） |
| `debug` | `boolean` | `false` | 启用调试日志 |
