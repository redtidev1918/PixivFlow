import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import type { CommandArgs, CommandContext, CommandResult } from './types';
import { Database } from '../storage/Database';
import { PixivAuth } from '../auth/PixivAuth';
import { createPixivFlowClient } from '../pixiv-client/createPixivFlowClient';
import type { IPixivClient } from '../interfaces/IPixivClient';
import { createTopicPipelineFactory } from '../topic/createTopicPipeline';
import { recallChannels, selectWalkedTags } from '../topic/TopicPipeline';
import { TopicResolver } from '../topic/TopicResolver';
import { TopicCache } from '../topic/TopicCache';
import type { RelatedTagMode, TopicContentType } from '../topic/types';
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

  private async withClient<T>(context: CommandContext, fn: (deps: { client: IPixivClient; database: Database }) => Promise<T>): Promise<T> {
    const database = new Database(context.config.storage!.databasePath!);
    try {
      database.migrate();
      const auth = new PixivAuth(context.config.pixiv, context.config.network!, database, context.configPath);
      const client = createPixivFlowClient(auth, context.config, database);
      return await fn({ client, database });
    } finally {
      database.close();
    }
  }

  private async resolve(context: CommandContext, args: CommandArgs, topic: string): Promise<CommandResult> {
    if (!topic) {
      console.error('\nUsage: pixivflow topic resolve <topic> [--type illustration|novel|all] [--refresh]\n');
      return this.failure('Missing topic for resolve');
    }
    const type = (String(args.options.type ?? 'all')) as 'all' | TopicContentType;
    const refresh = Boolean(args.options.refresh);
    const types: TopicContentType[] = type === 'all' ? ['illustration', 'novel'] : [type];

    return this.withClient(context, async ({ client, database }) => {
      const cache = new TopicCache(dirname(database.getDatabasePath()) + '/topic-cache');
      const discovery = context.config.targets?.find((target) => target.mode === 'topic')?.topicDiscovery ?? {};
      // §tag-provenance: the audit surface for "the original tag dominates and no
      // related tag outranks it". Each row exposes where the tag came from, its
      // semantic weight and whether the current tagRelations/relatedTags settings
      // would actually search it today (the `searched` column).
      const rows: Array<{
        contentType: TopicContentType;
        fromCache: boolean;
        degraded: boolean;
        tags: Array<{
          name: string;
          translatedName?: string;
          source: string;
          weight: number;
          score: number;
          seed: boolean;
          searched: boolean;
        }>;
      }> = [];
      const lines: string[] = [];
      for (const contentType of types) {
        const resolver = new TopicResolver(client as never, cache, context.config.download?.requestDelay ?? 500);
        const { space, fromCache, degraded } = await resolver.resolve(topic, contentType, { refresh });
        const walked = selectWalkedTags(space.tags, key(topic), discovery.tagRelations);
        const channels = new Set(recallChannels(walked, key(topic), relatedMode(discovery.relatedTags)).map((tag) => key(tag.name)));
        lines.push('');
        lines.push(`Topic: ${topic}  (${contentType})  ${fromCache ? (degraded ? '· stale cache' : '· cache') : '· fresh'}`);
        lines.push('Name'.padEnd(24) + 'Trans'.padEnd(16) + 'Source'.padEnd(28) + 'Weight'.padStart(7) + 'Score'.padStart(7) + 'Seed'.padStart(6) + 'Searched'.padStart(10));
        const tagRows: Array<{
          name: string;
          translatedName?: string;
          source: string;
          weight: number;
          score: number;
          seed: boolean;
          searched: boolean;
        }> = [];
        for (const tag of space.tags) {
          const source = tag.source ?? (tag.seed ? 'seed' : 'cooccurrence');
          const weight = tag.weight ?? tag.score;
          const searched = channels.has(key(tag.name));
          tagRows.push({ name: tag.name, translatedName: tag.translatedName, source, weight, score: tag.score, seed: tag.seed, searched });
          lines.push(
            tag.name.slice(0, 23).padEnd(24)
            + (tag.translatedName ?? '-').slice(0, 15).padEnd(16)
            + source.padEnd(28)
            + weight.toFixed(2).padStart(7)
            + tag.score.toFixed(2).padStart(7)
            + (tag.seed ? 'yes' : 'no').padStart(6)
            + (searched ? 'yes' : 'no').padStart(10)
          );
        }
        rows.push({ contentType, fromCache, degraded, tags: tagRows });
      }
      return this.success(lines.join('\n'), { topic, types: rows });
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
        console.log(`searchedTags=${(selection.searchedTags ?? []).join(', ')}`);
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
      '  Show the Pixiv-derived related tag space for a topic (cached), with each',
      '  tag\'s provenance (source), semantic weight, score and whether it is searched.',
      '',
      'topic test <topic> [--type all|illustration|novel] [--date YESTERDAY|YYYY-MM-DD] [--limit N] [--refresh]',
      '  Dry-run a daily selection: resolved tags, candidate counts, Top N (no downloads).',
    ].join('\n');
  }
}

/** Same normalization as the pipeline/resolver keys (trim + NFKC + lowercase). */
function key(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase();
}

/** Unknown modes fall back to the historical 'always', as in the pipeline. */
function relatedMode(value: unknown): RelatedTagMode {
  return value === 'when_seed_insufficient' || value === 'never' ? value : 'always';
}
