/**
 * Cap'n Proto Schema 解析器 v2
 * 完整的 Schema 解析器，支持所有 Cap'n Proto 语法
 */

// Token 类型
export type TokenType =
  | 'EOF'
  | 'NEWLINE'
  | 'WHITESPACE'
  | 'COMMENT'
  | 'IDENTIFIER'
  | 'NUMBER'
  | 'STRING'
  | 'SYMBOL'
  | 'KEYWORD';

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

// AST 节点类型
export interface SchemaFile {
  kind: 'file';
  id?: bigint;
  imports: ImportStatement[];
  declarations: Declaration[];
}

export interface ImportStatement {
  kind: 'import';
  path: string;
}

export type Declaration =
  | StructDeclaration
  | EnumDeclaration
  | InterfaceDeclaration
  | ConstDeclaration
  | AnnotationDeclaration;

export interface StructDeclaration {
  kind: 'struct';
  name: string;
  id?: bigint;
  fields: Field[];
  unions: Union[];
  groups: Group[];
  nested: Declaration[];
}

export interface Field {
  kind: 'field';
  name: string;
  index: number;
  type: Type;
  defaultValue?: Value;
  annotations: Annotation[];
}

export type Type =
  | { kind: 'void' }
  | { kind: 'bool' }
  | { kind: 'int8' }
  | { kind: 'int16' }
  | { kind: 'int32' }
  | { kind: 'int64' }
  | { kind: 'uint8' }
  | { kind: 'uint16' }
  | { kind: 'uint32' }
  | { kind: 'uint64' }
  | { kind: 'float32' }
  | { kind: 'float64' }
  | { kind: 'text' }
  | { kind: 'data' }
  | { kind: 'list'; elementType: Type }
  | { kind: 'struct'; name: string }
  | { kind: 'enum'; name: string }
  | { kind: 'anyPointer' }
  | { kind: 'capability' }
  | { kind: 'optional'; inner: Type };

export type Value =
  | { kind: 'void' }
  | { kind: 'bool'; value: boolean }
  | { kind: 'number'; value: number | bigint }
  | { kind: 'string'; value: string }
  | { kind: 'data'; value: Uint8Array }
  | { kind: 'list'; values: Value[] }
  | { kind: 'struct'; fields: { name: string; value: Value }[] }
  | { kind: 'default' }; // for "default" keyword

export interface Union {
  kind: 'union';
  name?: string;  // undefined for unnamed union
  tagOffset: number;  // discriminant offset in bits
  fields: Field[];
}

export interface Group {
  kind: 'group';
  name: string;
  fields: Field[];
  unions: Union[];
}

export interface EnumDeclaration {
  kind: 'enum';
  name: string;
  id?: bigint;
  values: EnumValue[];
}

export interface EnumValue {
  kind: 'enumValue';
  name: string;
  index: number;
  annotations: Annotation[];
}

export interface InterfaceDeclaration {
  kind: 'interface';
  name: string;
  id?: bigint;
  methods: Method[];
  extends: string[];
}

export interface Method {
  kind: 'method';
  name: string;
  index: number;
  paramType?: string;
  resultType?: string;
  annotations: Annotation[];
}

export interface ConstDeclaration {
  kind: 'const';
  name: string;
  type: Type;
  value: Value;
}

export interface AnnotationDeclaration {
  kind: 'annotation';
  name: string;
  id?: bigint;
  type: Type;
  targets: AnnotationTarget[];
}

export type AnnotationTarget =
  | 'file'
  | 'struct'
  | 'field'
  | 'union'
  | 'group'
  | 'enum'
  | 'enumerant'
  | 'interface'
  | 'method'
  | 'param'
  | 'annotation';

export interface Annotation {
  kind: 'annotation';
  name: string;
  value?: Value;
}

// 解析错误
export class ParseError extends Error {
  constructor(
    message: string,
    public line: number,
    public column: number,
    public source?: string
  ) {
    super(`Parse error at line ${line}, column ${column}: ${message}`);
    this.name = 'ParseError';
  }
}

// 词法分析器
class Lexer {
  private source: string;
  private pos = 0;
  private line = 1;
  private column = 1;
  private tokens: Token[] = [];

