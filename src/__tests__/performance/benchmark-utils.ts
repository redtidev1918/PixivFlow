/**
 * Performance benchmarking utilities
 */

export interface BenchmarkResult {
  name: string;
  duration: number; // milliseconds
  iterations: number;
  average: number; // milliseconds per iteration
  min: number;
  max: number;
  memory?: {
    before: NodeJS.MemoryUsage;
    after: NodeJS.MemoryUsage;
    delta: NodeJS.MemoryUsage;
  };
}

export interface BenchmarkOptions {
  iterations?: number;
  warmup?: number;
  measureMemory?: boolean;
}

/**
 * Benchmark a function execution
 */
export async function benchmark<T>(
  name: string,
  fn: () => Promise<T> | T,
  options: BenchmarkOptions = {}
): Promise<BenchmarkResult> {
  const {
    iterations = 10,
    warmup = 2,
    measureMemory = false,
  } = options;

  // Warmup runs
  for (let i = 0; i < warmup; i++) {
    await fn();
  }

  // Force garbage collection if available
  if (global.gc && measureMemory) {
    global.gc();
  }

  const memoryBefore = measureMemory ? process.memoryUsage() : undefined;

  // Actual benchmark runs
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = global.performance.now();
    await fn();
    const end = global.performance.now();
    times.push(end - start);
  }

  const memoryAfter = measureMemory ? process.memoryUsage() : undefined;

  const duration = times.reduce((a, b) => a + b, 0);
  const average = duration / iterations;
  const min = Math.min(...times);
  const max = Math.max(...times);

  const result: BenchmarkResult = {
    name,
    duration,
    iterations,
    average,
    min,
    max,
  };

  if (measureMemory && memoryBefore && memoryAfter) {
    result.memory = {
      before: memoryBefore,
      after: memoryAfter,
      delta: {
        rss: memoryAfter.rss - memoryBefore.rss,
        heapTotal: memoryAfter.heapTotal - memoryBefore.heapTotal,
        heapUsed: memoryAfter.heapUsed - memoryBefore.heapUsed,
        external: memoryAfter.external - memoryBefore.external,
        arrayBuffers: memoryAfter.arrayBuffers - memoryBefore.arrayBuffers,
      },
    };
  }

  return result;
}

/**
 * Format benchmark result for display
 */
export function formatBenchmarkResult(result: BenchmarkResult): string {
  const lines = [
    `\n${result.name}`,
    `  Iterations: ${result.iterations}`,
    `  Total time: ${result.duration.toFixed(2)}ms`,
    `  Average: ${result.average.toFixed(2)}ms`,
    `  Min: ${result.min.toFixed(2)}ms`,
    `  Max: ${result.max.toFixed(2)}ms`,
  ];

  if (result.memory) {
    const { delta } = result.memory;
    lines.push(
      `  Memory delta:`,
      `    RSS: ${formatBytes(delta.rss)}`,
      `    Heap: ${formatBytes(delta.heapUsed)} (${formatBytes(delta.heapTotal)} total)`,
      `    External: ${formatBytes(delta.external)}`
    );
  }

  return lines.join('\n');
}

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Compare two benchmark results
 */
export function compareBenchmarks(
  baseline: BenchmarkResult,
  current: BenchmarkResult
): string {
  const speedup = baseline.average / current.average;
  const improvement = ((baseline.average - current.average) / baseline.average) * 100;

  const lines = [
    `\nComparison: ${baseline.name} vs ${current.name}`,
    `  Baseline: ${baseline.average.toFixed(2)}ms`,
    `  Current:  ${current.average.toFixed(2)}ms`,
    `  Speedup:  ${speedup.toFixed(2)}x`,
    `  Change:   ${improvement > 0 ? '+' : ''}${improvement.toFixed(2)}%`,
  ];

  return lines.join('\n');
}

/**
 * Run multiple benchmarks and return results
 */
export async function runBenchmarks(
  benchmarks: Array<{ name: string; fn: () => Promise<unknown> | unknown; options?: BenchmarkOptions }>
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  for (const bench of benchmarks) {
    const result = await benchmark(bench.name, bench.fn, bench.options);
    results.push(result);
    console.log(formatBenchmarkResult(result));
  }

  return results;
}

