# @naeemo/capnp 项目核心信息

## 项目定位
纯 TypeScript 实现的 Cap'n Proto，零拷贝反序列化，与官方 C++ 实现兼容。

## 当前状态 (2026-03-02)

### 已完成
- [x] 核心序列化：MessageBuilder, MessageReader, List, Pointer, Segment
- [x] 基础代码生成：v2 版本在用，支持 struct/enum/List
- [x] 测试框架：Vitest
- [x] 文档：VitePress 站点
- [x] **Binary Schema 解析器**：可以读取官方 `capnp compile -o-` 生成的编译后 schema
- [x] **V3 代码生成器**：使用 binary schema 生成 TypeScript（Interface + Reader + Builder）
- [x] **V3 CLI 工具** (`cli-v3.ts`)：使用官方 capnp 编译器生成代码
- [x] **Union 代码生成**：V3 生成器支持 Union 字段（discriminant + variant）

### 进行中 / 待完成
- [x] Group 支持 ✅
- [x] 默认值（XOR 编码）✅
- [x] 多 Segment / Far Pointer ✅（支持 single-far 和 double-far 间接寻址）
- [x] Union discriminant offset 从 schema 读取 ✅（已修复：discriminantOffset 需要乘以 2 转换为 byte offset）
- [x] Union setter 中的 discriminantOffset 硬编码问题 ✅（已修复：通过函数参数传递）
- [x] 类型检查和 lint 修复 ✅
- [x] 构建和测试 ✅（v0.2.0 已准备就绪）
- [x] 推送到 GitHub ✅（21 commits 已推送）
- [x] 发布 v0.2.0 到 npm ✅（已通过 GitHub Actions 自动发布）
- [x] **Phase 2 互操作测试** ✅（19 个新测试，总计 33 个互操作测试）
- [ ] RPC 层（长期）

### 最新进展 (2026-03-02)
- ✅ **Phase 2 互操作测试完成** - 新增 19 个测试，总计 33 个互操作测试全部通过
- ✅ **v0.2.0 已发布到 npm** - 通过 GitHub Actions 自动发布
- ✅ **多 Segment / Far Pointer 支持**
- ✅ **Union discriminant offset 修复**
- ✅ V3 CLI 工具完成 (`src/codegen/cli-v3.ts`)
- ✅ V3 生成器 Union 支持
- ✅ **V3 生成器 Group 支持**
- ✅ **V3 生成器默认值支持（XOR 编码）**
- 所有 162 个测试通过

## 技术决策

### Schema 解析策略
- **当前**：正则解析器（临时方案，功能有限）
- **目标**：调用 `capnp compile -o binary` 生成编译后 schema，解析二进制格式
- **原因**：字段布局算法复杂，官方已处理好 offset/dataWords/pointerCount

### 代码生成策略
- 基于编译后的 schema 生成 TypeScript
- Reader 类：getter + 类型安全
- Builder 类：setter + factory
- Union：discriminant 检查 + variant 类型

## 目录结构

```
src/
  core/           # 核心序列化
    message-builder.ts
    message-reader.ts
    list.ts
    pointer.ts
    segment.ts
    union.ts
  schema/         # Binary schema 解析
    schema-reader.ts    # 读取 capnp compile -o- 输出
  codegen/        # 代码生成
    parser-v2.ts        # 当前在用（正则）- 待废弃
    generator-v2.ts     # 当前在用 - 待废弃
    generator-v3.ts     # 新版，使用 binary schema，支持 Union
    cli-v3.ts           # V3 CLI 工具
    struct-gen.ts
    enum-gen.ts
    type-utils.ts
  cli/            # 命令行工具
  test/           # 测试
  interop/        # 与官方实现互操作测试
```

## 开发路线图

### Phase 1: 基础补全 (进行中)
1. ✅ 接入官方 schema 编译器（binary schema 解析）
2. ✅ V3 代码生成器基础
3. ✅ V3 CLI 工具
4. ✅ Union 代码生成支持
5. ✅ Group 支持
6. ✅ 默认值（XOR 编码）

### Phase 2: 兼容性 ✅ 已完成
7. ✅ 多 Segment / Far Pointer
8. ✅ 互操作测试完善 (33 个测试通过)

### Phase 3: RPC 层 (进行中)
9. ✅ Interface 代码生成
   - Method ID 常量生成
   - Server Interface 生成
   - Client Class 生成（支持 Promise Pipelining）
10. [ ] 集成测试（与 C++ 实现互操作）
11. [ ] 性能优化

## 使用 V3 CLI

```bash
# 安装 capnp 工具后
npx capnp-ts-codegen schema.capnp -o types.ts
npx capnp-ts-codegen schema.capnp -d ./generated
npx capnp-ts-codegen schema.capnp -o types.ts -r ../my-runtime
```

## 关键参考

- 官方协议：https://capnproto.org/encoding.html
- 官方语言规范：https://capnproto.org/language.html
- 路线图：https://capnproto.org/roadmap.html

## 维护者

- Naeemo <naeemo@qq.com>
- Kimi (AI assistant)