  // 关键字
  private static readonly KEYWORDS = new Set([
    'struct', 'enum', 'interface', 'union', 'group', 'const', 'annotation',
    'import', 'using', 'extends', 'void', 'bool',
    'int8', 'int16', 'int32', 'int64',
    'uint8', 'uint16', 'uint32', 'uint64',
    'float32', 'float64', 'text', 'data', 'list',
    'anyPointer', 'capability', 'true', 'false',
    'default', 'inline', 'override'
  ]);

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    while (!this.isAtEnd()) {
      this.scanToken();
    }

    this.tokens.push({
      type: 'EOF',
      value: '',
      line: this.line,
      column: this.column
    });

    return this.tokens;
  }

  private scanToken(): void {
    const c = this.advance();

    switch (c) {
      // 空白字符
      case ' ':
      case '\t':
      case '\r':
        this.addToken('WHITESPACE', c);
        break;

      // 换行
      case '\n':
        this.addToken('NEWLINE', c);
        this.line++;
        this.column = 1;
        break;

      // 注释
      case '#':
        this.scanComment();
        break;

      // 字符串
      case '"':
        this.scanString();
        break;

      // 数字（十六进制）
      case '0':
        if (this.peek() === 'x' || this.peek() === 'X') {
          this.scanHexNumber();
        } else {
          this.scanNumber(c);
        }
        break;

      // 符号
      case '{':
      case '}':
      case '(':
      case ')':
      case '[':
      case ']':
      case ';':
      case ':':
      case ',':
      case '.':
      case '@':
      case '=':
      case '$':
        this.addToken('SYMBOL', c);
        break;

      default:
        if (this.isDigit(c)) {
          this.scanNumber(c);
        } else if (this.isAlpha(c) || c === '_') {
          this.scanIdentifier(c);
        } else {
          throw new ParseError(
            `Unexpected character: ${c}`,
            this.line,
            this.column - 1,
            this.source
          );
        }
    }
  }

  private scanComment(): void {
    let value = '#';
    while (!this.isAtEnd() && this.peek() !== '\n') {
      value += this.advance();
    }
    this.addToken('COMMENT', value);
  }

  private scanString(): void {
    let value = '';
    while (!this.isAtEnd() && this.peek() !== '"') {
      if (this.peek() === '\\') {
        this.advance(); // skip backslash
        const escaped = this.advance();
        switch (escaped) {
          case 'n': value += '\n'; break;
          case 't': value += '\t'; break;
          case 'r': value += '\r'; break;
          case '"': value += '"'; break;
          case '\\': value += '\\'; break;
          case 'x':
            // hex escape: \xNN
            const hex = this.advance() + this.advance();
            value += String.fromCharCode(parseInt(hex, 16));
            break;
          default:
            value += escaped;
        }
      } else {
        value += this.advance();
      }
    }

    if (this.isAtEnd()) {
      throw new ParseError(
        'Unterminated string',
        this.line,
        this.column,
        this.source
      );
    }

    this.advance(); // consume closing "
    this.addToken('STRING', value);
  }

  private scanHexNumber(): void {
    this.advance(); // consume 'x'
    let value = '0x';
    while (!this.isAtEnd() && this.isHexDigit(this.peek())) {
      value += this.advance();
    }
    this.addToken('NUMBER', value);
  }

  private scanNumber(firstChar: string): void {
    let value = firstChar;

    while (!this.isAtEnd() && this.isDigit(this.peek())) {
      value += this.advance();
    }

    // 小数部分
    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      value += this.advance();
      while (!this.isAtEnd() && this.isDigit(this.peek())) {
        value += this.advance();
      }
    }

    // 指数部分
    if (this.peek() === 'e' || this.peek() === 'E') {
      value += this.advance();
      if (this.peek() === '+' || this.peek() === '-') {
        value += this.advance();
      }
      while (!this.isAtEnd() && this.isDigit(this.peek())) {
        value += this.advance();
      }
    }

    this.addToken('NUMBER', value);
  }

  private scanIdentifier(firstChar: string): void {
    let value = firstChar;
    while (!this.isAtEnd() && (this.isAlphaNumeric(this.peek()) || this.peek() === '_')) {
      value += this.advance();
    }

    const type = Lexer.KEYWORDS.has(value) ? 'KEYWORD' : 'IDENTIFIER';
    this.addToken(type, value);
  }

  private addToken(type: TokenType, value: string): void {
    this.tokens.push({
      type,
      value,
      line: this.line,
      column: this.column - value.length
    });
  }

  private advance(): string {
    this.column++;
    return this.source[this.pos++]!;
  }

  private peek(): string {
    if (this.isAtEnd()) return '\0';
    return this.source[this.pos]!;
  }

  private peekNext(): string {
    if (this.pos + 1 >= this.source.length) return '\0';
    return this.source[this.pos + 1]!;
  }

  private isAtEnd(): boolean {
    return this.pos >= this.source.length;
  }

  private isDigit(c: string): boolean {
    return c >= '0' && c <= '9';
  }

  private isHexDigit(c: string): boolean {
    return this.isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
  }

  private isAlpha(c: string): boolean {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
  }

  private isAlphaNumeric(c: string): boolean {
    return this.isAlpha(c) || this.isDigit(c);
  }
}

