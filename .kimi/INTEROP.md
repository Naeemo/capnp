# C++ 互操作测试策略

## 两种场景

### 1. Node.js <-> C++ ✅ 已解决

**场景**: Node.js 服务端与 C++ 服务直接通信

**方案**: `EzRpcTransport` - 原始 TCP  socket
- 不使用长度前缀
- 直接发送 Cap'n Proto 消息流
- 与 C++ `EzRpcServer` 完全兼容

**状态**: ✅ 已实现，Bootstrap 握手成功

---

### 2. 浏览器 <-> C++ ❌ 待解决

**场景**: 浏览器前端与 C++ 服务通信

**问题**: 
- 浏览器只能通过 WebSocket 建立原始 socket 连接
- C++ EzRpc 使用原始 TCP，不支持 WebSocket
- 协议不匹配

**可能的解决方案**:

#### 方案 A: C++ 服务器添加 WebSocket 支持
- 修改 `interop-server.cpp`，使用 `libcapnp-websocket`
- 或者使用第三方库如 `uWebSockets` 包装 RPC
- **优点**: 端到端 Cap'n Proto，无中间层
- **缺点**: 需要修改/重编译 C++ 服务器

#### 方案 B: WebSocket-to-TCP 代理
- 部署一个代理服务，将 WebSocket 桥接到 TCP
- **优点**: 不需要修改 C++ 服务器
- **缺点**: 增加部署复杂度，可能有性能损耗

#### 方案 C: 使用 Cap'n Proto 的 WebSocket 实现
- Cap'n Proto C++ 库有实验性的 WebSocket 支持
- **优点**: 官方支持
- **缺点**: 可能需要较新版本，文档较少

---

## 推荐方案

**短期**: 先完善 Node.js <-> C++ 互操作测试，确保协议兼容性

**中期**: 实现方案 B（WebSocket-to-TCP 代理）作为过渡方案

**长期**: 推动方案 A，让 C++ 实现原生支持 WebSocket 传输

---

## 技术细节

### EzRpc 消息格式
```
[Cap'n Proto Message 1][Cap'n Proto Message 2]...
```
- 无长度前缀
- 无消息边界标记
- 依赖 TCP 流的有序性

### WebSocket 消息格式
```
[length: 4 bytes][message data: N bytes]
```
- 需要长度前缀来区分消息边界
- WebSocket 帧本身提供边界，但应用层仍需处理

### 桥接方案
```
浏览器 ──WebSocket──> 代理 ──raw TCP──> C++ EzRpcServer
         (长度前缀)          (无长度前缀)
         
代理工作:
1. 接收 WebSocket 消息 (带长度前缀)
2. 去掉长度前缀
3. 发送到 C++ 服务器
4. 接收响应
5. 添加长度前缀
6. 通过 WebSocket 返回
```

---

## 下一步行动

1. ✅ 完成 Node.js 端互操作测试（当前）
2. 实现 WebSocket-to-TCP 代理
3. 添加浏览器端互操作测试
4. 考虑 C++ 服务器的 WebSocket 支持

---

## 参考

- [Cap'n Proto RPC](https://capnproto.org/rpc.html)
- [C++ RPC Documentation](https://capnproto.org/cxxrpc.html)
- `src/rpc/ezrpc-transport.ts` - Node.js 实现
