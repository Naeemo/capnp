/**
 * 性能对比测试 - Cap'n Proto vs JSON vs Protobuf
 * 
 * 运行: npx tsx src/bench/comparison.ts
 */

import { MessageBuilder, MessageReader } from '../index.js';
import protobuf from 'protobufjs';

// 高精度计时（微秒）
function nowUs(): number {
  return Number(process.hrtime.bigint()) / 1000;
}

// ========== Protobuf Schema 定义 ==========
const protobufRoot = protobuf.Root.fromJSON({
  nested: {
    TestUser: {
      fields: {
        id: { type: "int32", id: 1 },
        name: { type: "string", id: 2 },
        email: { type: "string", id: 3 },
        active: { type: "bool", id: 4 },
        scores: { type: "int32", id: 5, rule: "repeated" },
        metadata: { type: "Metadata", id: 6 }
      }
    },
    Metadata: {
      fields: {
        created: { type: "string", id: 1 },
        updated: { type: "string", id: 2 }
      }
    },
    SimpleStruct: {
      fields: {
        field1: { type: "int32", id: 1 },
        field2: { type: "int32", id: 2 }
      }
    },
    TextStruct: {
      fields: {
        id: { type: "int32", id: 1 },
        text: { type: "string", id: 2 }
      }
    },
    NestedStruct: {
      fields: {
        value: { type: "int32", id: 1 },
        child: { type: "ChildStruct", id: 2 }
      }
    },
    ChildStruct: {
      fields: {
        value: { type: "int32", id: 1 },
        grandchild: { type: "GrandchildStruct", id: 2 }
      }
    },
    GrandchildStruct: {
      fields: {
        value: { type: "int32", id: 1 }
      }
    },
    ListStruct: {
      fields: {
        items: { type: "int32", id: 1, rule: "repeated" }
      }
    }
  }
});

const TestUser = protobufRoot.lookupType("TestUser");
const SimpleStruct = protobufRoot.lookupType("SimpleStruct");
const TextStruct = protobufRoot.lookupType("TextStruct");
const NestedStruct = protobufRoot.lookupType("NestedStruct");
const ListStruct = protobufRoot.lookupType("ListStruct");

// ========== 测试数据结构 ==========

interface TestData {
  id: number;
  name: string;
  email: string;
  active: boolean;
  scores: number[];
  metadata: {
    created: string;
    updated: string;
  };
}

const testData: TestData = {
  id: 12345,
  name: 'John Doe',
  email: 'john@example.com',
  active: true,
  scores: [95, 87, 92, 88, 91],
  metadata: {
    created: '2024-01-01T00:00:00Z',
    updated: '2024-03-03T12:00:00Z',
  },
};

// ========== Cap'n Proto 实现 ==========

function capnpSerialize(): ArrayBuffer {
  const builder = new MessageBuilder();
  const root = builder.initRoot(3, 4);

  root.setInt32(0, testData.id);
  root.setBool(32, testData.active);
  root.setText(0, testData.name);
  root.setText(1, testData.email);

  const scoresList = root.initList(2, 4, testData.scores.length);
  for (let i = 0; i < testData.scores.length; i++) {
    scoresList.setPrimitive(i, testData.scores[i]);
  }

  const metadata = root.initStruct(3, 2, 0);
  metadata.setText(0, testData.metadata.created);
  metadata.setText(1, testData.metadata.updated);

  return builder.toArrayBuffer();
}

function capnpDeserialize(buffer: ArrayBuffer): void {
  const reader = new MessageReader(buffer);
  const root = reader.getRoot(3, 4);

  root.getInt32(0);
  root.getBool(32);
  root.getText(0);
  root.getText(1);

  const scores = root.getList(2, 4);
  if (scores) {
    for (let i = 0; i < scores.length; i++) {
      scores.getPrimitive(i);
    }
  }

  const metadata = root.getStruct(3, 2, 0);
  if (metadata) {
    metadata.getText(0);
    metadata.getText(1);
  }
}

// ========== JSON 实现 ==========

function jsonSerialize(): string {
  return JSON.stringify(testData);
}

function jsonDeserialize(data: string): void {
  const parsed = JSON.parse(data);
  // 访问所有字段确保公平比较
  void parsed.id;
  void parsed.name;
  void parsed.email;
  void parsed.active;
  for (const score of parsed.scores) void score;
  void parsed.metadata.created;
  void parsed.metadata.updated;
}

// ========== Protobuf 实现 ==========

function protobufSerialize(): Uint8Array {
  return TestUser.encode(testData).finish();
}

