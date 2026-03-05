/**
 * 全面性能基准测试套件
 * 支持多种 payload 大小、结构复杂度和列表类型
 */

import { MessageBuilder, MessageReader, StructBuilder, StructReader, ElementSize } from '../index.js';

// ============================================================================
// 类型定义
// ============================================================================

/** 基准测试结果 */
export interface BenchmarkResult {
  /** 测试名称 */
  name: string;
  /** payload 大小 (bytes) */
  payloadSize: number;
  /** 结构复杂度级别 */
  structComplexity: 'simple' | 'nested' | 'deep';
  /** 列表类型 */
  listType?: 'primitive' | 'struct' | 'none';
  /** 每秒操作数 */
  operationsPerSecond: number;
  /** 序列化吞吐量 (ops/sec) */
  serializeOpsPerSecond: number;
  /** 反序列化吞吐量 (ops/sec) */
  deserializeOpsPerSecond: number;
  /** 平均延迟 (μs) */
  avgLatency: number;
  /** P99 延迟 (μs) */
  p99Latency: number;
  /** 序列化平均延迟 (μs) */
  serializeAvgLatency: number;
  /** 反序列化平均延迟 (μs) */
  deserializeAvgLatency: number;
  /** 内存使用量 (bytes) */
  memoryUsed: number;
  /** GC 压力指标 (GC 次数/千次操作) */
  gcPressure: number;
  /** 数据大小 (bytes) */
  dataSize: number;
  /** 样本数 */
  samples: number;
}

/** 测试配置 */
export interface BenchmarkConfig {
  /** 预热迭代次数 */
  warmUpIterations: number;
  /** 每次测试运行次数 */
  runIterations: number;
  /** 采样次数（多次运行取平均） */
  sampleCount: number;
  /** 是否启用 GC 压力测量 */
  measureGCPressure: boolean;
  /** 是否启用内存测量 */
  measureMemory: boolean;
}

/** 默认配置 */
export const defaultConfig: BenchmarkConfig = {
  warmUpIterations: 1000,
  runIterations: 10000,
  sampleCount: 10,
  measureGCPressure: true,
  measureMemory: true,
};

// ============================================================================
// 高精度计时工具
// ============================================================================

/** 微秒级高精度计时 */
function nowUs(): number {
  return Number(process.hrtime.bigint()) / 1000;
}

/** 获取当前内存使用 */
function getMemoryUsage(): number {
  if (globalThis.gc) {
    globalThis.gc(); // 强制 GC 获得准确读数
  }
  return process.memoryUsage().heapUsed;
}

/** 获取 GC 统计信息 (Node.js v8 特性) */
function getGCStats(): { count: number; time: number } {
  // @ts-ignore - v8 特定 API
  if (globalThis.performance && performance.nodeTiming) {
    // @ts-ignore
    const timing = performance.nodeTiming;
    return {
      count: timing.gcCount || 0,
      time: timing.gcTime || 0,
    };
  }
  return { count: 0, time: 0 };
}

// ============================================================================
// 统计计算工具
// ============================================================================

/** 计算百分位数 */
function percentile(sortedArray: number[], p: number): number {
  if (sortedArray.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedArray.length) - 1;
  return sortedArray[Math.max(0, index)];
}

/** 计算平均值 */
function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** 计算标准差 */
function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = average(values);
  const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
  return Math.sqrt(variance);
}

// ============================================================================
// 测试数据生成器
// ============================================================================

