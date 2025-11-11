/**
 * Performance benchmarks for database operations
 */

import { Database } from '../../storage/Database';
import { benchmark, formatBenchmarkResult } from './benchmark-utils';
import * as fs from 'fs';
import * as path from 'path';

describe('Database Performance Benchmarks', () => {
  let db: Database;
  let dbPath: string;

  beforeEach(() => {
    // Create a temporary database for benchmarking
    dbPath = path.join(__dirname, '../../../test-benchmark.db');
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    db = new Database(dbPath);
    db.migrate(); // Initialize database tables
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('should benchmark insertDownload performance', async () => {
    const result = await benchmark(
      'Insert Download Record',
      async () => {
        await db.recordDownload({
          pixivId: `test-${Date.now()}-${Math.random()}`,
          type: 'illustration',
          tag: 'test',
          filePath: '/test/path.jpg',
          title: 'Test Illustration',
        });
      },
      { iterations: 100, warmup: 5 }
    );

    console.log(formatBenchmarkResult(result));
    expect(result.average).toBeLessThan(10); // Should be very fast
  });

  it('should benchmark hasDownloaded performance', async () => {
    // Pre-populate with test data
    const testIds = Array.from({ length: 100 }, (_, i) => `test-${i}`);
    for (const id of testIds) {
      await db.recordDownload({
        pixivId: id,
        type: 'illustration',
        tag: 'test',
        filePath: `/test/${id}.jpg`,
        title: `Test ${id}`,
      });
    }

    const result = await benchmark(
      'Check Has Downloaded',
      async () => {
        await db.hasDownloaded('test-50', 'illustration');
      },
      { iterations: 1000, warmup: 10 }
    );

    console.log(formatBenchmarkResult(result));
    expect(result.average).toBeLessThan(5); // Should be very fast with index
  });

  it('should benchmark getDownloadedIds performance', async () => {
    // Pre-populate with test data
    const testIds = Array.from({ length: 1000 }, (_, i) => `test-${i}`);
    for (const id of testIds) {
      await db.recordDownload({
        pixivId: id,
        type: 'illustration',
        tag: 'test',
        filePath: `/test/${id}.jpg`,
        title: `Test ${id}`,
      });
    }

    const result = await benchmark(
      'Get Downloaded IDs (1000 records)',
      async () => {
        await db.getDownloadedIds(['test-50'], 'illustration');
      },
      { iterations: 50, warmup: 5 }
    );

    console.log(formatBenchmarkResult(result));
    expect(result.average).toBeLessThan(100); // Should be reasonably fast
  });

  it('should benchmark bulk insert performance', async () => {
    const result = await benchmark(
      'Bulk Insert (100 records)',
      async () => {
        const records = Array.from({ length: 100 }, (_, i) => ({
          pixivId: `bulk-${Date.now()}-${i}`,
          type: 'illustration' as const,
          tag: 'test',
          filePath: `/test/bulk-${i}.jpg`,
          title: `Bulk Test ${i}`,
        }));

        for (const record of records) {
          await db.recordDownload(record);
        }
      },
      { iterations: 10, warmup: 2 }
    );

    console.log(formatBenchmarkResult(result));
    expect(result.average).toBeLessThan(500); // Should handle bulk operations efficiently
  });
});

