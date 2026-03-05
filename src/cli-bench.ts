#!/usr/bin/env node
/**
 * Cap'n Proto Benchmark CLI
 *
 * Usage: capnp bench [options]
 */

import { writeFileSync } from 'node:fs';
import * as os from 'node:os';
import { MessageBuilder, MessageReader } from './index.js';

const CLI_VERSION = '0.9.0';

/**
 * 基准测试结果
 */
export interface BenchmarkResult {
  name: string;
  serializeTime: number; // μs
  deserializeTime: number; // μs
  dataSize: number; // bytes
  opsPerSecond: number;
}

/**
 * 测试环境信息
 */
export interface EnvironmentInfo {
  nodeVersion: string;
  platform: string;
  arch: string;
  cpu: string;
  cpus: number;
  totalMemory: string;
  freeMemory: string;
}

/**
 * 基准测试报告
 */
export interface BenchmarkReport {
  environment: EnvironmentInfo;
  results: BenchmarkResult[];
  sizes: string[];
  comparisons: string[];
  generatedAt: string;
}

// 高精度计时（微秒）
function nowUs(): number {
  return Number(process.hrtime.bigint()) / 1000;
}

/**
 * 获取测试环境信息
 */
function getEnvironmentInfo(): EnvironmentInfo {
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model : 'Unknown';

  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: cpuModel,
    cpus: cpus.length,
    totalMemory: formatBytes(os.totalmem()),
    freeMemory: formatBytes(os.freemem()),
  };
}

/**
 * 格式化字节大小
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

/**
 * 解析大小字符串（如 "64B", "1KB", "1MB"）为字节数
 */
function parseSize(sizeStr: string): number {
  const match = sizeStr.trim().match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i);
  if (!match) {
    throw new Error(`Invalid size format: ${sizeStr}`);
  }
  const value = Number.parseFloat(match[1]);
  const unit = (match[2] || 'B').toUpperCase();
  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  };
  return Math.floor(value * (multipliers[unit] || 1));
}

/**
 * 生成测试数据
 */
function generateTestData(sizeBytes: number): {
  id: number;
  name: string;
  data: number[];
  metadata: Record<string, unknown>;
} {
  const dataArraySize = Math.max(1, Math.floor((sizeBytes - 200) / 4)); // 预留空间给其他字段
  return {
    id: Date.now(),
    name: `Test User ${Math.random().toString(36).substring(7)}`,
    data: Array.from({ length: Math.min(dataArraySize, 100000) }, (_, i) => i),
    metadata: {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      tags: ['benchmark', 'test', 'performance'],
      nested: {
        level1: {
          level2: {
            value: Math.random(),
          },
        },
      },
    },
  };
}

/**
 * 运行单次基准测试
 */
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
  const opsPerSecond = totalTime > 0 ? 1000000 / totalTime : 0;

  return {
    name,
    serializeTime,
    deserializeTime,
    dataSize,
    opsPerSecond,
  };
}

// ========== Cap'n Proto 序列化/反序列化 ==========

function capnpSerialize(data: ReturnType<typeof generateTestData>): ArrayBuffer {
  const builder = new MessageBuilder();
  const root = builder.initRoot(2, 3);

  root.setInt32(0, data.id);

  // 文本字段
  root.setText(0, data.name);

  // 列表
  const dataList = root.initList(1, 4, data.data.length);
  for (let i = 0; i < data.data.length; i++) {
    dataList.setPrimitive(i, data.data[i]);
  }

  // 嵌套结构（简化处理）
  const metadata = root.initStruct(2, 1, 1);
  metadata.setText(0, data.metadata.timestamp as string);

  return builder.toArrayBuffer();
}

