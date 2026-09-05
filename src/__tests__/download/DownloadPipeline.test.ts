import { DownloadPipeline } from '../../download/pipeline/DownloadPipeline';

describe('DownloadPipeline', () => {
  it('runs an ordered backfill pool serially to stop exactly at the target limit', async () => {
    const executor = { run: jest.fn().mockResolvedValue([]) };
    const pipeline = new DownloadPipeline({
      config: { download: { concurrency: 3 } } as any,
      planner: {
        planDownloads: jest.fn().mockReturnValue({
          queue: [{ id: 1 }, { id: 2 }],
          mode: 'sequential',
          limit: 1,
          filteredOut: 0,
          availableCount: 2,
          alreadyDownloaded: 0,
        }),
      } as any,
      executor: executor as any,
      progressReporter: { update: jest.fn() } as any,
      recovery: { decide: jest.fn() } as any,
    });

    await pipeline.run([{ id: 1 }, { id: 2 }] as any, { type: 'illustration' }, 'illustration', jest.fn());

    expect(executor.run).toHaveBeenCalledWith(expect.objectContaining({ concurrency: 1 }));
  });
});
