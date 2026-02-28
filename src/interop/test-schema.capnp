@0x8f9c8e7d6c5b4a30;

# 互操作测试用的简单 schema
# 用于测试 capnp-ts 与官方 C++ 实现的兼容性

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