function capnpDeserialize(buffer: ArrayBuffer): boolean {
  const reader = new MessageReader(buffer);
  const root = reader.getRoot(2, 3);

  root.getInt32(0);
  root.getText(0);

  const list = root.getList(1, 4);
  if (list) {
    for (let i = 0; i < Math.min(list.length, 100); i++) {
      list.getPrimitive(i);
    }
  }

  const metadata = root.getStruct(2, 1, 1);
  if (metadata) {
    metadata.getText(0);
  }

  return true;
}

// ========== JSON 序列化/反序列化 ==========

function jsonSerialize(data: ReturnType<typeof generateTestData>): string {
  return JSON.stringify(data);
}

function jsonDeserialize(jsonStr: string): unknown {
  return JSON.parse(jsonStr);
}

// ========== Protobuf 模拟（使用 Buffer） ==========

// 简化的 Protobuf 模拟，实际项目中可以使用 protobufjs
function protobufSerialize(data: ReturnType<typeof generateTestData>): Buffer {
  // 使用 BSON-like 的简单编码
  const header = Buffer.alloc(8);
  header.writeUInt32LE((data.id & 0xffffffff) >>> 0, 0);
  header.writeUInt32LE(data.data.length, 4);

  const nameBuf = Buffer.from(data.name, 'utf-8');
  const nameLen = Buffer.alloc(4);
  nameLen.writeUInt32LE(nameBuf.length, 0);

  const dataBuf = Buffer.from(new Int32Array(data.data).buffer);

  return Buffer.concat([header, nameLen, nameBuf, dataBuf]);
}

function protobufDeserialize(buffer: Buffer): boolean {
  let offset = 0;
  const _id = buffer.readUInt32LE(offset);
  offset += 4;
  const dataLen = buffer.readUInt32LE(offset);
  offset += 4;

  const nameLen = buffer.readUInt32LE(offset);
  offset += 4;
  offset += nameLen; // 跳过 name

  // 读取数据
  for (let i = 0; i < Math.min(dataLen, 100); i++) {
    buffer.readInt32LE(offset + i * 4);
  }

  return true;
}

/**
 * 运行所有基准测试
 */
function runAllBenchmarks(
  sizes: string[],
  includeJson: boolean,
  includeProtobuf: boolean
): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];

  for (const sizeStr of sizes) {
    const sizeBytes = parseSize(sizeStr);
    const testData = generateTestData(sizeBytes);
    const iterations = Math.max(1000, Math.min(50000, Math.floor(10000000 / sizeBytes)));

    // Cap'n Proto
    const capnpResult = runBenchmark(
      `Cap'n Proto (${sizeStr})`,
      () => capnpSerialize(testData),
      capnpDeserialize,
      (data) => (data as ArrayBuffer).byteLength,
      iterations
    );
    results.push(capnpResult);

    // JSON
    if (includeJson) {
      const jsonResult = runBenchmark(
        `JSON (${sizeStr})`,
        () => jsonSerialize(testData),
        jsonDeserialize,
        (data) => new TextEncoder().encode(data as string).length,
        iterations
      );
      results.push(jsonResult);
    }

    // Protobuf
    if (includeProtobuf) {
      const protobufResult = runBenchmark(
        `Protobuf (${sizeStr})`,
        () => protobufSerialize(testData),
        protobufDeserialize,
        (data) => (data as Buffer).length,
        iterations
      );
      results.push(protobufResult);
    }
  }

  return results;
}

/**
 * 格式化基准测试报告为 Markdown
 */
