# Cap'n Proto TypeScript - 官方实现互操作测试

本目录包含与官方 Cap'n Proto C++ 实现的互操作测试。

## 测试策略

1. **使用官方工具生成二进制消息**
   - 使用 `capnp compile` 编译 schema
   - 使用 `capnp convert text:binary` 从文本格式生成二进制消息

2. **使用 capnp-ts 读取并验证**
   - 使用 `MessageReader` 读取官方生成的二进制文件
   - 验证字段值与预期一致

## 测试文件

### Schema 文件
- `test-schema.capnp` - 测试用的 schema 定义

### 二进制测试数据（data/目录）
- `basic_types.bin` - 基础类型测试（所有数值类型 + bool）
- `empty_basic.bin` - 空消息（默认值）
- `max_values.bin` - 最大值测试
- `min_values.bin` - 最小值测试
- `text_types.bin` - 文本和数据类型测试
- `unicode_text.bin` - 简单文本测试
- `nested_struct.bin` - 嵌套结构测试
- `list_types.bin` - 列表类型测试
- `addressbook.bin` - AddressBook 复杂结构测试
- `union_type.bin` - 联合体类型测试

### 测试代码
- `official.test.ts` - 互操作测试用例

## 运行测试

```bash
pnpm test src/interop/official.test.ts
```

## 生成新的测试数据

```bash
# 编辑 text 格式的消息
cat > message.txt << 'EOF'
(int8Field = -42, int16Field = -1000, int32Field = 123456)
EOF

# 转换为二进制
capnp convert text:binary test-schema.capnp BasicTypes < message.txt > data/message.bin

# 验证
capnp convert binary:text test-schema.capnp BasicTypes < data/message.bin
```

## 已知限制

1. **复合列表处理**：capnp-ts 目前不完全支持复合列表（struct list）的标签字处理。
   复合列表的第一个字是一个特殊的"标签"，包含元素数量和每个元素的大小信息。
   当前实现需要手动计算元素偏移。

2. **字段偏移量**：Cap'n Proto 编译器会根据字段类型和编号重新排列字段以优化内存布局。
   测试中使用的是从官方 C++ 生成的代码中推导出的实际偏移量。

## 字段布局参考

Cap'n Proto 使用以下规则排列字段：
- 字段按编号顺序分配位置
- 每个字段根据其类型对齐（1/2/4/8 字节）
- 小字段可以填充在大字段的 padding 中

例如 BasicTypes 的实际布局：
```
int8Field  @0 :Int8    - byte 0
uint8Field @4 :UInt8   - byte 1 (fills padding after int8)
int16Field @1 :Int16   - byte 2
int32Field @2 :Int32   - byte 4
int64Field @3 :Int64   - byte 8
uint16Field@5 :UInt16  - byte 16
boolField  @10:Bool    - bit 144 = byte 18, bit 0
uint32Field@6 :UInt32  - byte 20
uint64Field@7 :UInt64  - byte 24
float32Field@8:Float32 - byte 32
float64Field@9:Float64 - byte 40
```