/** 生成指定大小的随机字符串 */
function generateString(size: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < size; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/** Payload 大小定义 */
export const PAYLOAD_SIZES = {
  tiny: 64,      // 64B
  small: 1024,   // 1KB
  medium: 10240, // 10KB
  large: 102400, // 100KB
  huge: 1048576, // 1MB
} as const;

export type PayloadSize = keyof typeof PAYLOAD_SIZES;

// ============================================================================
// 测试场景定义
// ============================================================================

/** 简单结构：2 个 int32 */
function createSimpleStruct(builder: MessageBuilder): ArrayBuffer {
  const root = builder.initRoot(2, 0);
  root.setInt32(0, 42);
  root.setInt32(4, 100);
  return builder.toArrayBuffer();
}

function readSimpleStruct(reader: MessageReader): void {
  const root = reader.getRoot(2, 0);
  root.getInt32(0);
  root.getInt32(4);
}

/** 嵌套结构：2 层嵌套 */
function createNestedStruct(builder: MessageBuilder): ArrayBuffer {
  const root = builder.initRoot(1, 1);
  root.setInt32(0, 1);
  const child = root.initStruct(0, 1, 1);
  child.setInt32(0, 2);
  const grandchild = child.initStruct(0, 1, 0);
  grandchild.setInt32(0, 3);
  return builder.toArrayBuffer();
}

function readNestedStruct(reader: MessageReader): void {
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

/** 深层结构：5 层嵌套 */
function createDeepStruct(builder: MessageBuilder): ArrayBuffer {
  const root = builder.initRoot(1, 1);
  root.setInt32(0, 1);
  
  let current = root;
  for (let i = 0; i < 4; i++) {
    const next = current.initStruct(0, 1, 1);
    next.setInt32(0, i + 2);
    current = next;
  }
  return builder.toArrayBuffer();
}

function readDeepStruct(reader: MessageReader): void {
  const root = reader.getRoot(1, 1);
  root.getInt32(0);
  
  let current = root.getStruct(0, 1, 1);
  while (current) {
    current.getInt32(0);
    current = current.getStruct(0, 1, 1);
  }
}

/** 原始类型列表测试 */
function createPrimitiveList(builder: MessageBuilder, count: number): ArrayBuffer {
  const root = builder.initRoot(0, 1);
  const list = root.initList(0, 4, count);
  for (let i = 0; i < count; i++) {
    list.setPrimitive(i, i);
  }
  return builder.toArrayBuffer();
}

function readPrimitiveList(reader: MessageReader, count: number): void {
  const root = reader.getRoot(0, 1);
  const list = root.getList(0, 4);
  if (list) {
    for (let i = 0; i < count && i < list.length; i++) {
      list.getPrimitive(i);
    }
  }
}

/** 结构体列表测试 */
function createStructList(builder: MessageBuilder, count: number): ArrayBuffer {
  const root = builder.initRoot(0, 1);
  const list = root.initList(0, ElementSize.COMPOSITE, count, { dataWords: 2, pointerCount: 0 });
  for (let i = 0; i < count; i++) {
    const item = list.getStruct(i);
    item.setInt32(0, i);
    item.setInt32(4, i * 2);
  }
  return builder.toArrayBuffer();
}

function readStructList(reader: MessageReader, count: number): void {
  const root = reader.getRoot(0, 1);
  const list = root.getList(0, 4); // COMPOSITE 列表也是使用 getList
  if (list) {
    for (let i = 0; i < count && i < list.length; i++) {
      const item = list.getStruct(i);
      if (item) {
        item.getInt32(0);
        item.getInt32(4);
      }
    }
  }
}

/** 文本字段测试（用于测试不同 payload 大小） */
function createTextPayload(builder: MessageBuilder, textSize: number): ArrayBuffer {
  const text = generateString(textSize);
  const root = builder.initRoot(1, 1);
  root.setInt32(0, textSize);
  root.setText(0, text);
  return builder.toArrayBuffer();
}

function readTextPayload(reader: MessageReader): void {
  const root = reader.getRoot(1, 1);
  root.getInt32(0);
  root.getText(0);
}

// ============================================================================
// 核心基准测试引擎
// ============================================================================

/**
 * 运行单次基准测试
 * @returns 延迟样本数组
 */
function runSingleBenchmark(
  serialize: () => ArrayBuffer,
  deserialize: (buffer: ArrayBuffer) => void,
  config: BenchmarkConfig
): {
  serializeLatencies: number[];
  deserializeLatencies: number[];
  dataSize: number;
  gcCount: number;
  memoryDelta: number;
} {
  const serializeLatencies: number[] = [];
  const deserializeLatencies: number[] = [];
  
  // Warm-up 阶段
  for (let i = 0; i < config.warmUpIterations; i++) {
    const buffer = serialize();
    deserialize(buffer);
  }
  
  // 测量内存基线
  const memoryBefore = config.measureMemory ? getMemoryUsage() : 0;
  const gcBefore = config.measureGCPressure ? getGCStats() : { count: 0, time: 0 };
  
  // 运行测试
  const buffers: ArrayBuffer[] = [];
  
  // 序列化测试
  for (let i = 0; i < config.runIterations; i++) {
    const start = nowUs();
    const buffer = serialize();
    const end = nowUs();
    serializeLatencies.push(end - start);
    buffers.push(buffer);
  }
  
  // 反序列化测试
  for (let i = 0; i < config.runIterations; i++) {
    const start = nowUs();
    deserialize(buffers[i]);
    const end = nowUs();
    deserializeLatencies.push(end - start);
  }
  
  // 计算 GC 和内存
  const gcAfter = config.measureGCPressure ? getGCStats() : { count: 0, time: 0 };
  const memoryAfter = config.measureMemory ? getMemoryUsage() : 0;
  
  return {
    serializeLatencies,
    deserializeLatencies,
    dataSize: buffers[0]?.byteLength || 0,
    gcCount: gcAfter.count - gcBefore.count,
    memoryDelta: memoryAfter - memoryBefore,
  };
}

/**
 * 多次采样运行基准测试
 */
export function runBenchmark(
  name: string,
  serialize: () => ArrayBuffer,
  deserialize: (buffer: ArrayBuffer) => void,
  config: Partial<BenchmarkConfig> = {},
  metadata: {
    payloadSize?: number;
    structComplexity?: BenchmarkResult['structComplexity'];
    listType?: BenchmarkResult['listType'];
  } = {}
): BenchmarkResult {
  const fullConfig = { ...defaultConfig, ...config };
  
  // 多次采样
  const allSerializeLatencies: number[] = [];
  const allDeserializeLatencies: number[] = [];
  let totalGCCount = 0;
  let totalMemoryDelta = 0;
  let dataSize = 0;
  
  for (let s = 0; s < fullConfig.sampleCount; s++) {
    const result = runSingleBenchmark(serialize, deserialize, fullConfig);
    allSerializeLatencies.push(...result.serializeLatencies);
    allDeserializeLatencies.push(...result.deserializeLatencies);
    totalGCCount += result.gcCount;
    totalMemoryDelta += result.memoryDelta;
    dataSize = result.dataSize;
  }
  
  // 计算统计数据
  const sortedSerialize = [...allSerializeLatencies].sort((a, b) => a - b);
  const sortedDeserialize = [...allDeserializeLatencies].sort((a, b) => a - b);
  const allLatencies = [...allSerializeLatencies, ...allDeserializeLatencies].sort((a, b) => a - b);
  
  const serializeAvg = average(allSerializeLatencies);
  const deserializeAvg = average(allDeserializeLatencies);
  const totalAvg = serializeAvg + deserializeAvg;
  
  const serializeOps = 1000000 / serializeAvg;
  const deserializeOps = 1000000 / deserializeAvg;
  const totalOps = 1000000 / totalAvg;
  
  const totalIterations = fullConfig.runIterations * fullConfig.sampleCount;
  
  return {
    name,
    payloadSize: metadata.payloadSize || dataSize,
    structComplexity: metadata.structComplexity || 'simple',
    listType: metadata.listType || 'none',
    operationsPerSecond: totalOps,
    serializeOpsPerSecond: serializeOps,
    deserializeOpsPerSecond: deserializeOps,
    avgLatency: totalAvg,
    p99Latency: percentile(allLatencies, 99),
    serializeAvgLatency: serializeAvg,
    deserializeAvgLatency: deserializeAvg,
    memoryUsed: Math.max(0, totalMemoryDelta / fullConfig.sampleCount),
    gcPressure: totalGCCount / (totalIterations / 1000),
    dataSize,
    samples: totalIterations,
  };
}

// ============================================================================
// 预定义测试套件
// ============================================================================

/** 不同 payload 大小的测试 */
export function runPayloadSizeBenchmarks(
  config: Partial<BenchmarkConfig> = {}
): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];
  
  for (const [sizeName, size] of Object.entries(PAYLOAD_SIZES)) {
    // 文本 payload 测试
    results.push(
      runBenchmark(
        `文本 Payload (${sizeName}: ${size}B)`,
        () => {
          const builder = new MessageBuilder();
          return createTextPayload(builder, size);
        },
        (buffer) => readTextPayload(new MessageReader(buffer)),
        config,
        { payloadSize: size, structComplexity: 'simple' }
      )
    );
    
    // 原始列表 payload 测试
    const listCount = Math.floor(size / 4);
    results.push(
      runBenchmark(
        `原始列表 Payload (${sizeName}: ${listCount} 个 int32)`,
        () => {
          const builder = new MessageBuilder();
          return createPrimitiveList(builder, listCount);
        },
        (buffer) => readPrimitiveList(new MessageReader(buffer), listCount),
        config,
        { payloadSize: size, structComplexity: 'simple', listType: 'primitive' }
      )
    );
  }
  
  return results;
}

