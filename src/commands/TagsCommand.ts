import { dirname, resolve } from 'node:path';

import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import type { CommandArgs, CommandContext, CommandResult } from './types';
import { Database } from '../storage/Database';
import { PixivAuth } from '../pixiv/AuthClient';
import { PixivClient } from '../pixiv/PixivClient';
import { TagDiscoveryService } from '../tags/TagDiscoveryService';
import { TagDiscoveryStore, TagDiscoveryCacheKey } from '../tags/TagDiscoveryStore';
import { TagPlanApplier } from '../tags/TagPlanApplier';
import type { TagDiscoveryContentType, TagDiscoveryManifest } from '../tags/types';

export class TagsCommand extends BaseCommand {
  readonly name = 'tags';
  readonly description = 'Discover related Pixiv tags, then explicitly apply selected tags';
  readonly aliases = ['tag'];
  readonly metadata = {
    category: CommandCategory.CONFIGURATION,
    requiresAuth: true,
    longRunning: false,
  };

  async execute(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const subcommand = args.positional[0];
    try {
      if (subcommand === 'discover') return await this.discover(context, args);
      if (subcommand === 'apply') return await this.apply(context, args);
      console.error(`\nUnknown tags subcommand: ${subcommand ? `'${subcommand}'` : '(none)'}`);
      console.error(`\nUsage:\n${this.getUsage()}\n`);
      return this.failure(this.getUsage());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\n✗ ${message}\n`);
      return this.failure(message);
    }
  }

  private async discover(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const seed = args.positional.slice(1).join(' ').trim();
    if (!seed) {
      console.error('\nUsage: pixivflow tags discover <seed> [options]\n');
      return this.failure('Missing seed tag for discovery');
    }

    const contentTypes = this.parseContentTypes(args.options.type);
    const sampleSize = this.integerOption(args.options.sample, 60, 'sample');
    const limit = this.integerOption(args.options.limit, 20, 'limit');
    const cacheDays = this.numberOption(args.options['cache-days'], 7, 'cache-days');
    const ttlMs = Math.round(cacheDays * 24 * 60 * 60_000);
    const cacheKey: TagDiscoveryCacheKey = { seed, contentTypes, sampleSize, limit };
    const store = this.createStore(context);

    if (!this.booleanOption(args.options.refresh)) {
      const cached = await store.loadFresh(cacheKey);
      if (cached) {
        this.printManifest(cached.manifest, cached.path, true, this.booleanOption(args.options.json));
        return this.success('Fresh tag discovery cache reused', cached);
      }
    }

    const database = new Database(context.config.storage!.databasePath!);
    try {
      database.migrate();
      const auth = new PixivAuth(
        context.config.pixiv,
        context.config.network!,
        database,
        context.configPath
      );
      const client = new PixivClient(auth, context.config);
      const service = new TagDiscoveryService(client);
      const manifest = await service.discover(seed, {
        contentTypes,
        sampleSize,
        limit,
        ttlMs,
      });
      const path = await store.save(cacheKey, manifest);
      this.printManifest(manifest, path, false, this.booleanOption(args.options.json));
      return this.success('Tag discovery completed', { manifest, path, cached: false });
    } finally {
      database.close();
    }
  }

  private async apply(context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    const manifestPath = args.positional[1];
    const targetId = this.stringOption(args.options.target);
    const selected = this.stringOption(args.options.select)
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean) ?? [];
    const mode = this.stringOption(args.options.mode) ?? 'append';

    if (!manifestPath || !targetId || selected.length === 0) {
      console.error('\nUsage: pixivflow tags apply <manifest.json> --target <id> --select <tag1,tag2> [--mode append|replace]\n');
      return this.failure('apply requires a manifest path, --target and --select');
    }
    if (mode !== 'append' && mode !== 'replace') {
      console.error('\n--mode must be append or replace\n');
      return this.failure('--mode must be append or replace');
    }

    const store = this.createStore(context);
    const manifest = await store.read(resolve(manifestPath));
    const result = await new TagPlanApplier().apply(context.configPath, manifest, {
      targetId,
      selectedTags: selected,
      mode,
    });

    console.log(`\n✓ Target ${result.targetId} updated atomically`);
    console.log(`  Previous: ${result.previousTag ?? '(empty)'}`);
    console.log(`  Current:  ${result.tag}`);
    console.log(`  Backup:   ${result.backupPath}`);
    console.log('  Scheduler: the config watcher will hot-reload this validated snapshot\n');
    return this.success('Selected tags applied and ready for hot reload', result);
  }

  private createStore(context: CommandContext): TagDiscoveryStore {
    const databasePath = resolve(context.config.storage!.databasePath!);
    return new TagDiscoveryStore(resolve(dirname(databasePath), 'tag-discovery'));
  }

  private parseContentTypes(value: string | boolean | undefined): TagDiscoveryContentType[] {
    const type = this.stringOption(value) ?? 'all';
    if (type === 'all') return ['illustration', 'novel'];
    if (type === 'illustration' || type === 'novel') return [type];
    throw new Error('--type must be all, illustration or novel');
  }

  private printManifest(manifest: TagDiscoveryManifest, path: string, cached: boolean, json: boolean): void {
    if (json) {
      console.log(JSON.stringify({ cached, path, ...manifest }, null, 2));
      return;
    }
    console.log(`\nTag suggestions for: ${manifest.seed}${cached ? ' (cache)' : ''}`);
    console.log(`Sampled: ${manifest.sampledWorks.illustration} illustrations, ${manifest.sampledWorks.novel} novels`);
    console.log('');
    manifest.candidates.forEach((candidate, index) => {
      const translation = candidate.translatedName ? ` / ${candidate.translatedName}` : '';
      const occurrences = candidate.occurrences.illustration + candidate.occurrences.novel;
      console.log(`${String(index + 1).padStart(2)}. ${candidate.name}${translation}  score=${candidate.score.toFixed(4)}  works=${occurrences}  source=${candidate.sources.join('+')}`);
    });
    console.log(`\nManifest: ${path}`);
    console.log(`Apply selected candidates only:`);
    console.log(`  pixivflow tags apply "${path}" --target <target-id> --select "tag1,tag2"\n`);
  }

  private integerOption(value: string | boolean | undefined, fallback: number, name: string): number {
    const number = this.numberOption(value, fallback, name);
    if (!Number.isInteger(number)) throw new Error(`--${name} must be an integer`);
    return number;
  }

  private numberOption(value: string | boolean | undefined, fallback: number, name: string): number {
    if (value === undefined) return fallback;
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`--${name} must be a number`);
    return number;
  }

  private stringOption(value: string | boolean | undefined): string | undefined {
    return typeof value === 'string' ? value.trim() : undefined;
  }

  private booleanOption(value: string | boolean | undefined): boolean {
    return value === true || (typeof value === 'string' && ['true', '1', 'yes'].includes(value.toLowerCase()));
  }

  getUsage(): string {
    return `tags discover <seed> [options]
  --type all|illustration|novel  Content to sample (default: all)
  --sample <1-200>              Maximum works sampled per type (default: 60)
  --limit <1-100>               Candidate count (default: 20)
  --cache-days <days>           Cache lifetime (default: 7)
  --refresh                     Ignore a fresh cache
  --json                        Machine-readable output

tags apply <manifest.json> --target <id> --select <tag1,tag2> [options]
  --mode append|replace         Keep the current seed or replace it (default: append)

Discovery never changes active plans. Apply accepts only names from the saved
manifest, validates the complete config, writes a backup, then atomically
replaces the config so a running scheduler can hot-reload it.`;
  }
}
