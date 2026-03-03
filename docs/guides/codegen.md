# 代码生成器使用指南

@naeemo/capnp 包含强大的代码生成器，可以从 `.capnp` schema 文件生成 TypeScript 类型定义和辅助类。

## 安装

代码生成器包含在主包中：

```bash
npm install @naeemo/capnp
```

## 基本使用

### 生成单个文件

```bash
npx capnp-ts-codegen schema.capnp -o output.ts
```

### 生成到目录

```bash
npx capnp-ts-codegen schema.capnp -d ./generated/
```

### 指定运行时路径

如果你的项目使用了非标准路径的运行时：

```bash
npx capnp-ts-codegen schema.capnp -o types.ts -r ../my-runtime
```

## 生成内容

对于每个 struct，生成器会创建：

### 1. TypeScript 接口

```typescript
// 用于类型定义
interface Person {
  id: number;
  name: string;
  email: string;
}
```

### 2. Reader 类

```typescript
// 用于读取已序列化的消息
class PersonReader {
  getId(): number;
  getName(): string;
  getEmail(): string;
  hasEmail(): boolean;
}
```

### 3. Builder 类

```typescript
// 用于构建新消息
class PersonBuilder {
  setId(value: number): void;
  setName(value: string): void;
  setEmail(value: string): void;
  initPhones(size: number): ListBuilder<PhoneNumberBuilder>;
}
```

## 完整示例

### Schema 定义

```capnp
@0x9876543210abcdef;

struct AddressBook {
  people @0 :List(Person);
}

struct Person {
  id @0 :UInt32;
  name @1 :Text;
  email @2 :Text;
  
  phones @3 :List(PhoneNumber);
  employment :union {
    unemployed @4 :Void;
    employer @5 :Text;
    school @6 :Text;
    selfEmployed @7 :Void;
  }
  
  struct PhoneNumber {
    number @0 :Text;
    type @1 :Type = mobile;
    
    enum Type {
      mobile @0;
      home @1;
      work @2;
    }
  }
}
```

### 生成代码

```bash
npx capnp-ts-codegen addressbook.capnp -o addressbook.ts
```

### 使用生成的代码

```typescript
import { MessageBuilder, MessageReader } from '@naeemo/capnp';
import { 
  AddressBookBuilder, 
  AddressBookReader,
  PersonBuilder,
  PersonReader 
} from './addressbook.js';

// 构建消息
const message = new MessageBuilder();
const addressBook = message.initRoot(AddressBookBuilder);

const people = addressBook.initPeople(2);

// 第一个人
const person1 = people.get(0);
person1.setId(1);
person1.setName('Alice');
person1.setEmail('alice@example.com');
person1.initPhones(1).get(0).setNumber('555-1234');
person1.getEmployment().setEmployer('TechCorp');

// 第二个人（使用 union）
const person2 = people.get(1);
person2.setId(2);
person2.setName('Bob');
person2.getEmployment().setSelfEmployed();

// 序列化
const data = message.toArrayBuffer();

// 读取消息
const reader = new MessageReader(new Uint8Array(data));
const book = reader.getRoot(AddressBookReader);

for (const person of book.getPeople()) {
  console.log(person.getName());
  
  // 处理 union
  const employment = person.getEmployment();
  switch (employment.which()) {
    case Person.Employment.EMPLOYER:
      console.log('Employer:', employment.getEmployer());
      break;
    case Person.Employment.SELF_EMPLOYED:
      console.log('Self employed');
      break;
    // ...
  }
}
```

## 支持的 Cap'n Proto 特性

### Structs

```capnp
struct Point {
  x @0 :Float64;
  y @1 :Float64;
}
```

### Unions

```capnp
struct Shape {
  area @0 :Float64;
  
  union {
    circle @1 :Circle;
    rectangle @2 :Rectangle;
  }
}
```

生成代码会包含 `which()` 方法来检查 union 的当前状态。

### Groups

```capnp
struct Person {
  name @0 :Text;
  
  address :group {
    street @1 :Text;
    city @2 :Text;
  }
}
```

Group 的字段会作为 struct 的一部分生成。

### Lists

```capnp
struct Data {
  items @0 :List(Text);
  matrix @1 :List(List(Float64));
}
```

### Enums

```capnp
enum Status {
  pending @0;
  active @1;
  completed @2;
}
```

生成 TypeScript 枚举和类型守卫。

### Interfaces（RPC）

```capnp
interface Calculator {
  add @0 (a :Int32, b :Int32) -> (result :Int32);
  subtract @1 (a :Int32, b :Int32) -> (result :Int32);
}
```

生成 Server 接口和 Client 类。

## CLI 选项

```
Usage: capnp-ts-codegen [options] <schema.capnp>

Options:
  -o, --output <file>      输出文件路径
  -d, --directory <dir>    输出目录（生成多个文件）
  -r, --runtime <path>     运行时导入路径（默认: @naeemo/capnp）
  --no-types               不生成 TypeScript 类型定义
  --no-readers             不生成 Reader 类
  --no-builders            不生成 Builder 类
  -h, --help              显示帮助信息
```

## 与构建工具集成

### Vite

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { execSync } from 'child_process';
import { glob } from 'glob';

export default defineConfig({
  plugins: [{
    name: 'capnp-codegen',
    buildStart() {
      const schemas = glob.sync('src/**/*.capnp');
      for (const schema of schemas) {
        const output = schema.replace('.capnp', '.capnp.ts');
        execSync(`npx capnp-ts-codegen ${schema} -o ${output}`);
      }
    }
  }]
});
```

### 脚本方式

```json
// package.json
{
  "scripts": {
    "generate": "capnp-ts-codegen src/schemas/*.capnp -d src/generated/",
    "generate:watch": "chokidar 'src/**/*.capnp' -c 'npm run generate'"
  }
}
```

## 最佳实践

1. **将生成的代码提交到版本控制** 或 **在 CI 中重新生成**
2. **使用 `.capnp.ts` 后缀** 区分生成的文件
3. **不要手动修改生成的代码** - 会被覆盖
4. **使用 `import type`** 当只需要类型时

```typescript
// 好的做法
import type { Person } from './person.capnp.js';
import { PersonReader, PersonBuilder } from './person.capnp.js';

// 避免
import { Person } from './person.capnp.js';  // 如果不是用作类型
```

## 故障排除

### "capnp: command not found"

确保安装了官方 capnp 工具：

```bash
# macOS
brew install capnp

# Ubuntu/Debian  
apt-get install capnp
```

### "Cannot find module"

确保使用 `.js` 扩展名导入（ESM 要求）：

```typescript
import { Person } from './person.capnp.js';  // ✅
import { Person } from './person.capnp';      // ❌
```

### 类型错误

确保 `tsconfig.json` 启用了严格模式：

```json
{
  "compilerOptions": {
    "strict": true,
    "moduleResolution": "bundler"
  }
}
```