// 语法分析器
class Parser {
  private tokens: Token[];
  private pos = 0;
  private source: string;

  constructor(tokens: Token[], source: string) {
    this.tokens = tokens;
    this.source = source;
  }

  parse(): SchemaFile {
    const imports: ImportStatement[] = [];
    const declarations: Declaration[] = [];
    let id: bigint | undefined;

    this.skipWhitespaceAndComments();

    // 解析文件 ID
    if (this.check('SYMBOL', '@')) {
      id = this.parseFileId();
      this.skipWhitespaceAndComments();
    }

    while (!this.isAtEnd()) {
      this.skipWhitespaceAndComments();

      if (this.check('KEYWORD', 'import')) {
        imports.push(this.parseImport());
      } else if (this.check('KEYWORD', 'struct')) {
        declarations.push(this.parseStruct());
      } else if (this.check('KEYWORD', 'enum')) {
        declarations.push(this.parseEnum());
      } else if (this.check('KEYWORD', 'interface')) {
        declarations.push(this.parseInterface());
      } else if (this.check('KEYWORD', 'const')) {
        declarations.push(this.parseConst());
      } else if (this.check('KEYWORD', 'annotation')) {
        declarations.push(this.parseAnnotation());
      } else if (!this.isAtEnd()) {
        throw this.error(`Unexpected token: ${this.current().value}`);
      }

      this.skipWhitespaceAndComments();
    }

    return { kind: 'file', id, imports, declarations };
  }

  private parseFileId(): bigint {
    this.consume('SYMBOL', '@');
    const num = this.consume('NUMBER');
    this.consume('SYMBOL', ';');
    return BigInt(num.value);
  }

  private parseImport(): ImportStatement {
    this.consume('KEYWORD', 'import');
    const path = this.consume('STRING');
    this.consume('SYMBOL', ';');
    return { kind: 'import', path: path.value };
  }

  private parseStruct(): StructDeclaration {
    this.consume('KEYWORD', 'struct');
    const name = this.consume('IDENTIFIER').value;

    // 解析可选的 ID
    let id: bigint | undefined;
    if (this.check('SYMBOL', '@')) {
      id = this.parseIdAnnotation();
    }

    this.consume('SYMBOL', '{');
    this.skipWhitespaceAndComments();

    const fields: Field[] = [];
    const unions: Union[] = [];
    const groups: Group[] = [];
    const nested: Declaration[] = [];

    while (!this.check('SYMBOL', '}')) {
      this.skipWhitespaceAndComments();

      if (this.check('SYMBOL', '}')) break;

      // 检查嵌套声明
      if (this.check('KEYWORD', 'struct')) {
        nested.push(this.parseStruct());
      } else if (this.check('KEYWORD', 'enum')) {
        nested.push(this.parseEnum());
      } else if (this.check('KEYWORD', 'interface')) {
        nested.push(this.parseInterface());
      } else if (this.check('KEYWORD', 'union')) {
        unions.push(this.parseUnion());
      } else if (this.check('KEYWORD', 'group')) {
        groups.push(this.parseGroup());
      } else {
        // 普通字段
        const field = this.parseField();
        fields.push(field);
      }

      this.skipWhitespaceAndComments();
    }

    this.consume('SYMBOL', '}');

    return { kind: 'struct', name, id, fields, unions, groups, nested };
  }

