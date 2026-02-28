# Cap'n Proto TS - 纯 TypeScript 实现

## 架构

```
src/
├── core/           # 核心序列化/反序列化
│   ├── message.ts  # MessageReader/MessageBuilder
│   ├── segment.ts  # Segment 管理
│   ├── pointer.ts  # 指针编解码
│   └── layout.ts   # 内存布局计算
├── types/          # 类型定义
│   ├── struct.ts   # StructReader/StructBuilder
│   ├── list.ts     # ListReader/ListBuilder
│   ├── text.ts     # Text 类型
│   └── data.ts     # Data 类型
├── codegen/        # 代码生成器
│   ├── parser.ts   # Schema 解析
│   └── generator.ts # TS 代码生成
└── index.ts        # 导出
```

## 核心设计

- **零拷贝读取**: 直接操作 ArrayBuffer，不解析
- **按需分配**: Builder 动态扩展 segment
- **类型安全**: 生成的代码提供完整类型

## 状态

- [x] 基础读写
- [ ] List 完整实现
- [ ] Union 支持
- [ ] 代码生成器
