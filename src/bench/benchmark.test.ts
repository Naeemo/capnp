/**
 * 性能基准测试
 * 运行: npx vitest run src/bench/benchmark.test.ts
 */

import { describe, it, expect } from 'vitest';
import { MessageReader, MessageBuilder } from '../index.js';

// 高精度计时（微秒）
function nowUs(): number {
  return Number(process.hrtime.bigint()) / 1000;
}

// 运行多次取平均
function benchmark(name: string, fn: () => void, iterations: number = 10000): { avgUs: number; opsPerSecond: number } {
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
  
  return { avgUs, opsPerSecond };
}

describe('Performance Benchmarks', () => {
  it('简单结构序列化', () => {
    const result = benchmark('简单结构序列化', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(2, 0);
      root.setInt32(0, 42);
      root.setInt32(4, 100);
      builder.toArrayBuffer();
    }, 50000);
    
    expect(result.avgUs).toBeLessThan(100); // 应该小于100μs
  });

  it('简单结构反序列化', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(2, 0);
    root.setInt32(0, 42);
    root.setInt32(4, 100);
    const buffer = builder.toArrayBuffer();
    
    const result = benchmark('简单结构反序列化', () => {
      const reader = new MessageReader(buffer);
      const r = reader.getRoot(2, 0);
      r.getInt32(0);
      r.getInt32(4);
    }, 50000);
    
    expect(result.avgUs).toBeLessThan(50); // 应该小于50μs
  });

  it('文本字段序列化', () => {
    const result = benchmark('文本字段序列化', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(1, 1);
      root.setInt32(0, 42);
      root.setText(0, 'Hello, Cap\'n Proto!');
      builder.toArrayBuffer();
    }, 20000);
    
    expect(result.avgUs).toBeLessThan(200);
  });

  it('文本字段反序列化', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(1, 1);
    root.setInt32(0, 42);
    root.setText(0, 'Hello, Cap\'n Proto!');
    const buffer = builder.toArrayBuffer();
    
    const result = benchmark('文本字段反序列化', () => {
      const reader = new MessageReader(buffer);
      const r = reader.getRoot(1, 1);
      r.getInt32(0);
      r.getText(0);
    }, 20000);
    
    expect(result.avgUs).toBeLessThan(100);
  });

  it('嵌套结构序列化', () => {
    const result = benchmark('嵌套结构序列化', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(1, 1);
      root.setInt32(0, 1);
      const child = root.initStruct(0, 1, 1);
      child.setInt32(0, 2);
      const grandchild = child.initStruct(0, 1, 0);
      grandchild.setInt32(0, 3);
      builder.toArrayBuffer();
    }, 20000);
    
    expect(result.avgUs).toBeLessThan(200);
  });

  it('嵌套结构反序列化', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(1, 1);
    root.setInt32(0, 1);
    const child = root.initStruct(0, 1, 1);
    child.setInt32(0, 2);
    const grandchild = child.initStruct(0, 1, 0);
    grandchild.setInt32(0, 3);
    const buffer = builder.toArrayBuffer();
    
    const result = benchmark('嵌套结构反序列化', () => {
      const reader = new MessageReader(buffer);
      const r = reader.getRoot(1, 1);
      r.getInt32(0);
      const c = r.getStruct(0, 1, 1);
      if (c) {
        c.getInt32(0);
        const g = c.getStruct(0, 1, 0);
        if (g) g.getInt32(0);
      }
    }, 20000);
    
    expect(result.avgUs).toBeLessThan(100);
  });

  it('小列表(100)序列化', () => {
    const result = benchmark('小列表(100)序列化', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);
      const list = root.initList(0, 4, 100);
      for (let i = 0; i < 100; i++) {
        list.setPrimitive(i, i);
      }
      builder.toArrayBuffer();
    }, 10000);
    
    expect(result.avgUs).toBeLessThan(500);
  });

  it('小列表(100)反序列化', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    const list = root.initList(0, 4, 100);
    for (let i = 0; i < 100; i++) {
      list.setPrimitive(i, i);
    }
    const buffer = builder.toArrayBuffer();
    
    const result = benchmark('小列表(100)反序列化', () => {
      const reader = new MessageReader(buffer);
      const r = reader.getRoot(0, 1);
      const l = r.getList(0, 4);
      if (l) {
        for (let i = 0; i < l.length; i++) {
          l.getPrimitive(i);
        }
      }
    }, 10000);
    
    expect(result.avgUs).toBeLessThan(200);
  });

  it('大列表(10000)序列化', () => {
    const result = benchmark('大列表(10000)序列化', () => {
      const builder = new MessageBuilder();
      const root = builder.initRoot(0, 1);
      const list = root.initList(0, 4, 10000);
      for (let i = 0; i < 10000; i++) {
        list.setPrimitive(i, i);
      }
      builder.toArrayBuffer();
    }, 1000);
    
    expect(result.avgUs).toBeLessThan(5000); // 5ms
  });

  it('大列表(10000)反序列化', () => {
    const builder = new MessageBuilder();
    const root = builder.initRoot(0, 1);
    const list = root.initList(0, 4, 10000);
    for (let i = 0; i < 10000; i++) {
      list.setPrimitive(i, i);
    }
    const buffer = builder.toArrayBuffer();
    
    const result = benchmark('大列表(10000)反序列化', () => {
      const reader = new MessageReader(buffer);
      const r = reader.getRoot(0, 1);
      const l = r.getList(0, 4);
      if (l) {
        for (let i = 0; i < l.length; i++) {
          l.getPrimitive(i);
        }
      }
    }, 1000);
    
    expect(result.avgUs).toBeLessThan(3000); // 3ms
  });
});
