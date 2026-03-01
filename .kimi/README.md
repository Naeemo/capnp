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

### 进行中 / 待完成
- [ ] Union 完整支持（tag 处理）- 基础支持已就绪
- [ ] Group 支持
- [ ] 默认值（XOR 编码）
- [ ] 多 Segment / Far Pointer
- [ ] 重构代码生成器使用 binary schema（替代正则 parser）
- [ ] RPC 层（长期）

### 最新进展
- 清理了测试中的 debug console.log，保持测试输出整洁
- Binary Schema 解析器稳定运行，支持 struct/enum 读取
- 所有测试通过（134 tests）

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
  codegen/        # 代码生成
    parser-v2.ts      # 当前在用（正则）
    generator-v2.ts   # 当前在用
    struct-gen.ts
    enum-gen.ts
    type-utils.ts
  cli/            # 命令行工具
  test/           # 测试
  interop/        # 与官方实现互操作测试
```

## 开发路线图

### Phase 1: 基础补全
1. 接入官方 schema 编译器（binary schema 解析）
2. Union 完整支持
3. Group 支持

### Phase 2: 兼容性
4. 默认值（XOR 编码）
5. 多 Segment / Far Pointer
6. 互操作测试完善

### Phase 3: 进阶
7. 性能优化
8. RPC 层

## 关键参考

- 官方协议：https://capnproto.org/encoding.html
- 官方语言规范：https://capnproto.org/language.html
- 路线图：https://capnproto.org/roadmap.html

## 维护者

- Naeemo <naeemo@qq.com>
- Kimi (AI assistant)
