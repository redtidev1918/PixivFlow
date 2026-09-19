import { TargetConfig } from '../config';
import { logger } from '../logger';
import { IPixivClient } from '../interfaces/IPixivClient';
import { IDatabase } from '../interfaces/IDatabase';
import { FileMetadata, PixivMetadata } from './FileService';
import { IFileService } from '../interfaces/IFileService';
import { PixivNovel } from '@redtidev/pixiv-client';
import { dirname, join, basename } from 'node:path';
import { detectLanguage } from '../utils/language-detection';
import { DownloadedArtifact } from '../delivery/types';
import { buildMediaAsset, type MediaAsset } from '../domain/media/MediaAsset';
import { artifactId, type Artifact } from '../domain/media/Artifact';
import { extractNovelAssets, NovelAsset, renderNovelMarkdown } from './novelMarkers';
import { createZipArchive } from '../utils/zip';
import type { Database } from '../storage/Database';

const LANGUAGE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class NovelDownloader {
  constructor(
    private readonly client: IPixivClient,
    private readonly database: IDatabase,
    private readonly fileService: IFileService,
    private readonly metadataDb?: Database
  ) {}

  async download(novel: PixivNovel, tag: string, target: TargetConfig): Promise<DownloadedArtifact | undefined> {
    // Metadata cache: language filtering otherwise pulls FULL text per candidate
    // on every fallback run. A cached classification short-circuits to the same
    // skip decision without any Pixiv request (bounded detail/text fetch volume).
    if (target.languageFilter && this.metadataDb) {
      const cached = this.metadataDb?.metadata?.fresh?.(String(novel.id), 'novel', LANGUAGE_CACHE_TTL_MS);
      if (cached?.language) {
        const isChinese = cached.language.includes('Chinese') || cached.language.startsWith('zh');
        const wanted =
          (target.languageFilter === 'chinese' && isChinese) ||
          (target.languageFilter === 'non-chinese' && !isChinese);
        if (!wanted) {
          const reason = target.languageFilter === 'chinese' ? 'not Chinese' : 'is Chinese';
          logger.info(`Novel ${novel.id} language filter from cache (${cached.language}): ${reason}`, {
            novelId: novel.id, filter: target.languageFilter, cached: true,
          });
          throw new Error(
            `Novel ${novel.id} skipped: language filter mismatch (cached: ${cached.language}, required: ${target.languageFilter})`
          );
        }
        // Cached match: still need full text to deliver; fall through to fetch.
      }
    }

    const { novel: detail, tags } = await this.client.getNovelDetailWithTags(novel.id);
    // getNovelText resolves to the API envelope { novel_text }; unwrap it here,
    // otherwise the object gets stringified to "[object Object]" and the
    // delivered .txt contains only the header block (title/tags) and no body.
    const textResponse = await this.client.getNovelText(novel.id);
    const text = typeof textResponse === 'string'
      ? textResponse
      : (textResponse?.novel_text ?? '');

    if (!text || !text.trim()) {
      logger.warn(`Novel ${novel.id} text came back empty (all fallbacks); skipping so no body-less file is delivered`, {
        novelId: novel.id,
        title: detail.title,
      });
      return undefined;
    }

    const enableDetection = target.detectLanguage !== false;
    let detectedLang: ReturnType<typeof detectLanguage> = null;

    if (enableDetection) {
      const fullContent = `${detail.title}\n${text}`;
      detectedLang = await detectLanguage(fullContent);

      if (detectedLang) {
        logger.info(`Detected language for novel ${detail.id}: ${detectedLang.name} (${detectedLang.code})`, {
          novelId: detail.id,
          language: detectedLang.name,
          code: detectedLang.code,
          isChinese: detectedLang.isChinese,
        });
        this.metadataDb?.metadata?.put?.(String(detail.id), 'novel', {
          language: detectedLang.name,
          xRestrict: (detail as { x_restrict?: number }).x_restrict ?? (novel as { x_restrict?: number }).x_restrict ?? null,
          publishedAt: detail.create_date ?? novel.create_date ?? null,
          title: detail.title,
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
      if (target.strictLanguageFilter === true) {
        logger.info(`Skipping novel ${detail.id}: strict language filter could not classify the text`);
        throw new Error(
          `Novel ${detail.id} skipped: language filter inconclusive (required: ${target.languageFilter})`
        );
      }
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

    const assets = typeof textResponse === 'string'
      ? []
      : extractNovelAssets(text, textResponse as Parameters<typeof extractNovelAssets>[1]);
    const hadImages = assets.length > 0;
    const pendingAssets = assets.filter((a): a is NovelAsset & { url: string } => Boolean(a.url));
    if (pendingAssets.length) {
      const imagesDir = join(dirname(filePath), 'images');
      for (const asset of pendingAssets) {
        try {
          const buffer = await this.client.downloadImage(asset.url);
          asset.localPath = await this.fileService.saveBinary(buffer, novelAssetFileName(asset), imagesDir);
          asset.status = 'downloaded';
        } catch (error) {
          asset.status = 'failed';
          asset.failureReason = error instanceof Error ? error.message : String(error);
          logger.warn(`Failed to download novel inline image ${asset.sourceId} for novel ${detail.id}`, {
            novelId: detail.id,
            sourceId: asset.sourceId,
            reason: asset.failureReason,
          });
        }
      }
      if (hadImages) {
        logger.info(`Novel ${detail.id} inline images: ${assets.filter((a) => a.status === 'downloaded').length}/${assets.length} downloaded`, { novelId: detail.id });
      }
    }

    // Rich-media markdown sidecar (RFC 1 Phase 2): same path as the .txt
    // (compat format stays), inline images become relative ![](images/x.jpg)
    // refs so a later TelePress/TelePost phase can render the Telegraph page.
    let richMediaPath: string | undefined;
    if (assets.some((a) => a.status === 'downloaded')) {
      try {
        const mdPath = await this.fileService.saveText(
          `${header}\n${renderNovelMarkdown(text, assets)}`,
          fileName.replace(/\.txt$/, '.md'),
          metadata
        );
        richMediaPath = mdPath;
        logger.info(`Saved novel ${detail.id} rich-media markdown sidecar`, { filePath: mdPath });
      } catch (error) {
        logger.warn(
          `Failed to save rich-media markdown sidecar for novel ${detail.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

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
      ...(assets.length
        ? {
            assets: assets.map((a) => ({
              marker: a.marker,
              kind: a.kind,
              sourceId: a.sourceId,
              url: a.url,
              localPath: a.localPath,
              status: a.status,
              failureReason: a.failureReason,
            })),
          }
        : {}),
    };

    let metadataPath: string | undefined;
    try {
      metadataPath = await this.fileService.saveMetadata(filePath, pixivMetadata);
    } catch (error) {
      logger.warn(
        `Failed to save metadata for novel ${detail.id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Rich-media ZIP archive (Phase 3): a save-only download package carrying
    // txt + md + metadata + images. The md stays an internal render input, never
    // a user-facing attachment; txt remains the authoritative/compat file.
    let archivePath: string | undefined;
    if (assets.some((a) => a.status === 'downloaded')) {
      const zipName = this.fileService.sanitizeFileName(`${detail.id}_${detail.title}.zip`);
      const dest = join(dirname(filePath), zipName);
      const entries = [
        { name: fileName, sourcePath: filePath },
      ];
      if (richMediaPath) entries.push({ name: `${fileName.replace(/\.txt$/, '.md')}`, sourcePath: richMediaPath });
      if (metadataPath) entries.push({ name: `${fileName}.json`, sourcePath: metadataPath });
      for (const a of assets) {
        if (a.status === 'downloaded' && a.localPath) {
          entries.push({ name: `images/${basename(a.localPath)}`, sourcePath: a.localPath });
        }
      }
      try {
        archivePath = await createZipArchive(dest, entries);
        logger.info(`Saved novel ${detail.id} zip archive`, { filePath: archivePath });
      } catch (error) {
        logger.warn(`Failed to save zip archive for novel ${detail.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
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

    // Display download path to user
    const { displayDownloadPath } = await import('../utils/directory-info');
    displayDownloadPath(filePath, 'novel');

    logger.info(`Saved novel ${detail.id}`, {
      filePath,
      ...(detectedLang ? { language: detectedLang.name, isChinese: detectedLang.isChinese } : {}),
    });

    const workId = String(detail.id);
    const mediaAssets: MediaAsset[] = [];
    const artifacts: Artifact[] = [];
    if (filePath) {
      artifacts.push({ id: artifactId(workId, 'text', basename(filePath)), workId, variant: 'text', path: filePath });
    }
    if (richMediaPath) {
      artifacts.push({ id: artifactId(workId, 'markdown', basename(richMediaPath)), workId, variant: 'markdown', path: richMediaPath });
    }
    if (metadataPath) {
      artifacts.push({ id: artifactId(workId, 'metadata', basename(metadataPath)), workId, variant: 'metadata', path: metadataPath });
    }
    if (archivePath) {
      artifacts.push({ id: artifactId(workId, 'zip', basename(archivePath)), workId, variant: 'zip', path: archivePath });
    }
    for (const a of assets) {
      if (a.status !== 'downloaded' || !a.localPath || !a.url) continue;
      const imageArtifactId = artifactId(workId, 'original', basename(a.localPath));
      const mediaAsset = buildMediaAsset({
        workId,
        kind: a.kind,
        sourceId: a.sourceId,
        marker: a.marker,
        sourceUrl: a.url,
        artifactId: imageArtifactId,
      });
      mediaAssets.push(mediaAsset);
      artifacts.push({
        id: imageArtifactId,
        sourceAssetId: mediaAsset.id,
        workId,
        variant: 'original',
        path: a.localPath,
      });
    }

    return {
      pixivId: workId,
      type: 'novel',
      title: detail.title,
      tags: tags.map((item) => item.name).filter(Boolean),
      files: archivePath ? [filePath, archivePath] : [filePath],
      mediaAssets,
      artifacts,
      cleanupFiles: metadataPath ? [metadataPath] : [],
      spoiler: (detail.x_restrict ?? 0) > 0,
      xRestrict: detail.x_restrict,
      publishedAt: detail.create_date,
      bookmarkCount: detail.total_bookmarks ?? detail.bookmark_count,
      viewCount: detail.total_view ?? detail.view_count,
      language: detectedLang ? `${detectedLang.name} (${detectedLang.code})` : undefined,
    };
  }
}
function novelAssetFileName(asset: NovelAsset & { url: string }): string {
  let ext = '';
  try {
    const pathname = new URL(asset.url).pathname;
    const last = pathname.split('/').pop() || '';
    const dot = last.lastIndexOf('.');
    if (dot >= 0) ext = last.slice(dot);
  } catch {
    // fall through: no extension
  }
  return `${asset.sourceId}${ext}` || asset.sourceId;
}