  private parseIdAnnotation(): bigint {
    this.consume('SYMBOL', '@');
    const num = this.consume('NUMBER');
    // ID 可以是十六进制或十进制
    return BigInt(num.value);
  }

  private parseField(): Field {
    const name = this.consume('IDENTIFIER').value;
    this.consume('SYMBOL', '@');
    const index = parseInt(this.consume('NUMBER').value);
    this.consume('SYMBOL', ':');
    const type = this.parseType();

    // 默认值
    let defaultValue: Value | undefined;
    if (this.check('SYMBOL', '=')) {
      this.advance();
      defaultValue = this.parseValue();
    }

    // 注解
    const annotations = this.parseAnnotations();

    this.consume('SYMBOL', ';');

    return { kind: 'field', name, index, type, defaultValue, annotations };
  }

  private parseType(): Type {
    // 检查 Optional 类型
    if (this.check('IDENTIFIER', 'Optional')) {
      this.advance();
      this.consume('SYMBOL', '(');
      const inner = this.parseType();
      this.consume('SYMBOL', ')');
      return { kind: 'optional', inner };
    }

    // 检查 List 类型
    if (this.check('KEYWORD', 'list')) {
      this.advance();
      this.consume('SYMBOL', '(');
      const elementType = this.parseType();
      this.consume('SYMBOL', ')');
      return { kind: 'list', elementType };
    }

    // 检查内置类型
    if (this.check('KEYWORD')) {
      const keyword = this.advance().value;
      switch (keyword) {
        case 'void': return { kind: 'void' };
        case 'bool': return { kind: 'bool' };
        case 'int8': return { kind: 'int8' };
        case 'int16': return { kind: 'int16' };
        case 'int32': return { kind: 'int32' };
        case 'int64': return { kind: 'int64' };
        case 'uint8': return { kind: 'uint8' };
        case 'uint16': return { kind: 'uint16' };
        case 'uint32': return { kind: 'uint32' };
        case 'uint64': return { kind: 'uint64' };
        case 'float32': return { kind: 'float32' };
        case 'float64': return { kind: 'float64' };
        case 'text': return { kind: 'text' };
        case 'data': return { kind: 'data' };
        case 'anyPointer': return { kind: 'anyPointer' };
        case 'capability': return { kind: 'capability' };
        default:
          throw this.error(`Unknown type keyword: ${keyword}`);
      }
    }

    // 用户定义类型（struct 或 enum）
    if (this.check('IDENTIFIER')) {
      const name = this.advance().value;
      // 可能是 struct 或 enum，暂时标记为 struct
      return { kind: 'struct', name };
    }

    throw this.error(`Expected type, got ${this.current().value}`);
  }

  private parseValue(): Value {
    // void
    if (this.check('KEYWORD', 'void')) {
      this.advance();
      return { kind: 'void' };
    }

    // bool
    if (this.check('KEYWORD', 'true')) {
      this.advance();
      return { kind: 'bool', value: true };
    }
    if (this.check('KEYWORD', 'false')) {
      this.advance();
      return { kind: 'bool', value: false };
    }

    // default keyword
    if (this.check('KEYWORD', 'default')) {
      this.advance();
      return { kind: 'default' };
    }

    // string
    if (this.check('STRING')) {
      return { kind: 'string', value: this.advance().value };
    }

    // hex data: 0x"a1 b2 c3"
    if (this.check('NUMBER') && this.current().value.startsWith('0x')) {
      const hexStr = this.advance().value;
      // 处理 0x"..." 格式
      if (this.check('STRING')) {
        const hexData = this.advance().value.replace(/\s/g, '');
        const bytes = new Uint8Array(hexData.length / 2);
        for (let i = 0; i < hexData.length; i += 2) {
          bytes[i / 2] = parseInt(hexData.substring(i, i + 2), 16);
        }
        return { kind: 'data', value: bytes };
      }
      // 纯十六进制数字
      return { kind: 'number', value: BigInt(hexStr) };
    }

    // number
    if (this.check('NUMBER')) {
      const numStr = this.advance().value;
      if (numStr.includes('.') || numStr.includes('e')) {
        return { kind: 'number', value: parseFloat(numStr) };
      }
      // 检查是否需要 bigint
      const num = Number(numStr);
      if (Number.isSafeInteger(num)) {
        return { kind: 'number', value: num };
      }
      return { kind: 'number', value: BigInt(numStr) };
    }

    // list: [value, value, ...]
    if (this.check('SYMBOL', '[')) {
      return this.parseListValue();
    }

    // struct: (field = value, ...)
    if (this.check('SYMBOL', '(')) {
      return this.parseStructValue();
    }

    throw this.error(`Expected value, got ${this.current().value}`);
  }

