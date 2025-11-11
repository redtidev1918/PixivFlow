import { TargetConfig } from '../config';
import { logger } from '../logger';
import { IPixivClient } from '../interfaces/IPixivClient';
import { IDatabase } from '../interfaces/IDatabase';
import { FileMetadata, PixivMetadata } from './FileService';
import { IFileService } from '../interfaces/IFileService';
import { PixivNovel } from '../pixiv/PixivClient';
import { detectLanguage } from '../utils/language-detection';

export class NovelDownloader {
  constructor(
    private readonly client: IPixivClient,
    private readonly database: IDatabase,
    private readonly fileService: IFileService
  ) {}

  async download(novel: PixivNovel, tag: string, target: TargetConfig): Promise<void> {
    const { novel: detail, tags } = await this.client.getNovelDetailWithTags(novel.id);
    const text = await this.client.getNovelText(novel.id);

    const enableDetection = target.detectLanguage !== false;
    let detectedLang: ReturnType<typeof detectLanguage> = null;

    if (enableDetection) {
      const fullContent = `${detail.title}\n${text}`;
      detectedLang = detectLanguage(fullContent);

      if (detectedLang) {
        logger.info(`Detected language for novel ${detail.id}: ${detectedLang.name} (${detectedLang.code})`, {
          novelId: detail.id,
          language: detectedLang.name,
          code: detectedLang.code,
          isChinese: detectedLang.isChinese,
        });
      } else {
        logger.debug(`Language detection inconclusive for novel ${detail.id} (text may be too short)`);
      }
    }

    if (target.languageFilter && detectedLang) {
      const shouldDownload =
        (target.languageFilter === 'chinese' && detectedLang.isChinese) ||
        (target.languageFilter === 'non-chinese' && !detectedLang.isChinese);

      if (!shouldDownload) {
        const filterReason = target.languageFilter === 'chinese' ? 'not Chinese' : 'is Chinese';
        logger.info(
          `Skipping novel ${detail.id} due to language filter (detected: ${detectedLang.name}, filter: ${target.languageFilter})`,
          {
            novelId: detail.id,
            detectedLanguage: detectedLang.name,
            filter: target.languageFilter,
            reason: filterReason,
          }
        );
        throw new Error(
          `Novel ${detail.id} skipped: language filter mismatch (detected: ${detectedLang.name}, required: ${target.languageFilter})`
        );
      }
    } else if (target.languageFilter && !detectedLang) {
      logger.debug(`Language filter is set but detection failed for novel ${detail.id}, downloading anyway`);
    }

    const tagsDisplay = tags
      .map((t: { name: string; translated_name?: string }) => {
        if (t.translated_name) {
          return `${t.name} (${t.translated_name})`;
        }
        return t.name;
      })
      .join(', ');

    const header = [
      `Title: ${detail.title}`,
      `Author: ${detail.user?.name ?? 'Unknown'}`,
      `Author ID: ${detail.user?.id ?? 'Unknown'}`,
      `Tags: ${tagsDisplay || 'None'}`,
      `Download Tag: ${tag}`,
      `Original URL: https://www.pixiv.net/novel/show.php?id=${detail.id}`,
      `Created: ${new Date(detail.create_date).toISOString()}`,
      ...(detectedLang ? [`Detected Language: ${detectedLang.name} (${detectedLang.code})`] : []),
      '',
      '---',
      '',
    ].join('\n');

    const content = `${header}\n${text}`;
    const fileName = this.fileService.sanitizeFileName(`${detail.id}_${detail.title}.txt`);

    const metadata: FileMetadata = {
      author: detail.user?.name,
      tag: tag,
      date: detail.create_date ? new Date(detail.create_date) : new Date(),
    };

    const filePath = await this.fileService.saveText(content, fileName, metadata);

    const pixivMetadata: PixivMetadata = {
      pixiv_id: detail.id,
      title: detail.title,
      author: {
        id: detail.user?.id || '',
        name: detail.user?.name || 'Unknown',
      },
      tags: tags,
      original_url: `https://www.pixiv.net/novel/show.php?id=${detail.id}`,
      create_date: detail.create_date,
      download_tag: tag,
      type: 'novel',
      total_bookmarks: detail.total_bookmarks,
      total_view: detail.total_view,
      bookmark_count: detail.bookmark_count,
      view_count: detail.view_count,
      ...(detectedLang
        ? {
            detected_language: {
              code: detectedLang.code,
              name: detectedLang.name,
              is_chinese: detectedLang.isChinese,
            },
          }
        : {}),
    };

    try {
      await this.fileService.saveMetadata(filePath, pixivMetadata);
    } catch (error) {
      logger.warn(
        `Failed to save metadata for novel ${detail.id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    this.database.insertDownload({
      pixivId: String(detail.id),
      type: 'novel',
      tag,
      title: detail.title,
      filePath,
      author: detail.user?.name,
      userId: detail.user?.id,
    });

    logger.info(`Saved novel ${detail.id}`, {
      filePath,
      ...(detectedLang ? { language: detectedLang.name, isChinese: detectedLang.isChinese } : {}),
    });
  }
}


