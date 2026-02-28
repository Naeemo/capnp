/**
 * Struct generator
 */

import type { Struct } from './parser-v2.js';
import {
  capitalize,
  getGetterMethod,
  getSetterMethod,
  getTypeSize,
  isPointerType,
  mapTypeToTs,
} from './type-utils.js';

export function generateStruct(struct: Struct, lines: string[]): void {
  let dataWords = 0;
  let pointerCount = 0;
  let dataOffset = 0;

  for (const field of struct.fields) {
    if (isPointerType(field.type)) {
      pointerCount++;
    } else {
      dataOffset += getTypeSize(field.type);
    }
  }
  dataWords = Math.ceil(dataOffset / 8);

  // Interface
  lines.push(`export interface ${struct.name} {`);
  for (const field of struct.fields) {
    lines.push(`  ${field.name}: ${mapTypeToTs(field.type)};`);
  }
  lines.push('}');
  lines.push('');

  // Reader
  generateReader(struct, dataWords, pointerCount, lines);

  // Builder
  generateBuilder(struct, dataWords, pointerCount, lines);
}

function generateReader(
  struct: Struct,
  _dataWords: number,
  _pointerCount: number,
  lines: string[]
): void {
  lines.push(`export class ${struct.name}Reader {`);
  lines.push('  private reader: StructReader;');
  lines.push('');
  lines.push('  constructor(reader: StructReader) {');
  lines.push('    this.reader = reader;');
  lines.push('  }');
  lines.push('');

  let dataOffset = 0;
  let pointerIndex = 0;
  for (const field of struct.fields) {
    const tsType = mapTypeToTs(field.type);
    if (isPointerType(field.type)) {
      lines.push(`  get ${field.name}(): ${tsType} {`);
      lines.push(`    return this.reader.${getGetterMethod(field.type)}(${pointerIndex});`);
      lines.push('  }');
      pointerIndex++;
    } else {
      lines.push(`  get ${field.name}(): ${tsType} {`);
      lines.push(`    return this.reader.${getGetterMethod(field.type)}(${dataOffset});`);
      lines.push('  }');
      dataOffset += getTypeSize(field.type);
    }
    lines.push('');
  }
  lines.push('}');
  lines.push('');
}

function generateBuilder(
  struct: Struct,
  dataWords: number,
  pointerCount: number,
  lines: string[]
): void {
  lines.push(`export class ${struct.name}Builder {`);
  lines.push('  private builder: StructBuilder;');
  lines.push('');
  lines.push('  constructor(builder: StructBuilder) {');
  lines.push('    this.builder = builder;');
  lines.push('  }');
  lines.push('');
  lines.push(`  static create(message: MessageBuilder): ${struct.name}Builder {`);
  lines.push(`    const root = message.initRoot(${dataWords}, ${pointerCount});`);
  lines.push(`    return new ${struct.name}Builder(root);`);
  lines.push('  }');
  lines.push('');

  let dataOffset = 0;
  let pointerIndex = 0;
  for (const field of struct.fields) {
    const tsType = mapTypeToTs(field.type);
    const method = getSetterMethod(field.type);
    if (isPointerType(field.type)) {
      lines.push(`  set${capitalize(field.name)}(value: ${tsType}): void {`);
      lines.push(`    this.builder.${method}(${pointerIndex}, value);`);
      lines.push('  }');
      pointerIndex++;
    } else {
      lines.push(`  set${capitalize(field.name)}(value: ${tsType}): void {`);
      lines.push(`    this.builder.${method}(${dataOffset}, value);`);
      lines.push('  }');
      dataOffset += getTypeSize(field.type);
    }
    lines.push('');
  }
  lines.push('}');
  lines.push('');
}
