# C++ Interop Test Progress Report

## Date: 2026-03-03

## Summary

✅ **Node.js ↔ C++ 互操作测试已完成**

已成功实现 TypeScript capnp-ts 与官方 C++ EzRpc 实现的协议层互操作。

## 已完成工作

### 1. EzRpcTransport 实现 ✅

`src/rpc/ezrpc-transport.ts`:
- 原始 TCP socket 传输
- 不使用长度前缀（与 C++ EzRpc 兼容）
- 支持单段/多段消息解析
- 完整的 RpcTransport 接口实现

### 2. 互操作测试套件 ✅

`src/interop-cpp/interop.test.ts`:

| 测试 | 状态 | 说明 |
|------|------|------|
| TCP 连接建立 | ✅ | 原始 socket 连接成功 |
| Bootstrap 握手 | ✅ | 收到正确的 Return 响应 |
| Call 消息 | ✅ | 服务器响应正常 |
| 无效接口处理 | ✅ | 错误处理正确 |
| RPC 连接 | ✅ | RpcConnection 集成正常 |

### 3. 关键发现 ✅

**EzRpc 消息格式**:
```
[Cap'n Proto Message 1][Cap'n Proto Message 2]...
```
- 无长度前缀
- 无消息边界标记
- 依赖 TCP 流的有序性
- 通过 Cap'n Proto header 解析消息边界

**与 WebSocket 传输的区别**:
```
WebSocket: [length: 4 bytes][message data: N bytes]
EzRpc:     [message data: N bytes] (无长度前缀)
```

## 运行测试

```bash
# 启动 C++ 服务器
cd src/interop-cpp
export LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu
./interop-server server 0.0.0.0:18080

# 运行测试
CAPNP_TEST_HOST=localhost CAPNP_TEST_PORT=18080 \
  npx vitest run src/interop-cpp/interop.test.ts
```

## 下一步

### 浏览器 ↔ C++ 互操作（待解决）

浏览器无法直接与 C++ EzRpc 通信，因为：
- 浏览器只能使用 WebSocket
- C++ EzRpc 使用原始 TCP

**方案对比**:

| 方案 | 复杂度 | 优点 | 缺点 |
|------|--------|------|------|
| WebSocket-to-TCP 代理 | 中 | 无需修改 C++ | 多一层部署 |
| C++ WebSocket 支持 | 高 | 端到端干净 | 需修改/重编译 C++ |
| 官方 WebSocket 实现 | 中 | 官方支持 | 版本/文档问题 |

**推荐**: 先实现 WebSocket-to-TCP 代理作为过渡方案。

## 文件清单

```
src/interop-cpp/
├── README.md              # 使用说明
├── PROGRESS.md            # 本文件
├── interop.capnp          # 测试 schema
├── interop-server.cpp     # C++ 实现
├── interop-server         # 编译后的二进制
├── interop.test.ts        # TypeScript 测试
└── Makefile               # 构建脚本

src/rpc/
├── ezrpc-transport.ts     # EzRpc 传输实现
├── tcp-transport.ts       # 带长度前缀的 TCP
├── websocket-transport.ts # WebSocket 传输
└── index.ts               # 导出

.kimi/
├── INTEROP.md             # 互操作策略文档
└── NOTES.md               # 开发笔记
```

## 参考

- [Cap'n Proto RPC](https://capnproto.org/rpc.html)
- [C++ RPC](https://capnproto.org/cxxrpc.html)
- [EzRpcTransport](../../src/rpc/ezrpc-transport.ts)
- [Interop Tests](../../src/interop-cpp/interop.test.ts)