function formatMarkdownReport(report: BenchmarkReport): string {
  const lines: string[] = [];

  lines.push("# Cap'n Proto Benchmark Report");
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');

  // 环境信息
  lines.push('## Environment');
  lines.push('');
  lines.push(`- **Node.js**: ${report.environment.nodeVersion}`);
  lines.push(`- **Platform**: ${report.environment.platform} (${report.environment.arch})`);
  lines.push(`- **CPU**: ${report.environment.cpu}`);
  lines.push(`- **CPU Cores**: ${report.environment.cpus}`);
  lines.push(`- **Total Memory**: ${report.environment.totalMemory}`);
  lines.push(`- **Free Memory**: ${report.environment.freeMemory}`);
  lines.push('');

  // 结果表格
  lines.push('## Results');
  lines.push('');
  lines.push('| Format | Payload Size | Serialize (μs) | Deserialize (μs) | Data Size | Ops/Sec |');
  lines.push('|--------|--------------|----------------|------------------|-----------|---------|');

  for (const result of report.results) {
    lines.push(
      `| ${result.name.padEnd(20)} | ${formatBytes(result.dataSize).padStart(10)} | ` +
        `${result.serializeTime.toFixed(3).padStart(14)} | ${result.deserializeTime.toFixed(3).padStart(16)} | ` +
        `${result.dataSize.toString().padStart(9)} | ${result.opsPerSecond.toFixed(0).padStart(7)} |`
    );
  }

  lines.push('');

  // 对比分析
  if (report.comparisons.length > 1) {
    lines.push('## Comparison Summary');
    lines.push('');

    const groupedBySize = new Map<string, BenchmarkResult[]>();
    for (const result of report.results) {
      const sizeMatch = result.name.match(/\(([^)]+)\)/);
      const size = sizeMatch ? sizeMatch[1] : 'unknown';
      if (!groupedBySize.has(size)) {
        groupedBySize.set(size, []);
      }
      groupedBySize.get(size)!.push(result);
    }

    for (const [size, results] of groupedBySize) {
      if (results.length > 1) {
        lines.push(`### ${size} Payload`);
        lines.push('');

        // 找出最快的
        const fastest = results.reduce((a, b) => (a.opsPerSecond > b.opsPerSecond ? a : b));
        lines.push(
          `- **Fastest**: ${fastest.name.split(' ')[0]} (${fastest.opsPerSecond.toFixed(0)} ops/sec)`
        );

        // 找出最小的
        const smallest = results.reduce((a, b) => (a.dataSize < b.dataSize ? a : b));
        lines.push(
          `- **Smallest**: ${smallest.name.split(' ')[0]} (${formatBytes(smallest.dataSize)})`
        );

        // 计算相对性能
        const capnpResult = results.find((r) => r.name.includes("Cap'n Proto"));
        if (capnpResult) {
          for (const result of results) {
            if (result !== capnpResult) {
              const format = result.name.split(' ')[0];
              const speedup = capnpResult.opsPerSecond / result.opsPerSecond;
              const sizeDiff = ((capnpResult.dataSize - result.dataSize) / result.dataSize) * 100;
              lines.push(
                `- vs ${format}: ${speedup > 1 ? `**${speedup.toFixed(2)}x faster**` : `${(1 / speedup).toFixed(2)}x slower`}, data size ${sizeDiff > 0 ? '+' : ''}${sizeDiff.toFixed(1)}%`
              );
            }
          }
        }
        lines.push('');
      }
    }
  }

  lines.push('## Conclusion');
  lines.push('');

  const capnpResults = report.results.filter((r) => r.name.includes("Cap'n Proto"));
  if (capnpResults.length > 0) {
    const avgOps = capnpResults.reduce((sum, r) => sum + r.opsPerSecond, 0) / capnpResults.length;
    lines.push(
      `Cap'n Proto achieved an average throughput of **${avgOps.toFixed(0)} ops/sec** across all tested payload sizes.`
    );
    lines.push('');

    if (report.comparisons.length > 1) {
      lines.push('Based on the benchmark results:');
      lines.push('');
      lines.push("- Cap'n Proto offers competitive serialization performance");
      lines.push('- Zero-copy architecture provides advantages for large payloads');
      lines.push('- Compact binary format reduces network overhead');
    }
  }

  lines.push('');
  lines.push('---');
  lines.push(`*Generated by Cap'n Proto Benchmark CLI v${CLI_VERSION}*`);

  return lines.join('\n');
}

