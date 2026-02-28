/**
 * 性能基准测试
 */

import { MessageReader, MessageBuilder } from '../index.js';

// 高精度计时（微秒）
function nowUs(): number {
  return Number(process.hrtime.bigint()) / 1000;
}

// 运行多次取平均
function benchmark(name: string, fn: () => void, iterations: number = 10000): void {
  // 预热
  for (let i = 0; i < 100; i++) fn();
  
  const start = nowUs();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const end = nowUs();
  
  const totalUs = end - start;
  const avgUs = totalUs / iterations;
  const opsPerSecond = 1000000 / avgUs;
  
  console.log(`${name}:`);
  console.log(`  总时间: ${(totalUs / 1000).toFixed(2)} ms (${iterations} 次)`);
  console.log(`  平均: ${avgUs.toFixed(3)} μs/次`);
  console.log(`  吞吐量: ${opsPerSecond.toFixed(0)} ops/sec`);
  console.log();
}

// 测试1: 简单结构序列化
function simpleStructSerialize(): ArrayBuffer {
  const builder = new MessageBuilder();
  const root = builder.initRoot(2, 0);
  root.setInt32(0, 42);
  root.setInt32(4, 100);
  return builder.toArrayBuffer();
}

// 测试2: 简单结构反序列化
function simpleStructDeserialize(buffer: ArrayBuffer): void {
  const reader = new MessageReader(buffer);
  const root = reader.getRoot(2, 0);
  root.getInt32(0);
  root.getInt32(4);
}

// 测试3: 带文本的序列化
function textSerialize(): ArrayBuffer {
  const builder = new MessageBuilder();
  const root = builder.initRoot(1, 1);
  root.setInt32(0, 42);
  root.setText(0, 'Hello, Cap\'n Proto!');
  return builder.toArrayBuffer();
}

// 测试4: 带文本的反序列化
function textDeserialize(buffer: ArrayBuffer): void {
  const reader = new MessageReader(buffer);
  const root = reader.getRoot(1, 1);
  root.getInt32(0);
  root.getText(0);
}

// 测试5: 嵌套结构序列化
function nestedStructSerialize(): ArrayBuffer {
  const builder = new MessageBuilder();
  const root = builder.initRoot(1, 1);
  root.setInt32(0, 1);
  const child = root.initStruct(0, 1, 1);
  child.setInt32(0, 2);
  const grandchild = child.initStruct(0, 1, 0);
  grandchild.setInt32(0, 3);
  return builder.toArrayBuffer();
}

// 测试6: 嵌套结构反序列化
function nestedStructDeserialize(buffer: ArrayBuffer): void {
  const reader = new MessageReader(buffer);
  const root = reader.getRoot(1, 1);
  root.getInt32(0);
  const child = root.getStruct(0, 1, 1);
  if (child) {
    child.getInt32(0);
    const grandchild = child.getStruct(0, 1, 0);
    if (grandchild) {
      grandchild.getInt32(0);
    }
  }
}

// 测试7: 列表序列化
function listSerialize(): ArrayBuffer {
  const builder = new MessageBuilder();
  const root = builder.initRoot(0, 1);
  const list = root.initList(0, 4, 100); // 100个Int32
  for (let i = 0; i < 100; i++) {
    list.setPrimitive(i, i);
  }
  return builder.toArrayBuffer();
}

// 测试8: 列表反序列化
function listDeserialize(buffer: ArrayBuffer): void {
  const reader = new MessageReader(buffer);
  const root = reader.getRoot(0, 1);
  const list = root.getList(0, 4);
  if (list) {
    for (let i = 0; i < list.length; i++) {
      list.getPrimitive(i);
    }
  }
}

// 测试9: 大列表序列化
function largeListSerialize(): ArrayBuffer {
  const builder = new MessageBuilder();
  const root = builder.initRoot(0, 1);
  const list = root.initList(0, 4, 10000); // 10000个Int32
  for (let i = 0; i < 10000; i++) {
    list.setPrimitive(i, i);
  }
  return builder.toArrayBuffer();
}

// 测试10: 大列表反序列化
function largeListDeserialize(buffer: ArrayBuffer): void {
  const reader = new MessageReader(buffer);
  const root = reader.getRoot(0, 1);
  const list = root.getList(0, 4);
  if (list) {
    for (let i = 0; i < list.length; i++) {
      list.getPrimitive(i);
    }
  }
}

// 运行所有测试
console.log('=== Cap\'n Proto TypeScript 性能测试 ===\n');

benchmark('简单结构序列化', simpleStructSerialize, 50000);

const simpleBuffer = simpleStructSerialize();
benchmark('简单结构反序列化', () => simpleStructDeserialize(simpleBuffer), 50000);

benchmark('文本字段序列化', textSerialize, 20000);

const textBuffer = textSerialize();
benchmark('文本字段反序列化', () => textDeserialize(textBuffer), 20000);

benchmark('嵌套结构序列化', nestedStructSerialize, 20000);

const nestedBuffer = nestedStructSerialize();
benchmark('嵌套结构反序列化', () => nestedStructDeserialize(nestedBuffer), 20000);

benchmark('小列表(100)序列化', listSerialize, 10000);

const listBuffer = listSerialize();
benchmark('小列表(100)反序列化', () => listDeserialize(listBuffer), 10000);

benchmark('大列表(10000)序列化', largeListSerialize, 1000);

const largeListBuffer = largeListSerialize();
benchmark('大列表(10000)反序列化', () => largeListDeserialize(largeListBuffer), 1000);

console.log('=== 测试完成 ===');
