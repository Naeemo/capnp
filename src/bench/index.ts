/**
 * 基准测试套件入口
 * 
 * 使用示例:
 * ```ts
 * import { runComprehensiveBenchmarks, runPayloadSizeBenchmarks } from './bench/index.js';
 * 
 * // 运行完整基准测试套件
 * const results = runComprehensiveBenchmarks();
 * 
 * // 运行特定测试
 * const payloadResults = runPayloadSizeBenchmarks({
 *   warmUpIterations: 1000,
 *   runIterations: 10000,
 *   sampleCount: 10
 * });
 * ```
 */

// 全面基准测试
export {
  // 核心函数
  runBenchmark,
  runComprehensiveBenchmarks,
  runPayloadSizeBenchmarks,
  runComplexityBenchmarks,
  runListTypeBenchmarks,
  
  // 工具函数
  printBenchmarkResult,
  printBenchmarkTable,
  exportResults,
  exportResultsCSV,
  
  // 常量
  PAYLOAD_SIZES,
  defaultConfig,
  
  // 类型
  type BenchmarkResult,
  type BenchmarkConfig,
  type PayloadSize,
} from './comprehensive.js';

// 向后兼容：保留原有基准测试
export * from './benchmark.js';
export * from './comparison.js';