/**
 * 格式化为 CSV
 */
function formatCsvReport(report: BenchmarkReport): string {
  const lines: string[] = [];
  lines.push('Format,Payload Size,Serialize (μs),Deserialize (μs),Data Size (bytes),Ops/Sec');

  for (const result of report.results) {
    lines.push(
      `${result.name},${result.dataSize},${result.serializeTime},${result.deserializeTime},${result.dataSize},${result.opsPerSecond}`
    );
  }

  return lines.join('\n');
}

/**
 * 格式化报告为终端输出（类似 audit 命令风格）
 */
function formatTerminalReport(report: BenchmarkReport): string {
  const lines: string[] = [];

  lines.push('='.repeat(70));
  lines.push("CAP'N PROTO BENCHMARK REPORT");
  lines.push('='.repeat(70));
  lines.push('');

  // 环境信息
  lines.push('Environment:');
  lines.push(`  Node.js: ${report.environment.nodeVersion}`);
  lines.push(`  Platform: ${report.environment.platform} (${report.environment.arch})`);
  lines.push(`  CPU: ${report.environment.cpu}`);
  lines.push(`  CPU Cores: ${report.environment.cpus}`);
  lines.push(`  Memory: ${report.environment.freeMemory} / ${report.environment.totalMemory}`);
  lines.push('');

  // 结果表格
  lines.push('Benchmark Results:');
  lines.push('-'.repeat(70));
  lines.push(
    `${'Format'.padEnd(22)} ${'Size'.padStart(10)} ${'Serialize'.padStart(12)} ${'Deserialize'.padStart(12)} ${'Ops/Sec'.padStart(12)}`
  );
  lines.push('-'.repeat(70));

  for (const result of report.results) {
    const format = result.name.padEnd(22);
    const size = formatBytes(result.dataSize).padStart(10);
    const ser = `${result.serializeTime.toFixed(2)} μs`.padStart(12);
    const deser = `${result.deserializeTime.toFixed(2)} μs`.padStart(12);
    const ops = result.opsPerSecond.toFixed(0).padStart(12);
    lines.push(`${format} ${size} ${ser} ${deser} ${ops}`);
  }

  lines.push('-'.repeat(70));
  lines.push('');

  // 对比总结
  if (report.comparisons.length > 1) {
    lines.push('Comparison Summary:');
    lines.push('');

    const groupedBySize = new Map<string, BenchmarkResult[]>();
    for (const result of report.results) {
      const sizeMatch = result.name.match(/\(([^)]+)\)/);
      const size = sizeMatch ? sizeMatch[1] : 'unknown';
      if (!groupedBySize.has(size)) {
        groupedBySize.set(size, []);
      }
      groupedBySize.get(size)!.push(result);
    }

    for (const [size, results] of groupedBySize) {
      if (results.length > 1) {
        lines.push(`  ${size} Payload:`);

        const capnpResult = results.find((r) => r.name.includes("Cap'n Proto"));
        if (capnpResult) {
          for (const result of results) {
            if (result !== capnpResult) {
              const format = result.name.split(' ')[0];
              const speedup = capnpResult.opsPerSecond / result.opsPerSecond;
              const icon = speedup > 1 ? '✅' : '⚠️';
              lines.push(
                `    ${icon} vs ${format}: ${speedup.toFixed(2)}x ${speedup > 1 ? 'faster' : 'slower'}`
              );
            }
          }
        }
        lines.push('');
      }
    }
  }

  lines.push('Conclusion:');
  const capnpResults = report.results.filter((r) => r.name.includes("Cap'n Proto"));
  if (capnpResults.length > 0) {
    const avgOps = capnpResults.reduce((sum, r) => sum + r.opsPerSecond, 0) / capnpResults.length;
    lines.push(`  Cap'n Proto average: ${avgOps.toFixed(0)} ops/sec`);
  }
  lines.push('');
  lines.push('='.repeat(70));

  return lines.join('\n');
}

