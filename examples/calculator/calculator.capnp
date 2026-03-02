@0x8e7821eb3865617c;

interface Calculator {
  # A simple calculator interface for testing RPC code generation

  evaluate @0 (expression :Expression) -> (value :Float64);
  # Evaluate an expression and return the result

  getOperator @1 (op :Operator) -> (func :Function);
  # Get a function for a specific operator
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
  interfaceId @0 :UInt64;
  methodId @1 :UInt16;
}

enum Operator {
  add @0;
  subtract @1;
  multiply @2;
  divide @3;
}