/** 不同结构复杂度的测试 */
export function runComplexityBenchmarks(
  config: Partial<BenchmarkConfig> = {}
): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];
  
  // 简单结构
  results.push(
    runBenchmark(
      '简单结构 (2 fields)',
      () => {
        const builder = new MessageBuilder();
        return createSimpleStruct(builder);
      },
      (buffer) => readSimpleStruct(new MessageReader(buffer)),
      config,
      { payloadSize: 16, structComplexity: 'simple' }
    )
  );
  
  // 嵌套结构
  results.push(
    runBenchmark(
      '嵌套结构 (3 levels)',
      () => {
        const builder = new MessageBuilder();
        return createNestedStruct(builder);
      },
      (buffer) => readNestedStruct(new MessageReader(buffer)),
      config,
      { payloadSize: 48, structComplexity: 'nested' }
    )
  );
  
  // 深层结构
  results.push(
    runBenchmark(
      '深层结构 (5 levels)',
      () => {
        const builder = new MessageBuilder();
        return createDeepStruct(builder);
      },
      (buffer) => readDeepStruct(new MessageReader(buffer)),
      config,
      { payloadSize: 80, structComplexity: 'deep' }
    )
  );
  
  return results;
}

/** 列表类型测试 */
export function runListTypeBenchmarks(
  config: Partial<BenchmarkConfig> = {}
): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];
  const counts = [10, 100, 1000, 10000];
  
  for (const count of counts) {
    // 原始类型列表
    results.push(
      runBenchmark(
        `原始类型列表 (${count} 个 int32)`,
        () => {
          const builder = new MessageBuilder();
          return createPrimitiveList(builder, count);
        },
        (buffer) => readPrimitiveList(new MessageReader(buffer), count),
        config,
        { payloadSize: count * 4, structComplexity: 'simple', listType: 'primitive' }
      )
    );
    
    // 结构体列表
    results.push(
      runBenchmark(
        `结构体列表 (${count} 个 struct)`,
        () => {
          const builder = new MessageBuilder();
          return createStructList(builder, count);
        },
        (buffer) => readStructList(new MessageReader(buffer), count),
        config,
        { payloadSize: count * 8, structComplexity: 'nested', listType: 'struct' }
      )
    );
  }
  
  return results;
}