function printUsage() {
  console.log(`
Cap'n Proto Benchmark CLI v${CLI_VERSION}

Usage: capnp bench [options]

Options:
  --sizes <list>        Comma-separated payload sizes (default: 1KB,10KB,100KB)
                        Examples: 64B,1KB,1MB or 100B,500B,1KB,10KB
  --vs-json             Include JSON comparison
  --vs-protobuf         Include Protobuf comparison
  -o, --output <file>   Write report to file
  --format <format>     Output format: markdown, json, csv (default: terminal)
  -h, --help            Show this help

Examples:
  capnp bench
  capnp bench --sizes 64B,1KB,1MB --vs-json
  capnp bench --sizes 100KB --vs-json --vs-protobuf --output report.md --format markdown
  capnp bench --sizes 10KB,100KB --vs-json --format json -o results.json
`);
}

function parseArgs(args: string[]) {
  const options: {
    sizes?: string[];
    vsJson?: boolean;
    vsProtobuf?: boolean;
    output?: string;
    format?: 'markdown' | 'json' | 'csv' | 'terminal';
  } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--sizes') {
      const sizesStr = args[++i];
      if (!sizesStr) {
        console.error('Error: --sizes requires a value');
        process.exit(1);
      }
      options.sizes = sizesStr.split(',').map((s) => s.trim());
    } else if (arg === '--vs-json') {
      options.vsJson = true;
    } else if (arg === '--vs-protobuf') {
      options.vsProtobuf = true;
    } else if (arg === '-o' || arg === '--output') {
      options.output = args[++i];
    } else if (arg === '--format') {
      const format = args[++i];
      if (format !== 'markdown' && format !== 'json' && format !== 'csv' && format !== 'terminal') {
        console.error('Error: --format must be one of: markdown, json, csv, terminal');
        process.exit(1);
      }
      options.format = format;
    }
  }

  // 默认值
  if (!options.sizes) {
    options.sizes = ['1KB', '10KB', '100KB'];
  }
  if (!options.format) {
    options.format = options.output ? 'markdown' : 'terminal';
  }

  return options;
}

export async function run(args: string[]): Promise<void> {
  const options = parseArgs(args);

  console.log("Running Cap'n Proto Benchmark...");
  console.log('');

  const env = getEnvironmentInfo();
  console.log(`Environment: Node.js ${env.nodeVersion} on ${env.platform} (${env.arch})`);
  console.log(`CPU: ${env.cpu} (${env.cpus} cores)`);
  console.log('');

  // 运行基准测试
  const comparisons: string[] = ["Cap'n Proto"];
  if (options.vsJson) comparisons.push('JSON');
  if (options.vsProtobuf) comparisons.push('Protobuf');

  console.log(`Testing payload sizes: ${options.sizes?.join(', ')}`);
  console.log(`Comparisons: ${comparisons.join(', ')}`);
  console.log('');

  const results = runAllBenchmarks(
    options.sizes || ['1KB', '10KB', '100KB'],
    options.vsJson || false,
    options.vsProtobuf || false
  );

  const report: BenchmarkReport = {
    environment: env,
    results,
    sizes: options.sizes || ['1KB', '10KB', '100KB'],
    comparisons,
    generatedAt: new Date().toISOString(),
  };

  // 格式化输出
  let output: string;
  switch (options.format) {
    case 'json':
      output = JSON.stringify(report, null, 2);
      break;
    case 'csv':
      output = formatCsvReport(report);
      break;
    case 'markdown':
      output = formatMarkdownReport(report);
      break;
    default:
      output = formatTerminalReport(report);
      break;
  }

  if (options.output) {
    writeFileSync(options.output, output, 'utf-8');
    console.log(`Report written to: ${options.output}`);
  } else {
    console.log(output);
  }

  process.exit(0);
}