function protobufDeserialize(data: Uint8Array): void {
  const decoded = TestUser.decode(data) as any;
  // 访问所有字段确保公平比较
  void decoded.id;
  void decoded.name;
  void decoded.email;
  void decoded.active;
  for (const score of decoded.scores) void score;
  void decoded.metadata?.created;
  void decoded.metadata?.updated;
}

// ========== 基准测试框架 ==========

interface BenchmarkResult {
  name: string;
  payload: string;
  serializeTime: number; // μs
  deserializeTime: number; // μs
  totalTime: number; // μs
  dataSize: number; // bytes
  opsPerSecond: number;
}

function runBenchmark<T>(
  name: string,
  payload: string,
  serialize: () => T,
  deserialize: (data: T) => void,
  getSize: (data: T) => number,
  iterations = 10000
): BenchmarkResult {
  // 预热
  for (let i = 0; i < 100; i++) {
    const data = serialize();
    deserialize(data);
  }

  // 测试序列化
  const serializeStart = nowUs();
  const samples: T[] = [];
  for (let i = 0; i < iterations; i++) {
    samples.push(serialize());
  }
  const serializeTime = (nowUs() - serializeStart) / iterations;

  // 测试反序列化
  const deserializeStart = nowUs();
  for (const sample of samples) {
    deserialize(sample);
  }
  const deserializeTime = (nowUs() - deserializeStart) / iterations;

  // 数据大小
  const dataSize = getSize(samples[0]);

  // 总时间
  const totalTime = serializeTime + deserializeTime;
  const opsPerSecond = 1000000 / totalTime;

  return {
    name,
    payload,
    serializeTime,
    deserializeTime,
    totalTime,
    dataSize,
    opsPerSecond,
  };
}

// ========== 不同负载的测试 ==========

interface PayloadTest {
  name: string;
  iterations: number;
}

const payloads: PayloadTest[] = [
  { name: '简单结构', iterations: 50000 },
  { name: '文本字段', iterations: 20000 },
  { name: '嵌套结构', iterations: 20000 },
  { name: '小列表(100)', iterations: 10000 },
  { name: '大列表(10000)', iterations: 1000 },
];

// 简单结构测试数据
const simpleData = { field1: 42, field2: 100 };

function capnpSimpleSerialize(): ArrayBuffer {
  const builder = new MessageBuilder();
  const root = builder.initRoot(2, 0);
  root.setInt32(0, simpleData.field1);
  root.setInt32(4, simpleData.field2);
  return builder.toArrayBuffer();
}

function capnpSimpleDeserialize(buffer: ArrayBuffer): void {
  const reader = new MessageReader(buffer);
  const root = reader.getRoot(2, 0);
  root.getInt32(0);
  root.getInt32(4);
}

function jsonSimpleSerialize(): string {
  return JSON.stringify(simpleData);
}

function jsonSimpleDeserialize(data: string): void {
  const parsed = JSON.parse(data);
  void parsed.field1;
  void parsed.field2;
}

function protobufSimpleSerialize(): Uint8Array {
  return SimpleStruct.encode(simpleData).finish();
}

function protobufSimpleDeserialize(data: Uint8Array): void {
  const decoded = SimpleStruct.decode(data) as any;
  void decoded.field1;
  void decoded.field2;
}

// 文本字段测试数据
const textData = { id: 42, text: "Hello, World! This is a test string." };

function capnpTextSerialize(): ArrayBuffer {
  const builder = new MessageBuilder();
  const root = builder.initRoot(1, 1);
  root.setInt32(0, textData.id);
  root.setText(0, textData.text);
  return builder.toArrayBuffer();
}

function capnpTextDeserialize(buffer: ArrayBuffer): void {
  const reader = new MessageReader(buffer);
  const root = reader.getRoot(1, 1);
  root.getInt32(0);
  root.getText(0);
}

function jsonTextSerialize(): string {
  return JSON.stringify(textData);
}

function jsonTextDeserialize(data: string): void {
  const parsed = JSON.parse(data);
  void parsed.id;
  void parsed.text;
}

function protobufTextSerialize(): Uint8Array {
  return TextStruct.encode(textData).finish();
}

function protobufTextDeserialize(data: Uint8Array): void {
  const decoded = TextStruct.decode(data) as any;
  void decoded.id;
  void decoded.text;
}

// 嵌套结构测试数据
const nestedData = {
  value: 1,
  child: {
    value: 2,
    grandchild: {
      value: 3
    }
  }
};

