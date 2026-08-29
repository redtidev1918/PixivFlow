
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
export function createTopicPipeline(client: IPixivClient, databasePath: string | undefined, requestDelayMs = 500): TopicPipeline {
  const resolved = databasePath && isAbsolute(databasePath)
    ? databasePath
    : resolvePath(process.cwd(), databasePath ?? 'data/pixiv-downloader.db');
  const cache = new TopicCache(resolvePath(dirname(resolved), 'topic-cache'));
  const resolver = new TopicResolver(client as never, cache, requestDelayMs);
  return new TopicPipeline(client as never, resolver, requestDelayMs);
}

/** Lazily builds one shared pipeline per download run (cache + resolver). */
export function createTopicPipelineFactory(client: IPixivClient, databasePath: string | undefined, requestDelayMs = 500): TopicPipelineFactory {
  let instance: TopicPipeline | undefined;
  return () => {
    if (!instance) instance = createTopicPipeline(client, databasePath, requestDelayMs);
    return instance;
  };
}