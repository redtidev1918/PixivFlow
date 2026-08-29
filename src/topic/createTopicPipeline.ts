
import { resolve as resolvePath, dirname, isAbsolute } from 'node:path';


import type { IPixivClient } from '../interfaces/IPixivClient';
import { TopicCache } from './TopicCache';
import { TopicPipeline } from './TopicPipeline';
import { TopicResolver } from './TopicResolver';

export type TopicPipelineFactory = () => TopicPipeline;

/**
 * Builds the topic pipeline with a persistent cache beside the SQLite database
 * (which lives on the data volume in Docker, so it survives container rebuilds).
 * One instance is shared across targets within a download run.
 */
type DbPathSource = string | { getDatabasePath(): string } | undefined;

function resolveDbPath(source: DbPathSource): string {
  const raw = typeof source === 'function'
    ? undefined
    : source && typeof source === 'object'
      ? source.getDatabasePath()
      : source;
  const absolute = raw && isAbsolute(raw) ? raw : resolvePath(process.cwd(), raw ?? 'data/pixiv-downloader.db');
  return absolute;
}

export function createTopicPipeline(client: IPixivClient, databasePath: DbPathSource, requestDelayMs = 500): TopicPipeline {
  const resolved = resolveDbPath(databasePath);
  const cache = new TopicCache(resolvePath(dirname(resolved), 'topic-cache'));
  const resolver = new TopicResolver(client as never, cache, requestDelayMs);
  return new TopicPipeline(client as never, resolver, requestDelayMs);
}

/** Lazily builds one shared pipeline per download run (cache + resolver). */
export function createTopicPipelineFactory(client: IPixivClient, databasePath: DbPathSource, requestDelayMs = 500): TopicPipelineFactory {
  let instance: TopicPipeline | undefined;
  return () => {
    if (!instance) instance = createTopicPipeline(client, databasePath, requestDelayMs);
    return instance;
  };
}