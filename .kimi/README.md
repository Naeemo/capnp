# @naeemo/capnp 项目核心信息

## 项目定位
纯 TypeScript 实现的 Cap'n Proto，零拷贝反序列化，与官方 C++ 实现兼容。

## 当前状态 (2026-03-01)

### 已完成
- [x] 核心序列化：MessageBuilder, MessageReader, List, Pointer, Segment
- [x] 基础代码生成：v2 版本在用，支持 struct/enum/List
- [x] 测试框架：Vitest
- [x] 文档：VitePress 站点
- [x] **Binary Schema 解析器**：可以读取官方 `capnp compile -o-` 生成的编译后 schema
- [x] **V3 代码生成器**：使用 binary schema 生成 TypeScript（Interface + Reader + Builder）

### 进行中 / 待完成
- [ ] Union 完整支持（tag 处理）- 基础支持已就绪
- [ ] Group 支持
- [ ] 默认值（XOR 编码）
- [ ] 多 Segment / Far Pointer
- [ ] 重构 CLI 使用 V3 生成器（替代 parser-v2/generator-v2）
- [ ] RPC 层（长期）

### 最新进展
- V3 代码生成器 (`generator-v3.ts`) 完成基础功能
  - 从 binary schema 生成 TypeScript 代码
  - 支持 Interface、Reader 类、Builder 类
  - 支持 struct 和 enum
- 所有 135 个测试通过

## 技术决策

### Schema 解析策略
- **当前**：正则解析器（临时方案，功能有限）
- **目标**：调用 `capnp compile -o binary` 生成编译后 schema，解析二进制格式
- **原因**：字段布局算法复杂，官方已处理好 offset/dataWords/pointerCount

### 代码生成策略
- 基于编译后的 schema 生成 TypeScript
- Reader 类：getter + 类型安全
- Builder 类：setter + factory

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
    generator-v3.ts     # 新版，使用 binary schema
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
3. [ ] Union 完整支持
4. [ ] Group 支持

### Phase 2: 兼容性
5. [ ] 默认值（XOR 编码）
6. [ ] 多 Segment / Far Pointer
7. [ ] 互操作测试完善

### Phase 3: 进阶
8. [ ] 性能优化
9. [ ] RPC 层

## 关键参考

- 官方协议：https://capnproto.org/encoding.html
- 官方语言规范：https://capnproto.org/language.html
- 路线图：https://capnproto.org/roadmap.html

## 维护者

- Naeemo <naeemo@qq.com>
- Kimi (AI assistant)
