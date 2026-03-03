@0x8f9c8e7d6c5b4a31;

# Phase 2 互操作测试扩展 Schema
# 用于测试 capnp-ts 与官方 C++ 实现的兼容性

# 基础类型（保留原有定义）
struct BasicTypes {
  int8Field @0 :Int8;
  int16Field @1 :Int16;
  int32Field @2 :Int32;
  int64Field @3 :Int64;
  uint8Field @4 :UInt8;
  uint16Field @5 :UInt16;
  uint32Field @6 :UInt32;
  uint64Field @7 :UInt64;
  float32Field @8 :Float32;
  float64Field @9 :Float64;
  boolField @10 :Bool;
}

struct TextTypes {
  textField @0 :Text;
  dataField @1 :Data;
}

struct NestedStruct {
  id @0 :UInt32;
  child @1 :Child;
  
  struct Child {
    name @0 :Text;
    value @1 :Int32;
  }
}

struct ListTypes {
  int32List @0 :List(Int32);
  textList @1 :List(Text);
  structList @2 :List(Item);
  
  struct Item {
    key @0 :Text;
    val @1 :Int32;
  }
}

struct UnionType {
  union {
    intVal @0 :Int32;
    textVal @1 :Text;
    boolVal @2 :Bool;
  }
}

struct AddressBook {
  people @0 :List(Person);
  
  struct Person {
    id @0 :UInt32;
    name @1 :Text;
    email @2 :Text;
    phones @3 :List(PhoneNumber);
    
    struct PhoneNumber {
      number @0 :Text;
      type @1 :Type;
      
      enum Type {
        mobile @0;
        home @1;
        work @2;
      }
    }
  }
}

# ========== Phase 2 新增类型 ==========

# Group 类型测试
struct GroupType {
  id @0 :UInt32;
  name @1 :Text;
  age @2 :UInt8;
  street @3 :Text;
  city @4 :Text;
}

# 默认值测试（XOR 编码）
struct DefaultValues {
  int8WithDefault @0 :Int8 = -42;
  int32WithDefault @1 :Int32 = 12345;
  uint16WithDefault @2 :UInt16 = 1000;
  boolWithDefault @3 :Bool = true;
  float64WithDefault @4 :Float64 = 3.14159;
  textWithDefault @5 :Text = "default text";
}

# 复杂嵌套结构
struct DeepNesting {
  level @0 :UInt32;
  child @1 :DeepNesting;
  data @2 :Text;
}

# 多字段复杂结构
struct ComplexStruct {
  id @0 :UInt64;
  name @1 :Text;
  tags @2 :List(Text);
  metadata @3 :Metadata;
  
  struct Metadata {
    created @0 :UInt64;
    modified @1 :UInt64;
    attributes @2 :List(Attribute);
    
    struct Attribute {
      key @0 :Text;
      value @1 :Text;
    }
  }
}

# 所有列表类型测试
struct AllListTypes {
  voidList @0 :List(Void);
  boolList @1 :List(Bool);
  int8List @2 :List(Int8);
  int16List @3 :List(Int16);
  int32List @4 :List(Int32);
  int64List @5 :List(Int64);
  uint8List @6 :List(UInt8);
  uint16List @7 :List(UInt16);
  uint32List @8 :List(UInt32);
  uint64List @9 :List(UInt64);
  float32List @10 :List(Float32);
  float64List @11 :List(Float64);
  textList @12 :List(Text);
  dataList @13 :List(Data);
}

# 空结构测试
struct EmptyStruct {
}

# 只有指针的结构
struct PointerOnlyStruct {
  name @0 :Text;
  data @1 :Data;
}

# 只有数据字段的结构
struct DataOnlyStruct {
  id @0 :UInt64;
  count @1 :UInt32;
  flag @2 :Bool;
}

# 多 Union 结构
struct MultiUnion {
  union {
    optionA @0 :Int32;
    optionB @1 :Text;
    optionC @2 :Bool;
    optionD @3 :Data;
    optionE @4 :List(Int32);
    optionF @5 :NestedUnion;
  }
  
  struct NestedUnion {
    union {
      nestedInt @0 :Int32;
      nestedText @1 :Text;
    }
  }
}

# 边界值测试结构
struct BoundaryValues {
  int8Max @0 :Int8;
  int8Min @1 :Int8;
  int16Max @2 :Int16;
  int16Min @3 :Int16;
  int32Max @4 :Int32;
  int32Min @5 :Int32;
  int64Max @6 :Int64;
  int64Min @7 :Int64;
  uint8Max @8 :UInt8;
  uint16Max @9 :UInt16;
  uint32Max @10 :UInt32;
  uint64Max @11 :UInt64;
}

# 大消息测试（用于多 segment）
struct LargeMessage {
  id @0 :UInt64;
  data @1 :Data;
  chunks @2 :List(Chunk);
  
  struct Chunk {
    index @0 :UInt32;
    content @1 :Data;
  }
}