function capnpNestedSerialize(): ArrayBuffer {
  const builder = new MessageBuilder();
  const root = builder.initRoot(1, 1);
  root.setInt32(0, nestedData.value);
  const child = root.initStruct(0, 1, 1);
  child.setInt32(0, nestedData.child.value);
  const grandchild = child.initStruct(0, 1, 0);
  grandchild.setInt32(0, nestedData.child.grandchild.value);
  return builder.toArrayBuffer();
}

function capnpNestedDeserialize(buffer: ArrayBuffer): void {
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

function jsonNestedSerialize(): string {
  return JSON.stringify(nestedData);
}

function jsonNestedDeserialize(data: string): void {
  const parsed = JSON.parse(data);
  void parsed.value;
  void parsed.child?.value;
  void parsed.child?.grandchild?.value;
}

function protobufNestedSerialize(): Uint8Array {
  return NestedStruct.encode(nestedData).finish();
}

function protobufNestedDeserialize(data: Uint8Array): void {
  const decoded = NestedStruct.decode(data) as any;
  void decoded.value;
  void decoded.child?.value;
  void decoded.child?.grandchild?.value;
}

// 小列表测试数据 (100 items)
const smallListData = { items: Array.from({ length: 100 }, (_, i) => i) };

function capnpSmallListSerialize(): ArrayBuffer {
  const builder = new MessageBuilder();
  const root = builder.initRoot(0, 1);
  const list = root.initList(0, 4, smallListData.items.length);
  for (let i = 0; i < smallListData.items.length; i++) {
    list.setPrimitive(i, smallListData.items[i]);
  }
  return builder.toArrayBuffer();
}

function capnpSmallListDeserialize(buffer: ArrayBuffer): void {
  const reader = new MessageReader(buffer);
  const root = reader.getRoot(0, 1);
  const list = root.getList(0, 4);
  if (list) {
    for (let i = 0; i < list.length; i++) {
      list.getPrimitive(i);
    }
  }
}

function jsonSmallListSerialize(): string {
  return JSON.stringify(smallListData);
}

function jsonSmallListDeserialize(data: string): void {
  const parsed = JSON.parse(data);
  for (const item of parsed.items) void item;
}

function protobufSmallListSerialize(): Uint8Array {
  return ListStruct.encode(smallListData).finish();
}

function protobufSmallListDeserialize(data: Uint8Array): void {
  const decoded = ListStruct.decode(data) as any;
  for (const item of decoded.items) void item;
}

// 大列表测试数据 (10000 items)
const largeListData = { items: Array.from({ length: 10000 }, (_, i) => i) };

function capnpLargeListSerialize(): ArrayBuffer {
  const builder = new MessageBuilder();
  const root = builder.initRoot(0, 1);
  const list = root.initList(0, 4, largeListData.items.length);
  for (let i = 0; i < largeListData.items.length; i++) {
    list.setPrimitive(i, largeListData.items[i]);
  }
  return builder.toArrayBuffer();
}

function capnpLargeListDeserialize(buffer: ArrayBuffer): void {
  const reader = new MessageReader(buffer);
  const root = reader.getRoot(0, 1);
  const list = root.getList(0, 4);
  if (list) {
    for (let i = 0; i < list.length; i++) {
      list.getPrimitive(i);
    }
  }
}

function jsonLargeListSerialize(): string {
  return JSON.stringify(largeListData);
}

function jsonLargeListDeserialize(data: string): void {
  const parsed = JSON.parse(data);
  for (const item of parsed.items) void item;
}

function protobufLargeListSerialize(): Uint8Array {
  return ListStruct.encode(largeListData).finish();
}

function protobufLargeListDeserialize(data: Uint8Array): void {
  const decoded = ListStruct.decode(data) as any;
  for (const item of decoded.items) void item;
}

// ========== 主程序 ==========

console.log("=== Cap'n Proto vs JSON vs Protobuf 性能对比 ===\n");

// 运行所有负载的测试
const results: Map<string, Map<string, BenchmarkResult>> = new Map();

for (const payload of payloads) {
  console.log(`\n--- ${payload.name} ---`);
  const payloadResults = new Map<string, BenchmarkResult>();
  
  let capnpResult: BenchmarkResult;
  let jsonResult: BenchmarkResult;
  let protobufResult: BenchmarkResult;

  switch (payload.name) {
    case '简单结构':
      capnpResult = runBenchmark("Cap'n Proto", payload.name, capnpSimpleSerialize, capnpSimpleDeserialize, (d) => (d as ArrayBuffer).byteLength, payload.iterations);
      jsonResult = runBenchmark("JSON", payload.name, jsonSimpleSerialize, jsonSimpleDeserialize, (d) => new TextEncoder().encode(d as string).length, payload.iterations);
      protobufResult = runBenchmark("Protobuf", payload.name, protobufSimpleSerialize, protobufSimpleDeserialize, (d) => (d as Uint8Array).length, payload.iterations);
      break;
    
    case '文本字段':
      capnpResult = runBenchmark("Cap'n Proto", payload.name, capnpTextSerialize, capnpTextDeserialize, (d) => (d as ArrayBuffer).byteLength, payload.iterations);
      jsonResult = runBenchmark("JSON", payload.name, jsonTextSerialize, jsonTextDeserialize, (d) => new TextEncoder().encode(d as string).length, payload.iterations);
      protobufResult = runBenchmark("Protobuf", payload.name, protobufTextSerialize, protobufTextDeserialize, (d) => (d as Uint8Array).length, payload.iterations);
      break;
    
    case '嵌套结构':
      capnpResult = runBenchmark("Cap'n Proto", payload.name, capnpNestedSerialize, capnpNestedDeserialize, (d) => (d as ArrayBuffer).byteLength, payload.iterations);
      jsonResult = runBenchmark("JSON", payload.name, jsonNestedSerialize, jsonNestedDeserialize, (d) => new TextEncoder().encode(d as string).length, payload.iterations);
      protobufResult = runBenchmark("Protobuf", payload.name, protobufNestedSerialize, protobufNestedDeserialize, (d) => (d as Uint8Array).length, payload.iterations);
      break;
    
    case '小列表(100)':
      capnpResult = runBenchmark("Cap'n Proto", payload.name, capnpSmallListSerialize, capnpSmallListDeserialize, (d) => (d as ArrayBuffer).byteLength, payload.iterations);
      jsonResult = runBenchmark("JSON", payload.name, jsonSmallListSerialize, jsonSmallListDeserialize, (d) => new TextEncoder().encode(d as string).length, payload.iterations);
      protobufResult = runBenchmark("Protobuf", payload.name, protobufSmallListSerialize, protobufSmallListDeserialize, (d) => (d as Uint8Array).length, payload.iterations);
      break;
    
    case '大列表(10000)':
      capnpResult = runBenchmark("Cap'n Proto", payload.name, capnpLargeListSerialize, capnpLargeListDeserialize, (d) => (d as ArrayBuffer).byteLength, payload.iterations);
      jsonResult = runBenchmark("JSON", payload.name, jsonLargeListSerialize, jsonLargeListDeserialize, (d) => new TextEncoder().encode(d as string).length, payload.iterations);
      protobufResult = runBenchmark("Protobuf", payload.name, protobufLargeListSerialize, protobufLargeListDeserialize, (d) => (d as Uint8Array).length, payload.iterations);
      break;
    
    default:
      // 默认使用复杂对象测试
      capnpResult = runBenchmark("Cap'n Proto", payload.name, capnpSerialize, capnpDeserialize, (d) => (d as ArrayBuffer).byteLength, payload.iterations);
      jsonResult = runBenchmark("JSON", payload.name, jsonSerialize, jsonDeserialize, (d) => new TextEncoder().encode(d as string).length, payload.iterations);
      protobufResult = runBenchmark("Protobuf", payload.name, protobufSerialize, protobufDeserialize, (d) => (d as Uint8Array).length, payload.iterations);
  }

  payloadResults.set("capnp", capnpResult);
  payloadResults.set("json", jsonResult);
  payloadResults.set("protobuf", protobufResult);
  results.set(payload.name, payloadResults);

  // 输出单个负载的详细结果
  console.log(`  Cap'n Proto: ${capnpResult.opsPerSecond.toFixed(0)} ops/sec, ${capnpResult.dataSize} bytes`);
  console.log(`  JSON:        ${jsonResult.opsPerSecond.toFixed(0)} ops/sec, ${jsonResult.dataSize} bytes`);
  console.log(`  Protobuf:    ${protobufResult.opsPerSecond.toFixed(0)} ops/sec, ${protobufResult.dataSize} bytes`);
}

// ========== 生成对比表格 ==========

console.log("\n\n=== 性能对比表格 ===\n");
console.log("| Payload | Capnp ops | JSON ops | Protobuf ops | Speedup vs JSON | Speedup vs Protobuf |");
console.log("|---------|-----------|----------|--------------|-----------------|---------------------|");

for (const [payloadName, payloadResults] of results) {
  const capnpOps = payloadResults.get("capnp")!.opsPerSecond;
  const jsonOps = payloadResults.get("json")!.opsPerSecond;
  const protobufOps = payloadResults.get("protobuf")!.opsPerSecond;
  
  const speedupVsJson = capnpOps / jsonOps;
  const speedupVsProtobuf = capnpOps / protobufOps;

  console.log(
    `| ${payloadName.padEnd(7)} | ${capnpOps.toFixed(0).padStart(9)} | ${jsonOps.toFixed(0).padStart(8)} | ${protobufOps.toFixed(0).padStart(12)} | ${speedupVsJson.toFixed(2)}x${speedupVsJson > 1 ? ' ↑' : ' ↓'} | ${speedupVsProtobuf.toFixed(2)}x${speedupVsProtobuf > 1 ? ' ↑' : ' ↓'} |`
  );
}

// ========== 数据大小对比表格 ==========

console.log("\n=== 数据大小对比 ===\n");
console.log("| Payload | Capnp bytes | JSON bytes | Protobuf bytes | JSON Ratio | Protobuf Ratio |");
console.log("|---------|-------------|------------|----------------|------------|----------------|");

for (const [payloadName, payloadResults] of results) {
  const capnpSize = payloadResults.get("capnp")!.dataSize;
  const jsonSize = payloadResults.get("json")!.dataSize;
  const protobufSize = payloadResults.get("protobuf")!.dataSize;
  
  const jsonRatio = jsonSize / capnpSize;
  const protobufRatio = protobufSize / capnpSize;

  console.log(
    `| ${payloadName.padEnd(7)} | ${capnpSize.toString().padStart(11)} | ${jsonSize.toString().padStart(10)} | ${protobufSize.toString().padStart(14)} | ${jsonRatio.toFixed(2)}x | ${protobufRatio.toFixed(2)}x |`
  );
}

// ========== 综合结论 ==========

console.log("\n=== 综合结论 ===\n");

// 计算平均值
let totalSpeedupVsJson = 0;
let totalSpeedupVsProtobuf = 0;
let count = 0;

for (const [, payloadResults] of results) {
  const capnpOps = payloadResults.get("capnp")!.opsPerSecond;
  const jsonOps = payloadResults.get("json")!.opsPerSecond;
  const protobufOps = payloadResults.get("protobuf")!.opsPerSecond;
  
  totalSpeedupVsJson += capnpOps / jsonOps;
  totalSpeedupVsProtobuf += capnpOps / protobufOps;
  count++;
}

const avgSpeedupVsJson = totalSpeedupVsJson / count;
const avgSpeedupVsProtobuf = totalSpeedupVsProtobuf / count;

console.log(`平均速度对比:`);
console.log(`  Cap'n Proto vs JSON:     ${avgSpeedupVsJson > 1 ? '快' : '慢'} ${avgSpeedupVsJson.toFixed(2)}x`);
console.log(`  Cap'n Proto vs Protobuf: ${avgSpeedupVsProtobuf > 1 ? '快' : '慢'} ${avgSpeedupVsProtobuf.toFixed(2)}x`);

// 找出最佳和最差场景
const sortedByJsonSpeedup = Array.from(results.entries())
  .map(([name, res]) => ({
    name,
    speedup: res.get("capnp")!.opsPerSecond / res.get("json")!.opsPerSecond
  }))
  .sort((a, b) => b.speedup - a.speedup);

const sortedByProtobufSpeedup = Array.from(results.entries())
  .map(([name, res]) => ({
    name,
    speedup: res.get("capnp")!.opsPerSecond / res.get("protobuf")!.opsPerSecond
  }))
  .sort((a, b) => b.speedup - a.speedup);

console.log(`\n最佳表现场景 (vs JSON): ${sortedByJsonSpeedup[0].name} (${sortedByJsonSpeedup[0].speedup.toFixed(2)}x)`);
console.log(`最差表现场景 (vs JSON): ${sortedByJsonSpeedup[sortedByJsonSpeedup.length - 1].name} (${sortedByJsonSpeedup[sortedByJsonSpeedup.length - 1].speedup.toFixed(2)}x)`);
console.log(`\n最佳表现场景 (vs Protobuf): ${sortedByProtobufSpeedup[0].name} (${sortedByProtobufSpeedup[0].speedup.toFixed(2)}x)`);
console.log(`最差表现场景 (vs Protobuf): ${sortedByProtobufSpeedup[sortedByProtobufSpeedup.length - 1].name} (${sortedByProtobufSpeedup[sortedByProtobufSpeedup.length - 1].speedup.toFixed(2)}x)`);

console.log("\n=== 测试完成 ===");
