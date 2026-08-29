import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import type { CommandArgs, CommandContext, CommandResult } from './types';
import { Database } from '../storage/Database';
import { PixivAuth } from '../pixiv/AuthClient';
import { PixivClient } from '../pixiv/PixivClient';
import { createTopicPipeline, createTopicPipelineFactory } from '../topic/createTopicPipeline';
import { TopicResolver } from '../topic/TopicResolver';
import { TopicCache } from '../topic/TopicCache';
import type { TopicContentType } from '../topic/types';
import { dirname } from 'node:path';
import { getYesterdayDate, getTodayDate } from '../utils/pixiv-date-utils';

export class TopicCommand extends BaseCommand {
  readonly name = 'topic';
  readonly description = 'Resolve a semantic topic into related tags (resolve) or dry-run a day selection (test)';
  readonly aliases = ['topics'];
  readonly metadata = {
    category: CommandCategory.DOWNLOAD,
    requiresAuth: true,
    longRunning: false,
  };

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const subcommand = args.positional[0];
    const topic = args.positional.slice(1).join(' ').trim();
    try {
      if (subcommand === 'resolve') return await this.resolve(context, args, topic);
      if (subcommand === 'test') return await this.test(context, args, topic);
      console.error(`\nUnknown topic subcommand: ${subcommand ? `'${subcommand}'` : '(none)'}`);
      console.error(`\nUsage:\n${this.getUsage()}\n`);
      return this.failure(this.getUsage());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\n✗ ${message}\n`);
      return this.failure(message);
    }
  }

  private async withClient<T>(context: CommandContext, fn: (deps: { client: PixivClient; database: Database }) => Promise<T>): Promise<T> {
    const database = new Database(context.config.storage!.databasePath!);
    try {
      database.migrate();
      const auth = new PixivAuth(context.config.pixiv, context.config.network!, database, context.configPath);
      const client = new PixivClient(auth, context.config);
      return await fn({ client, database });
    } finally {
      database.close();
    }
  }

  private async resolve(context: CommandContext, _args: CommandArgs, topic: string): Promise<CommandResult> {
    if (!topic) {
      console.error('\nUsage: pixivflow topic resolve <topic> [--type illustration|novel|all] [--refresh]\n');
      return this.failure('Missing topic for resolve');
    }
    const type = (String(_args.options.type ?? 'all')) as 'all' | TopicContentType;
    const refresh = Boolean(_args.options.refresh);
    const types: TopicContentType[] = type === 'all' ? ['illustration', 'novel'] : [type];

    return this.withClient(context, async ({ client, database }) => {
      const cache = new TopicCache(dirname(database.getDatabasePath()) + '/topic-cache');
      for (const contentType of types) {
        const resolver = new TopicResolver(client as never, cache, context.config.download?.requestDelay ?? 500);
        const { space, fromCache, degraded } = await resolver.resolve(topic, contentType, { refresh });
        console.log(`\nTopic: ${topic}  (${contentType})  ${fromCache ? (degraded ? '· stale cache' : '· cache') : '· fresh'}`);
        console.log('Tag'.padEnd(28) + 'Score'.padStart(7) + 'Occ'.padStart(6) + 'Spec'.padStart(7));
        for (const tag of space.tags) {
          const name = (tag.name + (tag.translatedName ? ` / ${tag.translatedName}` : '')).slice(0, 27);
          console.log(name.padEnd(28) + tag.score.toFixed(2).padStart(7) + String(tag.occurrences).padStart(6) + tag.specificity.toFixed(2).padStart(7));
        }
      }
      return this.success('Topic resolved', { topic });
    });
  }

  private async test(context: CommandContext, args: CommandArgs, topic: string): Promise<CommandResult> {
    if (!topic) {
      console.error('\nUsage: pixivflow topic test <topic> [--type illustration|novel|all] [--date YESTERDAY|YYYY-MM-DD] [--limit N] [--refresh]\n');
      return this.failure('Missing topic for test');
    }
    const type = (String(args.options.type ?? 'all')) as 'all' | TopicContentType;
    const types: TopicContentType[] = type === 'all' ? ['illustration', 'novel'] : [type];
    const dateRaw = String(args.options.date ?? 'YESTERDAY');
    const day = dateRaw === 'TODAY' ? getTodayDate() : !dateRaw || dateRaw === 'YESTERDAY' ? getYesterdayDate() : dateRaw;
    const limit = Number(args.options.limit ?? 5);
    const refresh = Boolean(args.options.refresh);

    return this.withClient(context, async ({ client, database }) => {
      const factory = createTopicPipelineFactory(client, database, context.config.download?.requestDelay ?? 500);
      for (const contentType of types) {
        const target = { type: contentType, mode: 'topic' as const, topic, limit, topicDiscovery: { refresh } } as never;
        const pipeline = factory();
        const { works, selection } = await pipeline.selectWorks(target, contentType, day, limit, { refresh }, {});
        console.log(`\n=== ${contentType} topic "${topic}" day ${day} ===`);
        console.log(`resolvedTags=${selection.resolvedTagCount} raw=${selection.rawCount} deduped=${selection.dedupedCount} accepted=${selection.acceptedCount} selected=${works.length}`);
        selection.selected.forEach((c, i) => {
          console.log(`  #${i + 1} id=${c.id} pop=${c.popularity.toFixed(1)} meta=${c.metadataScore.toFixed(2)}  ${c.title}`);
        });
      }
      console.log('\n(dry-run: nothing downloaded)');
      return this.success('Topic dry-run completed', { topic, day });
    });
  }

  getUsage(): string {
    return [
      'topic resolve <topic> [--type all|illustration|novel] [--refresh]',
      '  Show the Pixiv-derived related tag space for a topic (cached).',
      '',
      'topic test <topic> [--type all|illustration|novel] [--date YESTERDAY|YYYY-MM-DD] [--limit N] [--refresh]',
      '  Dry-run a daily selection: resolved tags, candidate counts, Top N (no downloads).',
    ].join('\n');
  }
}
