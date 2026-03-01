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
- [ ] RPC 层（长期）
- [ ] 发布 v0.2.0 到 npm

### 最新进展 (2026-03-02)
- ✅ **多 Segment / Far Pointer 支持**
  - MessageReader 支持解析 multi-segment 消息
  - 实现 `resolvePointer()` 方法处理 far pointer 间接寻址
  - 支持 single-far 和 double-far 两种模式
  - StructReader.getText/getStruct/getList 全部支持跨 segment 访问
  - ListReader 支持多 segment
- ✅ **Union discriminant offset 修复**
  - 修复了 discriminantOffset 单位问题（schema 中以 16-bit words 为单位，需要乘以 2 转换为 byte offset）
  - Union getter 现在正确使用 `discriminantOffset * 2`
  - Union setter 现在通过参数传递正确的 discriminantOffset
- ✅ V3 CLI 工具完成 (`src/codegen/cli-v3.ts`)
  - 自动调用 `capnp compile -o-` 编译 schema
  - 支持 `-o` 单文件输出、`-d` 多文件输出到目录
  - 支持 `-r` 自定义运行时导入路径
  - 添加到 package.json bin: `capnp-ts-codegen`
- ✅ V3 生成器 Union 支持
  - 自动识别 Union 字段（discriminantValue ≠ 0xFFFF）
  - 生成 `getUnionTag()` / `getUnionVariant()` 方法
  - 每个 variant 生成独立的 getter/setter
  - 生成类型安全的 Union variant 类型
- ✅ **V3 生成器 Group 支持**
  - 自动识别 Group 字段（isGroup === true）
  - Group 字段内联到父 struct 中
  - 生成带前缀的 getter/setter（如 `getAddressStreet()`）
- ✅ **V3 生成器默认值支持（XOR 编码）**
  - 从 binary schema 读取字段默认值
  - 生成 XOR 编码/解码逻辑
  - 支持所有数值类型（int/uint/float/bool/enum）
  - 自动生成 float XOR 辅助函数
- 所有 143 个测试通过

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

### Phase 2: 兼容性
7. ✅ 多 Segment / Far Pointer
8. [ ] 互操作测试完善

### Phase 3: 进阶
9. [ ] 性能优化
10. [ ] RPC 层

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
