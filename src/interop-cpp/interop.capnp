@0x8f9c8e7d6c5b4a50;

# C++ 互操作测试 Schema
# 用于测试 capnp-ts 与 C++ 实现的 RPC 兼容性

interface EchoService {
  # 简单的回声服务，用于基础 RPC 测试
  echo @0 (message :Text) -> (result :Text);
  # 回显消息

  echoStruct @1 (input :EchoStruct) -> (output :EchoStruct);
  # 回显结构体

  getCounter @2 () -> (value :UInt32);
  # 获取计数器值

  increment @3 () -> (newValue :UInt32);
  # 增加计数器
}

struct EchoStruct {
  id @0 :UInt32;
  name @1 :Text;
  value @2 :Float64;
  items @3 :List(Text);
}

interface Calculator {
  # 计算器服务，用于测试方法调用
  evaluate @0 (expression :Expression) -> (value :Float64);
  
  getOperator @1 (op :Operator) -> (func :Function);
  # 获取操作符函数
}

struct Expression {
  union {
    literal @0 :Float64;
    call :group {
      function @1 :Function;
      params @2 :List(Expression);
    }
  }
}

struct Function {
  # 函数引用
  interfaceId @0 :UInt64;
  methodId @1 :UInt16;
}

enum Operator {
  add @0;
  subtract @1;
  multiply @2;
  divide @3;
}

interface Database {
  # 数据库服务，用于测试 Promise Pipelining
  getTable @0 (name :Text) -> (table :Table);
  
  query @1 (sql :Text) -> (rows :List(Row));
}

interface Table {
  getRow @0 (id :UInt32) -> (row :Row);
  
  insert @1 (row :Row) -> (id :UInt32);
}

struct Row {
  columns @0 :List(Column);
  
  struct Column {
    name @0 :Text;
    value @1 :Text;
  }
}

interface PromiseTester {
  # 用于测试 Promise Pipelining
  getDelayedValue @0 (delayMs :UInt32, value :Text) -> (result :Text);
  # 延迟返回值的测试方法
  
  getNestedCapability @1 () -> (inner :InnerCapability);
  # 返回嵌套能力
}

interface InnerCapability {
  process @0 (data :Text) -> (result :Text);
  # 处理数据
}
