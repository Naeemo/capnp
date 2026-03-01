# Binary Schema 支持开发计划

## 目标
接入官方 `capnp compile -o binary` 生成的编译后 schema，替代当前的正则解析器。

## 关键发现

### 1. 编译输出格式
官方编译器输出的是 `CodeGeneratorRequest` 结构：

```capnp
struct CodeGeneratorRequest {
  capnpVersion @2 :CapnpVersion;
  nodes @0 :List(Node);           # 所有节点（file, struct, enum, etc.）
  sourceInfo @3 :List(Node.SourceInfo);
  requestedFiles @1 :List(RequestedFile);
}
```

### 2. Node 结构（关键字段）
```capnp
struct Node {
  id @0 :UInt64;                  # 全局唯一 ID
  displayName @1 :Text;           # 显示名称
  scopeId @3 :UInt64;             # 父节点 ID（0 表示无父节点）
  
  union {
    file @6 :Void;
    
    struct :group {
      dataWordCount @7 :UInt16;   # data section 大小（words）
      pointerCount @8 :UInt16;    # pointer section 大小
      isGroup @10 :Bool;          # 是否是 group
      discriminantCount @11 :UInt16;  # union 字段数（0 表示无 union）
      discriminantOffset @12 :UInt32; # union tag 偏移（16-bit 单位）
      fields @13 :List(Field);    # 字段列表
    }
    
    enum :group {
      enumerants @14 :List(Enumerant);
    }
    
    # ... interface, const, annotation
  }
}
```

### 3. Field 结构（关键字段）
```capnp
struct Field {
  name @0 :Text;
  codeOrder @1 :UInt16;
  discriminantValue @3 :UInt16 = 0xffff;  # 0xffff 表示不在 union 中
  
  union {
    slot :group {
      offset @4 :UInt32;          # 字段偏移（以字段大小为单位）
      type @5 :Type;              # 类型
      defaultValue @6 :Value;     # 默认值
    }
    
    group :group {
      typeId @7 :UInt64;          # group 类型的 node ID
    }
  }
}
```

### 4. Type 结构
```capnp
struct Type {
  union {
    void @0 :Void; bool @1 :Void; int8 @2 :Void; ...  # 基础类型
    text @12 :Void; data @13 :Void;
    
    list :group { elementType @14 :Type; }
    enum :group { typeId @15 :UInt64; }
    struct :group { typeId @16 :UInt64; }
    interface :group { typeId @17 :UInt64; }
    anyPointer :union { ... }
  }
}
```

## 实现步骤

### Step 1: 创建 schema 文件
将官方的 `schema.capnp` 放入项目，作为我们解析的目标格式。

### Step 2: 手动创建 schema 的 TypeScript 定义
由于我们需要先能解析 schema 才能用 schema 生成代码，所以需要：
- 手动编写 `Node`, `Field`, `Type`, `CodeGeneratorRequest` 等的 TypeScript Reader 类
- 或者先用当前 v2 生成器处理 schema.capnp，然后修复生成的代码

### Step 3: 实现二进制解析
- 读取 `.capnp.bin` 文件
- 用 MessageReader 解析为 CodeGeneratorRequest
- 遍历 nodes，构建类型图

### Step 4: 重构代码生成器
- 基于解析后的 Node/Field 生成 TypeScript 代码
- 正确处理 offset、dataWordCount、pointerCount
- 支持 Union（discriminant）
- 支持 Group

### Step 5: 替换 v2
- CLI 切换到新解析器
- 删除 parser-v2.ts, generator-v2.ts

## 当前阶段
正在 Step 1-2: 准备 schema 文件和基础类型定义。
