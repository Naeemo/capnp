/**
 * 性能对比测试 - Cap'n Proto vs JSON vs MessagePack
 */

import { MessageBuilder, MessageReader } from '../index.js';

// 高精度计时
function nowUs(): number {
  return Number(process.hrtime.bigint()) / 1000;
}

interface BenchmarkResult {
  name: string;
  serializeTime: number;  // μs
  deserializeTime: number;  // μs
  dataSize: number;  // bytes
  opsPerSecond: number;
}

function runBenchmark<T>(
  name: string,
  serialize: () => T,
  deserialize: (data: T) => unknown,
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

  // 总 ops/sec
  const totalTime = serializeTime + deserializeTime;
  const opsPerSecond = 1000000 / totalTime;

  return {
    name,
    serializeTime,
    deserializeTime,
    dataSize,
    opsPerSecond,
  };
}

function formatResult(result: BenchmarkResult): void {
  console.log(`${result.name}:`);
  console.log(`  序列化: ${result.serializeTime.toFixed(3)} μs`);
  console.log(`  反序列化: ${result.deserializeTime.toFixed(3)} μs`);
  console.log(`  数据大小: ${result.dataSize} bytes`);
  console.log(`  吞吐量: ${result.opsPerSecond.toFixed(0)} ops/sec`);
  console.log();
}

// ========== 测试数据 ==========

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
  name: "John Doe",
  email: "john@example.com",
  active: true,
  scores: [95, 87, 92, 88, 91],
  metadata: {
    created: "2024-01-01T00:00:00Z",
    updated: "2024-03-03T12:00:00Z",
  },
};

// ========== Cap'n Proto ==========

function capnpSerialize(): ArrayBuffer {
  const builder = new MessageBuilder();
  const root = builder.initRoot(3, 4);  // 3 data words, 4 pointers
  
  root.setInt32(0, testData.id);
  root.setBool(32, testData.active);
  
  // 文本字段
  root.setText(0, testData.name);
  root.setText(1, testData.email);
  
  // 列表
  const scoresList = root.initList(2, 4, testData.scores.length);
  for (let i = 0; i < testData.scores.length; i++) {
    scoresList.setPrimitive(i, testData.scores[i]);
  }
  
  // 嵌套结构
  const metadata = root.initStruct(3, 2, 0);
  metadata.setText(0, testData.metadata.created);
  metadata.setText(1, testData.metadata.updated);
  
  return builder.toArrayBuffer();
}

function capnpDeserialize(buffer: ArrayBuffer): boolean {
  const reader = new MessageReader(buffer);
  const root = reader.getRoot(3, 4);
  
  root.getInt32(0);  // id
  root.getBool(32);  // active
  root.getText(0);   // name
  root.getText(1);   // email
  
  const scores = root.getList(2, 4);
  if (scores) {
    for (let i = 0; i < testData.scores.length; i++) {
      scores.getPrimitive(i);
    }
  }
  
  const metadata = root.getStruct(3, 2, 0);
  if (metadata) {
    metadata.getText(0);
    metadata.getText(1);
  }
  return true;
}

// ========== JSON ==========

function jsonSerialize(): string {
  return JSON.stringify(testData);
}

function jsonDeserialize(data: string): boolean {
  JSON.parse(data);
  return true;
}

// ========== 运行测试 ==========

console.log("=== 性能对比: Cap'n Proto vs JSON ===\n");
console.log("测试数据: 包含数字、文本、布尔、列表和嵌套结构的对象\n");

const iterations = 50000;

// Cap'n Proto
const capnpResult = runBenchmark(
  "Cap'n Proto",
  capnpSerialize,
  capnpDeserialize,
  (data) => (data as ArrayBuffer).byteLength,
  iterations
);
formatResult(capnpResult);

// JSON
const jsonResult = runBenchmark(
  "JSON",
  jsonSerialize,
  jsonDeserialize,
  (data) => new TextEncoder().encode(data as string).length,
  iterations
);
formatResult(jsonResult);

// 对比总结
console.log("=== 对比总结 ===\n");

const serializeDiff = ((jsonResult.serializeTime - capnpResult.serializeTime) / jsonResult.serializeTime * 100);
const deserializeDiff = ((jsonResult.deserializeTime - capnpResult.deserializeTime) / jsonResult.deserializeTime * 100);
const sizeDiff = ((jsonResult.dataSize - capnpResult.dataSize) / jsonResult.dataSize * 100);

console.log(`序列化速度: ${serializeDiff > 0 ? '快' : '慢'} ${Math.abs(serializeDiff).toFixed(1)}%`);
console.log(`反序列化速度: ${deserializeDiff > 0 ? '快' : '慢'} ${Math.abs(deserializeDiff).toFixed(1)}%`);
console.log(`数据大小: ${sizeDiff > 0 ? '节省' : '增加'} ${Math.abs(sizeDiff).toFixed(1)}%`);
console.log();

if (capnpResult.opsPerSecond > jsonResult.opsPerSecond) {
  console.log(`✅ Cap'n Proto 总吞吐量比 JSON 高 ${(capnpResult.opsPerSecond / jsonResult.opsPerSecond * 100 - 100).toFixed(1)}%`);
} else {
  console.log(`⚠️ JSON 总吞吐量比 Cap'n Proto 高 ${(jsonResult.opsPerSecond / capnpResult.opsPerSecond * 100 - 100).toFixed(1)}%`);
}
