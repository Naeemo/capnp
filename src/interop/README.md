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
- `test-schema.capnp` - Phase 1 测试用的 schema 定义
- `test-schema-phase2.capnp` - Phase 2 扩展 schema 定义

### 二进制测试数据（data/目录）

#### Phase 1 测试数据
- `basic_types.bin` - 基础类型测试（所有数值类型 + bool）
- `empty_basic.bin` - 空消息（默认值）
- `max_values.bin` - 最大值测试
- `min_values.bin` - 最小值测试
- `text_types.bin` - 文本和数据类型测试
- `unicode_text.bin` - 简单文本测试
- `nested_struct.bin` - 嵌套结构测试
- `list_types.bin` - 列表类型测试
- `addressbook.bin` - AddressBook 复杂结构测试
- `union_type.bin` - 联合体类型测试（textVal 变体）

#### Phase 2 新增测试数据
- `union_intval.bin` - Union intVal 变体
- `union_boolval.bin` - Union boolVal 变体
- `group_type.bin` - Group 类型测试
- `default_values_empty.bin` - 默认值测试（空消息）
- `default_values_overridden.bin` - 默认值测试（覆盖值）
- `deep_nesting.bin` - 深度嵌套结构
- `complex_struct.bin` - 复杂结构（多层嵌套 + 列表）
- `all_list_types.bin` - 所有列表类型测试
- `empty_struct.bin` - 空结构测试
- `pointer_only_struct.bin` - 纯指针结构测试
- `data_only_struct.bin` - 纯数据字段结构测试
- `multi_union_*.bin` - 多 Union 变体测试（int/text/bool/data/list/nested）
- `boundary_values.bin` - 边界值测试
- `large_message.bin` - 大消息测试

### 测试代码
- `official.test.ts` - Phase 1 互操作测试用例（14 个测试）
- `phase2.test.ts` - Phase 2 扩展测试用例（19 个测试）

## 运行测试

```bash
# 运行所有互操作测试
pnpm test src/interop/

# 仅运行 Phase 1 测试
pnpm test src/interop/official.test.ts

# 仅运行 Phase 2 测试
pnpm test src/interop/phase2.test.ts
```

## 生成新的测试数据

### 使用 capnp convert 命令

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

### 使用生成脚本

```bash
# 运行 Phase 2 数据生成脚本
./generate-phase2.sh
```

## Phase 2 测试覆盖

Phase 2 新增了以下测试场景：

1. **Union 所有变体类型**
   - intVal, textVal, boolVal 三种变体

2. **默认值（XOR 编码）**
   - 空消息（使用默认值）
   - 覆盖默认值（XOR 编码验证）

3. **复杂嵌套结构**
   - 深度嵌套（3 层）
   - 复杂结构（多层 struct + 列表）

4. **所有列表类型**
   - Void, Bool, Int8/16/32/64, UInt8/16/32/64, Float32/64
   - Text, Data 列表

5. **特殊结构类型**
   - 空结构
   - 纯指针结构
   - 纯数据字段结构

6. **多 Union 结构**
   - 6 种不同变体类型（int, text, bool, data, list, nested struct）
   - 嵌套 Union 支持

7. **边界值测试**
   - 所有整数类型的最大/最小值

8. **大消息测试**
   - 大 Data 字段
   - Struct 列表

## 已知限制

1. **复合列表处理**：capnp-ts 目前不完全支持复合列表（struct list）的标签字处理。
   复合列表的第一个字是一个特殊的"标签"，包含元素数量和每个元素的大小信息。
   当前实现需要手动计算元素偏移。

2. **字段偏移量**：Cap'n Proto 编译器会根据字段类型和编号重新排列字段以优化内存布局。
   测试中使用的是从官方 C++ 生成的代码中推导出的实际偏移量。

3. **默认值 XOR 解码**：capnp-ts 目前读取的是 wire value，不会自动进行 XOR 解码。
   对于带有默认值的字段，需要手动进行 XOR 运算来获取实际值。

## 字段布局参考

Cap'n Proto 使用以下规则排列字段：
- 字段按编号顺序分配位置
- 每个字段根据其类型对齐（1/2/4/8 字节）
- 小字段可以填充在大字段的 padding 中

获取准确的字段布局：
```bash
capnp compile -ocapnp test-schema.capnp
```

### 示例布局

#### BasicTypes（48 bytes, 0 ptrs）
```
int8Field  @0 :Int8    - bits[0, 8)
uint8Field @4 :UInt8   - bits[8, 16)
int16Field @1 :Int16   - bits[16, 32)
int32Field @2 :Int32   - bits[32, 64)
int64Field @3 :Int64   - bits[64, 128)
uint16Field@5 :UInt16  - bits[128, 144)
boolField  @10:Bool    - bits[144, 145)
uint32Field@6 :UInt32  - bits[160, 192)
uint64Field@7 :UInt64  - bits[192, 256)
float32Field@8:Float32 - bits[256, 288)
float64Field@9:Float64 - bits[320, 384)
```

#### UnionType（8 bytes, 1 ptr）
```
union {                  - tag bits [32, 48)
  intVal @0 :Int32       - bits[0, 32), tag = 0
  textVal @1 :Text       - ptr[0], tag = 1
  boolVal @2 :Bool       - bits[0, 1), tag = 2
}
```