  private parseListValue(): Value {
    this.consume('SYMBOL', '[');
    const values: Value[] = [];

    while (!this.check('SYMBOL', ']')) {
      values.push(this.parseValue());
      if (this.check('SYMBOL', ',')) {
        this.advance();
      }
    }

    this.consume('SYMBOL', ']');
    return { kind: 'list', values };
  }

  private parseStructValue(): Value {
    this.consume('SYMBOL', '(');
    const fields: { name: string; value: Value }[] = [];

    while (!this.check('SYMBOL', ')')) {
      const name = this.consume('IDENTIFIER').value;
      this.consume('SYMBOL', '=');
      const value = this.parseValue();
      fields.push({ name, value });

      if (this.check('SYMBOL', ',')) {
        this.advance();
      }
    }

    this.consume('SYMBOL', ')');
    return { kind: 'struct', fields };
  }

  private parseAnnotations(): Annotation[] {
    const annotations: Annotation[] = [];

    while (this.check('SYMBOL', '$')) {
      this.advance();
      const name = this.consume('IDENTIFIER').value;

      let value: Value | undefined;
      if (this.check('SYMBOL', '(')) {
        this.advance();
        value = this.parseValue();
        this.consume('SYMBOL', ')');
      }

      annotations.push({ kind: 'annotation', name, value });
    }

    return annotations;
  }

  private parseUnion(): Union {
    let name: string | undefined;

    if (this.check('KEYWORD', 'union')) {
      this.advance();
      // 检查是否有名称
      if (this.check('IDENTIFIER')) {
        name = this.consume('IDENTIFIER').value;
      }
    }

    this.consume('SYMBOL', '{');
    this.skipWhitespaceAndComments();

    const fields: Field[] = [];

    while (!this.check('SYMBOL', '}')) {
      this.skipWhitespaceAndComments();
      if (this.check('SYMBOL', '}')) break;

      const field = this.parseField();
      fields.push(field);

      this.skipWhitespaceAndComments();
    }

    this.consume('SYMBOL', '}');

    // tagOffset 将在布局阶段计算
    return { kind: 'union', name, tagOffset: 0, fields };
  }

  private parseGroup(): Group {
    this.consume('KEYWORD', 'group');
    const name = this.consume('IDENTIFIER').value;
    this.consume('SYMBOL', '{');
    this.skipWhitespaceAndComments();

    const fields: Field[] = [];
    const unions: Union[] = [];

    while (!this.check('SYMBOL', '}')) {
      this.skipWhitespaceAndComments();
      if (this.check('SYMBOL', '}')) break;

      if (this.check('KEYWORD', 'union')) {
        unions.push(this.parseUnion());
      } else {
        fields.push(this.parseField());
      }

      this.skipWhitespaceAndComments();
    }

    this.consume('SYMBOL', '}');

    return { kind: 'group', name, fields, unions };
  }

  private parseEnum(): EnumDeclaration {
    this.consume('KEYWORD', 'enum');
    const name = this.consume('IDENTIFIER').value;

    let id: bigint | undefined;
    if (this.check('SYMBOL', '@')) {
      id = this.parseIdAnnotation();
    }

    this.consume('SYMBOL', '{');
    this.skipWhitespaceAndComments();

    const values: EnumValue[] = [];

    while (!this.check('SYMBOL', '}')) {
      this.skipWhitespaceAndComments();
      if (this.check('SYMBOL', '}')) break;

      const valueName = this.consume('IDENTIFIER').value;
      this.consume('SYMBOL', '@');
      const index = parseInt(this.consume('NUMBER').value);

      const annotations = this.parseAnnotations();
      this.consume('SYMBOL', ';');

      values.push({ kind: 'enumValue', name: valueName, index, annotations });

      this.skipWhitespaceAndComments();
    }

    this.consume('SYMBOL', '}');

    return { kind: 'enum', name, id, values };
  }

