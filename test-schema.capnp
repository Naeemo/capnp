# 测试用的简单 schema
@0xdbb9ad1f14bf0b36;

struct Person {
  name @0 :Text;
  age @1 :UInt32;
  email @2 :Text;
}

struct Company {
  name @0 :Text;
  employees @1 :List(Person);
}

enum Status {
  active @0;
  inactive @1;
  pending @2;
}
