import { resolve } from 'node:path';
import { BaseCommand } from './Command';
import { CommandCategory } from './metadata';
import { CommandArgs, CommandContext, CommandResult } from './types';
import { exportSavedNovel, NovelExportOptions, validateNovelExport } from '../download/novel-export/NovelExportService';

export function novelExportArgs(args: CommandArgs): NovelExportOptions {
  const formats = String(args.options.formats ?? 'epub').split(',').map(s => s.trim()) as NovelExportOptions['formats'];
  const options: NovelExportOptions = { formats, mergeSeries: args.options['merge-series'] === true,
    pdf: { ...(typeof args.options.browser === 'string' ? { browserPath: resolve(args.options.browser) } : {}),
      ...(typeof args.options.font === 'string' ? { fontPath: resolve(args.options.font) } : {}) } };
  validateNovelExport(options);
  return options;
}

export class NovelExportCommand extends BaseCommand {
  readonly name = 'novel-export';
  readonly description = 'Export saved novel metadata or series manifest to Markdown/EPUB/PDF offline';
  readonly requiresToken = false;
  readonly metadata = { category: CommandCategory.DOWNLOAD, requiresAuth: false, rendersResult: true, longRunning: true };
  async execute(_context: CommandContext, args: CommandArgs): Promise<CommandResult> {
    try {
      const input = args.options.input;
      if (typeof input !== 'string') return this.failure('Provide --input <novel.txt.json|novel.txt|series-ID.series.json>');
      const result = await exportSavedNovel(input, novelExportArgs(args), typeof args.options.output === 'string' ? args.options.output : undefined, typeof args.options.metadata === 'string' ? args.options.metadata : undefined);
      const message = [
        ...result.artifacts.map(a => `${a.variant === 'markdown-export' ? 'MD' : a.variant.toUpperCase()}: ${a.path}`),
        ...(result.warnings ?? []).map(w => `warning: ${w}`),
        ...result.errors.map(e => `${e.format}: ${e.message}`),
      ].join('\n');
      return result.errors.length ? this.failure(message, result) : this.success(message || 'TXT retained; no export format requested', result);
    } catch (error) { return this.failure(error instanceof Error ? error : String(error)); }
  }
  getUsage(): string { return 'novel-export --input <novel.txt.novel.json|novel.txt|series-ID.series.json> [--metadata legacy-metadata.json] [--formats md,epub,pdf] [--output path-without-extension] [--browser executable] [--font CJK-font.otf] [--json]'; }
}