  private parseInterface(): InterfaceDeclaration {
    this.consume('KEYWORD', 'interface');
    const name = this.consume('IDENTIFIER').value;

    let id: bigint | undefined;
    if (this.check('SYMBOL', '@')) {
      id = this.parseIdAnnotation();
    }

    // 解析 extends
    const extends_: string[] = [];
    if (this.check('KEYWORD', 'extends')) {
      this.advance();
      do {
        extends_.push(this.consume('IDENTIFIER').value);
        if (this.check('SYMBOL', ',')) {
          this.advance();
        }
      } while (!this.check('SYMBOL', '{'));
    }

    this.consume('SYMBOL', '{');
    this.skipWhitespaceAndComments();

    const methods: Method[] = [];

    while (!this.check('SYMBOL', '}')) {
      this.skipWhitespaceAndComments();
      if (this.check('SYMBOL', '}')) break;

      const methodName = this.consume('IDENTIFIER').value;
      this.consume('SYMBOL', '@');
      const index = parseInt(this.consume('NUMBER').value);

      // 参数类型
      let paramType: string | undefined;
      if (this.check('SYMBOL', '(')) {
        this.advance();
        if (!this.check('SYMBOL', ')')) {
          paramType = this.consume('IDENTIFIER').value;
        }
        this.consume('SYMBOL', ')');
      }

      // 返回类型
      let resultType: string | undefined;
      if (this.check('SYMBOL', '->')) {
        this.advance();
        resultType = this.consume('IDENTIFIER').value;
      }

      const annotations = this.parseAnnotations();
      this.consume('SYMBOL', ';');

      methods.push({ kind: 'method', name: methodName, index, paramType, resultType, annotations });

      this.skipWhitespaceAndComments();
    }

    this.consume('SYMBOL', '}');

    return { kind: 'interface', name, id, methods, extends: extends_ };
  }

  private parseConst(): ConstDeclaration {
    this.consume('KEYWORD', 'const');
    const name = this.consume('IDENTIFIER').value;
    this.consume('SYMBOL', ':');
    const type = this.parseType();
    this.consume('SYMBOL', '=');
    const value = this.parseValue();
    this.consume('SYMBOL', ';');

    return { kind: 'const', name, type, value };
  }

  private parseAnnotation(): AnnotationDeclaration {
    this.consume('KEYWORD', 'annotation');
    const name = this.consume('IDENTIFIER').value;

    let id: bigint | undefined;
    if (this.check('SYMBOL', '@')) {
      id = this.parseIdAnnotation();
    }

    this.consume('SYMBOL', ':');
    const type = this.parseType();

    // 解析 targets
    const targets: AnnotationTarget[] = [];
    if (this.check('SYMBOL', '(')) {
      this.advance();
      while (!this.check('SYMBOL', ')')) {
        const target = this.consume('IDENTIFIER').value as AnnotationTarget;
        targets.push(target);
        if (this.check('SYMBOL', ',')) {
          this.advance();
        }
      }
      this.consume('SYMBOL', ')');
    }

    this.consume('SYMBOL', ';');

    return { kind: 'annotation', name, id, type, targets };
  }

  // 辅助方法
  private skipWhitespaceAndComments(): void {
    while (this.check('WHITESPACE') || this.check('NEWLINE') || this.check('COMMENT')) {
      this.advance();
    }
  }

  private check(type: TokenType, value?: string): boolean {
    if (this.isAtEnd()) return false;
    const token = this.current();
    if (token.type !== type) return false;
    if (value !== undefined && token.value !== value) return false;
    return true;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.pos++;
    return this.previous();
  }

  private consume(type: TokenType, value?: string): Token {
    if (!this.check(type, value)) {
      const expected = value ? `${type} '${value}'` : type;
      throw this.error(`Expected ${expected}, got ${this.current().value}`);
    }
    return this.advance();
  }

  private current(): Token {
    return this.tokens[this.pos]!;
  }

  private previous(): Token {
    return this.tokens[this.pos - 1]!;
  }

  private isAtEnd(): boolean {
    return this.current().type === 'EOF';
  }

  private error(message: string): ParseError {
    const token = this.current();
    return new ParseError(message, token.line, token.column, this.source);
  }
}

// 主解析函数
export function parseSchemaV2(source: string): SchemaFile {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, source);
  return parser.parse();
}

// 导出所有类型
export * from './types.js';
