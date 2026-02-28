# Cap'n Proto TypeScript 代码生成器设计

## 目标
从 `.capnp` schema 文件生成类型安全的 TypeScript 类

## 工作流程

```
schema.capnp ──► capnp compile -o json ──► schema.json ──► codegen ──► schema.ts
```

## 生成代码示例

### Input: addressbook.capnp

```capnp
@0x9a3f5c6b8d2e1f4a;

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

struct AddressBook {
  people @0 :List(Person);
}
```

### Output: addressbook.ts

```typescript
import { StructReader, StructBuilder, MessageReader, MessageBuilder } from '@capnp-ts/core';

// Enums
export enum Person_PhoneNumber_Type {
  mobile = 0,
  home = 1,
  work = 2,
}

// Person.PhoneNumber Reader
export class Person_PhoneNumber_Reader extends StructReader {
  get number(): string {
    return this.getText(0);
  }
  
  get type(): Person_PhoneNumber_Type {
    return this.getUint16(0) as Person_PhoneNumber_Type;
  }
}

// Person.PhoneNumber Builder
export class Person_PhoneNumber_Builder extends StructBuilder {
  set number(value: string) {
    this.setText(0, value);
  }
  
  set type(value: Person_PhoneNumber_Type) {
    this.setUint16(0, value);
  }
}

// Person Reader
export class Person_Reader extends StructReader {
  get id(): number {
    return this.getUint32(0);
  }
  
  get name(): string {
    return this.getText(0);
  }
  
  get email(): string {
    return this.getText(1);
  }
  
  get phones(): ListReader<Person_PhoneNumber_Reader> {
    return this.getList(2, Person_PhoneNumber_Reader);
  }
}

// Person Builder
export class Person_Builder extends StructBuilder {
  set id(value: number) {
    this.setUint32(0, value);
  }
  
  set name(value: string) {
    this.setText(0, value);
  }
  
  set email(value: string) {
    this.setText(1, value);
  }
  
  initPhones(size: number): ListBuilder<Person_PhoneNumber_Builder> {
    return this.initList(2, size, Person_PhoneNumber_Builder);
  }
}

// AddressBook Reader
export class AddressBook_Reader extends StructReader {
  get people(): ListReader<Person_Reader> {
    return this.getList(0, Person_Reader);
  }
}

// AddressBook Builder  
export class AddressBook_Builder extends StructBuilder {
  initPeople(size: number): ListBuilder<Person_Builder> {
    return this.initList(0, size, Person_Builder);
  }
}

// Helper functions
export function newAddressBook(): AddressBook_Builder {
  const builder = new MessageBuilder();
  return builder.initRoot(AddressBook_Builder);
}

export function readAddressBook(buffer: ArrayBuffer): AddressBook_Reader {
  const reader = new MessageReader(buffer);
  return reader.getRoot(AddressBook_Reader);
}
```

## 实现方案

### 方案 A: 使用官方 capnp 工具

```bash
# 1. 编译官方工具到 WASM
# 2. 在浏览器/Node 中运行 capnp compile
# 3. 解析生成的 JSON/binary schema
# 4. 生成 TypeScript
```

### 方案 B: 纯 TypeScript 解析

```typescript
// 用 TS 写 schema 解析器
// 优点：不依赖 C++ 工具
// 缺点：需要维护 parser，可能不完整
```

### 选择：方案 A

更可靠，复用官方实现。

## 实现步骤

1. 绑定 `capnp::SchemaParser` 到 WASM
2. 绑定 `capnp::Schema` 遍历 API
3. 写 TS 代码生成器
4. CLI 工具

## 生成的 List 类型

```typescript
export class ListReader<T extends StructReader> {
  get length(): number;
  get(index: number): T;
  [Symbol.iterator](): Iterator<T>;
}

export class ListBuilder<T extends StructBuilder> {
  get length(): number;
  get(index: number): T;
  set(index: number, value: T): void;
}
```

## Union 支持

```typescript
export class Person_Reader extends StructReader {
  get which(): Person_Which {
    return this.getUnionTag(0) as Person_Which;
  }
  
  get student(): Person_Student_Reader | undefined {
    if (this.which !== Person_Which.student) return undefined;
    return this.getStruct(0, Person_Student_Reader);
  }
  
  get teacher(): Person_Teacher_Reader | undefined {
    if (this.which !== Person_Which.teacher) return undefined;
    return this.getStruct(0, Person_Teacher_Reader);
  }
}

export class Person_Builder extends StructBuilder {
  initStudent(): Person_Student_Builder {
    this.setUnionTag(0, Person_Which.student);
    return this.initStruct(0, Person_Student_Builder);
  }
  
  initTeacher(): Person_Teacher_Builder {
    this.setUnionTag(0, Person_Which.teacher);
    return this.initStruct(0, Person_Teacher_Builder);
  }
}
```