// ============================================================================
// 结果格式化与输出
// ============================================================================

/** 格式化字节大小 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

/** 格式化数字（千分位） */
function formatNumber(num: number): string {
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** 打印基准测试结果 */
export function printBenchmarkResult(result: BenchmarkResult): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`测试: ${result.name}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Payload 大小:      ${formatBytes(result.payloadSize)}`);
  console.log(`  结构复杂度:        ${result.structComplexity}`);
  console.log(`  列表类型:          ${result.listType || 'N/A'}`);
  console.log(`  数据大小:          ${formatBytes(result.dataSize)}`);
  console.log(`  样本数:            ${formatNumber(result.samples)}`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  总吞吐量:          ${formatNumber(result.operationsPerSecond)} ops/sec`);
  console.log(`  序列化吞吐量:      ${formatNumber(result.serializeOpsPerSecond)} ops/sec`);
  console.log(`  反序列化吞吐量:    ${formatNumber(result.deserializeOpsPerSecond)} ops/sec`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  平均延迟:          ${formatNumber(result.avgLatency)} μs`);
  console.log(`  P99 延迟:          ${formatNumber(result.p99Latency)} μs`);
  console.log(`  序列化平均延迟:    ${formatNumber(result.serializeAvgLatency)} μs`);
  console.log(`  反序列化平均延迟:  ${formatNumber(result.deserializeAvgLatency)} μs`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  内存使用:          ${formatBytes(result.memoryUsed)}`);
  console.log(`  GC 压力:           ${formatNumber(result.gcPressure)} GC/1000 ops`);
}

/** 打印结果表格 */
export function printBenchmarkTable(results: BenchmarkResult[]): void {
  console.log('\n' + '='.repeat(120));
  console.log('基准测试结果汇总');
  console.log('='.repeat(120));
  console.log(
    `${'测试名称'.padEnd(30)} ${'Payload'.padEnd(10)} ${'复杂度'.padEnd(8)} ` +
    `${'吞吐量(ops/s)'.padEnd(15)} ${'平均延迟(μs)'.padEnd(12)} ${'P99延迟(μs)'.padEnd(12)} ` +
    `${'GC压力'.padEnd(10)}`
  );
  console.log('-'.repeat(120));
  
  for (const r of results) {
    console.log(
      `${r.name.slice(0, 29).padEnd(30)} ` +
      `${formatBytes(r.payloadSize).padEnd(10)} ` +
      `${r.structComplexity.padEnd(8)} ` +
      `${formatNumber(Math.round(r.operationsPerSecond)).padEnd(15)} ` +
      `${formatNumber(r.avgLatency).padEnd(12)} ` +
      `${formatNumber(r.p99Latency).padEnd(12)} ` +
      `${r.gcPressure.toFixed(2)}/1000`.padEnd(10)
    );
  }
  
  console.log('='.repeat(120));
}

/** 导出结果为 JSON */
export function exportResults(results: BenchmarkResult[]): string {
  return JSON.stringify(results, null, 2);
}

/** 导出结果为 CSV */
export function exportResultsCSV(results: BenchmarkResult[]): string {
  const headers = [
    'name', 'payloadSize', 'structComplexity', 'listType',
    'operationsPerSecond', 'serializeOpsPerSecond', 'deserializeOpsPerSecond',
    'avgLatency', 'p99Latency', 'serializeAvgLatency', 'deserializeAvgLatency',
    'memoryUsed', 'gcPressure', 'dataSize', 'samples'
  ];
  
  const rows = results.map(r => [
    r.name, r.payloadSize, r.structComplexity, r.listType || 'none',
    r.operationsPerSecond, r.serializeOpsPerSecond, r.deserializeOpsPerSecond,
    r.avgLatency, r.p99Latency, r.serializeAvgLatency, r.deserializeAvgLatency,
    r.memoryUsed, r.gcPressure, r.dataSize, r.samples
  ]);
  
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

// ============================================================================
// 主运行函数
// ============================================================================

/** 运行完整基准测试套件 */
export function runComprehensiveBenchmarks(
  config: Partial<BenchmarkConfig> = {}
): BenchmarkResult[] {
  console.log('\n' + '='.repeat(60));
  console.log("   Cap'n Proto 全面性能基准测试套件");
  console.log('='.repeat(60));
  console.log(`配置: 预热=${config.warmUpIterations ?? defaultConfig.warmUpIterations}次, ` +
              `运行=${config.runIterations ?? defaultConfig.runIterations}次, ` +
              `采样=${config.sampleCount ?? defaultConfig.sampleCount}次`);
  console.log('='.repeat(60));
  
  const allResults: BenchmarkResult[] = [];
  
  // 1. 结构复杂度测试
  console.log('\n📦 运行结构复杂度测试...');
  const complexityResults = runComplexityBenchmarks(config);
  complexityResults.forEach(printBenchmarkResult);
  allResults.push(...complexityResults);
  
  // 2. Payload 大小测试
  console.log('\n📊 运行 Payload 大小测试...');
  const payloadResults = runPayloadSizeBenchmarks(config);
  payloadResults.forEach(printBenchmarkResult);
  allResults.push(...payloadResults);
  
  // 3. 列表类型测试
  console.log('\n📋 运行列表类型测试...');
  const listResults = runListTypeBenchmarks(config);
  listResults.forEach(printBenchmarkResult);
  allResults.push(...listResults);
  
  // 汇总表格
  printBenchmarkTable(allResults);
  
  return allResults;
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  const quickConfig: Partial<BenchmarkConfig> = {
    warmUpIterations: 100,
    runIterations: 1000,
    sampleCount: 3,
  };
  
  runComprehensiveBenchmarks(quickConfig);
}
