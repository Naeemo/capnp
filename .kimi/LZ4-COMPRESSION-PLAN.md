# Cap'n Proto TypeScript - LZ4 传输层压缩方案

## 1. 官方规范确认

**官方 Cap'n Proto 编码规范** (https://capnproto.org/encoding.html) **没有定义 LZ4 压缩**。

Cap'n Proto 的设计哲学：
- **零拷贝** - 数据直接写入 buffer，无需编码
- **无压缩** - 依赖传输层处理压缩（如有需要）
- **自描述** - 消息格式本身不包含压缩元数据

**结论**: LZ4 压缩应在传输层实现，作为**可选的传输优化**，而非协议修改。

---

## 2. 方案设计

### 2.1 核心原则

1. **向后兼容** - 不支持 LZ4 的一端应能正常通信
2. **自动协商** - 连接建立时自动检测对端能力
3. **透明性** - 对应用层完全透明，传输层自动处理
4. **可选启用** - 默认关闭，显式开启

### 2.2 压缩帧格式

在 Cap'n Proto 消息外包裹压缩层：

```
+--------+--------+--------+------------------------+
|  Magic |  Flags | Length |  Compressed Payload    |
| 4bytes | 1byte  | 4bytes |       (variable)       |
+--------+--------+--------+------------------------+
```

- **Magic**: `0x4C5A3401` (LZ4\0\x01)
- **Flags**: Bit 0 = 是否压缩，Bit 1-7 = 保留
- **Length**: 原始消息长度（用于解压时分配 buffer）
- **Payload**: LZ4 压缩后的数据

**非压缩消息**直接发送原始 Cap'n Proto 字节（无前缀），保持向后兼容。

---

## 3. 场景处理

### 3.1 Node.js ↔ Node.js（闭环）

```
Node.js A              Node.js B
    |                       |
    |----- 握手: 支持 LZ4? -----|
    |<---- 是, 我也支持 --------|
    |                       |
    |-- LZ4(消息) --------->|
    |<--------- LZ4(消息) --|
```

**实现**: 两端都支持，自动启用压缩。

### 3.2 Browser ↔ Node.js（闭环）

```
Browser              Node.js
    |                    |
    |--- 握手: 支持 LZ4? ---|
    |<-- 是, 我也支持 ------|
    |                    |
    |-- LZ4(消息) ------->|
    |<-------- LZ4(消息) --|
```

**实现**: WebSocket 传输，两端都是我们的实现，支持 LZ4。

### 3.3 Browser ↔ Node.js ↔ TCP Proxy ↔ Native C++ Capnp

这是**关键场景**，需要区分 Proxy 两侧：

```
Browser              Node.js Proxy              C++ Capnp
    |                       |                       |
    |-- WebSocket: LZ4 OK? --|                       |
    |<-- OK, 支持 LZ4 -------|                       |
    |                       |-- TCP: LZ4 OK? -------|
    |                       |<-- 不支持/不响应 -----|
    |                       |                       |
    |-- LZ4(消息) --------->|                       |
    |                       |-- 解压 -> 转发 ------>|
    |                       |                       |
    |                       |<-- 原始消息 ----------|
    |                       |                       |
    |<-- LZ4(压缩后) --------|                       |
```

**关键设计**: Proxy 两侧**独立协商**
- Browser 侧: 支持 LZ4 → 启用压缩
- C++ 侧: 不支持 LZ4 → 原始传输
- Proxy: 中间解压/压缩转换

---

## 4. API 设计

### 4.1 传输层配置

```typescript
interface TransportOptions {
  compression?: {
    enabled: boolean;        // 默认 false
    algorithm: 'lz4';        // 未来可扩展
    threshold: number;       // 最小压缩字节数（默认 1024）
    level?: number;          // 压缩级别 1-12
  };
}

// 使用示例
const transport = new TcpTransport({
  compression: {
    enabled: true,
    threshold: 512  // 小于 512 字节不压缩
  }
});
```

### 4.2 WebSocket Proxy 配置

```typescript
interface WebSocketProxyOptions {
  wsPort: number;
  targetHost: string;
  targetPort: number;
  compression?: {
    // WebSocket 侧配置
    ws: {
      enabled: boolean;
      threshold: number;
    };
    // TCP 侧配置（通常关闭，因为原生服务可能不支持）
    tcp: {
      enabled: boolean;
      threshold: number;
    };
  };
}
```

### 4.3 压缩协商协议

连接建立时发送**能力声明**（Cap'n Proto 格式）：

```capnp
struct TransportCapabilities {
  compression @0 :List(CompressionAlgorithm);
  # 支持的压缩算法列表
}

enum CompressionAlgorithm {
  none @0;
  lz4 @1;
}
```

**协商流程**:
1. 连接建立后，双方发送 `TransportCapabilities`
2. 选择共同支持的算法（优先 LZ4）
3. 后续消息按协商结果处理

---

## 5. 实现计划

### 5.1 依赖

- `lz4` npm 包（Node.js 端）
- `lz4js` 或 wasm 版本（Browser 端）

### 5.2 文件结构

```
src/
├── compression/
│   ├── index.ts           # 公共接口
│   ├── lz4.ts             # LZ4 压缩/解压
│   ├── frame.ts           # 帧格式编解码
│   └── negotiation.ts     # 能力协商
├── transport/
│   ├── tcp-transport.ts   # 添加压缩支持
│   └── websocket-transport.ts
└── proxy/
    └── websocket-proxy.ts # 两侧独立配置
```

### 5.3 里程碑

| 阶段 | 工作内容 | 预计时间 |
|------|---------|---------|
| M1 | LZ4 帧格式 + 编解码 | 4h |
| M2 | 能力协商协议 | 3h |
| M3 | TcpTransport 集成 | 3h |
| M4 | WebSocket Transport 集成 | 3h |
| M5 | Proxy 两侧独立配置 | 4h |
| M6 | 测试 + 文档 | 3h |
| **总计** | | **20h** |

---

## 6. 性能预期

| 场景 | 原始大小 | LZ4 压缩后 | 压缩率 |
|------|---------|-----------|-------|
| 小消息 (100B) | 100B | ~105B | -5% (不划算) |
| 中等 (1KB) | 1KB | ~600B | 40% |
| 大消息 (10KB) | 10KB | ~5KB | 50% |
| 超大 (100KB) | 100KB | ~45KB | 55% |

**建议阈值**: 512-1024 字节以下不压缩。

---

## 7. 决策点

1. **是否实现?** - 可选优化，非必需
2. **优先级?** - 中低，等功能稳定后再做
3. **是否强制?** - 否，必须向后兼容
4. **浏览器支持?** - 需要 wasm 或纯 JS LZ4 实现

---

*方案设计完成，等待确认*
