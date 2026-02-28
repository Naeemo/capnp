# Cap'n Proto TS - 任务清单

## 目标
提供生产级 TypeScript Cap'n Proto 实现

## 当前策略
**纯 TypeScript 实现**（非 WASM）

## 任务清单

### Phase 1: 核心功能 ✅
- [x] MessageReader / MessageBuilder
- [x] StructReader / StructBuilder（基础类型）
- [x] 指针编解码
- [x] List 基础实现
- [x] Union 支持
- [x] Far Pointer（多段消息基础）
- [x] 默认字段值（通过代码生成器处理）

### Phase 2: 代码生成器 ✅
- [x] Schema 解析器基础框架
- [x] TypeScript 代码生成
- [x] CLI 工具
- [x] 基础嵌套结构支持

### Phase 3: 测试与优化 ✅
- [x] 核心功能测试（160 个测试通过）
- [x] 与官方实现互操作测试
  - [x] BasicTypes（所有基础类型）
  - [x] TextTypes（文本和数据）
  - [x] NestedStruct（嵌套结构）
  - [x] ListTypes（列表类型）
  - [x] AddressBook（复杂嵌套结构）
  - [x] UnionType（联合体类型）
- [x] 边界情况测试（空消息、数值极限、深嵌套等）
- [x] 所有数据类型测试
- [x] 错误处理测试
- [x] Union 布局测试
- [x] 多段消息基础测试
- [x] 性能基准测试（详见 PERFORMANCE.md）
  - 简单结构: ~1.4μs 序列化
  - 反序列化比序列化快2-3倍
  - 适合高频RPC场景

### Phase 4: 发布
- [ ] NPM 包配置
- [ ] 完整文档
- [ ] 示例项目
- [ ] CI/CD

## 当前状态
- ✅ 纯 TS 实现已完成所有核心功能
- ✅ **160 个测试全部通过**
- ✅ 性能基准测试完成
- ✅ CLI 工具可用
- ✅ 与官方 C++ 实现互操作验证完成
- ⏳ 准备发布

## 测试覆盖
详见 [TEST_COVERAGE.md](./TEST_COVERAGE.md)

## 性能
详见 [PERFORMANCE.md](./PERFORMANCE.md)

## 使用方法

```typescript
// 构建消息
const builder = new MessageBuilder();
const root = builder.initRoot(2, 1);
root.setInt32(0, 42);
root.setText(0, 'hello');
const buffer = builder.toArrayBuffer();

// 读取消息
const reader = new MessageReader(buffer);
const data = reader.getRoot(2, 1);
console.log(data.getInt32(0)); // 42
```

```bash
# 代码生成
npx tsx src/cli/codegen.ts schema.capnp -o output.ts
```
