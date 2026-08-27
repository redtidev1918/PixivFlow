import { Request, Response } from 'express';
import { logger } from '../../../logger';
import { downloadTaskManager } from '../../services/DownloadTaskManager';
import { ErrorCode } from '../../utils/error-codes';
import {
  parsePixivUrl,
  parsedUrlToTargetConfig,
  ParsedPixivUrl,
} from '../../../utils/pixiv-url-parser';

/**
 * Convert a shared-parser result into a target config plus a human label.
 * Delegates to the SAME parser used by the CLI (`pixivflow download --url`)
 * so WebUI and CLI accept an identical set of URL forms:
 *
 * artworks / en-artworks / i-short / member_illust legacy / novel show / 
 * novel series / users/{uid} / users/{uid}/artworks|novels/{id} / bare ID.
 */
function toTarget(parsed: ParsedPixivUrl) {
  return parsedUrlToTargetConfig(parsed);
}

function describeTarget(target: {
  type: 'illustration' | 'novel';
  illustId?: number;
  novelId?: number;
  seriesId?: number;
  userId?: string;
}): { workId?: string; workType: 'illustration' | 'novel'; label: string } {
  if (target.userId) {
    return {
      workId: target.userId,
      workType: target.type,
      label: `user ${target.userId} (${target.type} works)`,
    };
  }
  if (target.seriesId) {
    return {
      workType: 'novel',
      label: `novel series ${target.seriesId}`,
    };
  }
  const id = String(target.illustId ?? target.novelId ?? '');
  return { workId: id || undefined, workType: target.type, label: `${target.type} ${id}` };
}

/**
 * POST /api/download/url
 * Download from Pixiv URL or ID. Body: { url: string }
 */
export async function downloadFromUrl(req: Request, res: Response): Promise<void> {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      res.status(400).json({
        errorCode: ErrorCode.INVALID_REQUEST,
        message: 'URL is required',
      });
      return;
    }

    const parsed = parsePixivUrl(url);
    if (!parsed || (!parsed.id && !parsed.seriesId && !parsed.userId)) {
      res.status(400).json({
        errorCode: ErrorCode.INVALID_REQUEST,
        message:
          'Invalid Pixiv URL or ID. Supported formats include https://www.pixiv.net/artworks/123456, https://www.pixiv.net/novel/series/123456, https://www.pixiv.net/users/123456 or a bare ID such as 123456',
      });
      return;
    }

    if (downloadTaskManager.hasActiveTask()) {
      res.status(409).json({
        errorCode: ErrorCode.DOWNLOAD_TASK_ALREADY_RUNNING,
        message: 'Another download task is already running. Please wait for it to complete.',
      });
      return;
    }

    const taskId = `url_task_${Date.now()}`;
    const target = toTarget(parsed);
    const tempConfig = { targets: [target] };
    const info = describeTarget(target);

    downloadTaskManager.startTask(taskId, undefined, tempConfig).catch((error) => {
      logger.error('Background URL download task error', { error, taskId, url, parsed });
    });

    res.json({
      success: true,
      taskId,
      ...(info.workId ? { workId: info.workId } : {}),
      workType: info.workType,
      message: `Started downloading ${info.label}`,
      errorCode: ErrorCode.DOWNLOAD_START_SUCCESS,
    });
  } catch (error) {
    logger.error('Failed to start URL download', { error });
    res.status(500).json({
      errorCode: ErrorCode.DOWNLOAD_START_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * POST /api/download/batch-url
 * Download multiple URLs at once. Body: { urls: string[] }
 */
export async function downloadFromBatchUrls(req: Request, res: Response): Promise<void> {
  try {
    const { urls } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      res.status(400).json({
        errorCode: ErrorCode.INVALID_REQUEST,
        message: 'URLs array is required and must not be empty',
      });
      return;
    }

    const items = urls.map((url: unknown) => ({
      url: url as string,
      parsed:
        typeof url === 'string'
          ? parsePixivUrl(url)
          : null,
    }));
    const valid = items.filter(
      (item) => item.parsed && (item.parsed.id || item.parsed.seriesId || item.parsed.userId)
    );

    if (valid.length === 0) {
      res.status(400).json({
        errorCode: ErrorCode.INVALID_REQUEST,
        message: 'No valid Pixiv URLs found',
      });
      return;
    }

    if (downloadTaskManager.hasActiveTask()) {
      res.status(409).json({
        errorCode: ErrorCode.DOWNLOAD_TASK_ALREADY_RUNNING,
        message: 'Another download task is already running. Please wait for it to complete.',
      });
      return;
    }

    const taskId = `batch_url_task_${Date.now()}`;
    const targets = valid.map((item) => toTarget(item.parsed!));
    const tempConfig = { targets };

    downloadTaskManager.startTask(taskId, undefined, tempConfig).catch((error) => {
      logger.error('Background batch URL download task error', { error, taskId, urls });
    });

    res.json({
      success: true,
      taskId,
      totalUrls: urls.length,
      validUrls: valid.length,
      invalidUrls: urls.length - valid.length,
      targets: valid.map((item) => {
        const t = toTarget(item.parsed!);
        const info = describeTarget(t);
        return { url: item.url, workId: info.workId, workType: info.workType };
      }),
      message: `Started downloading ${valid.length} works`,
      errorCode: ErrorCode.DOWNLOAD_START_SUCCESS,
    });
  } catch (error) {
    logger.error('Failed to start batch URL download', { error });
    res.status(500).json({
      errorCode: ErrorCode.DOWNLOAD_START_FAILED,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * POST /api/download/parse-url
 * Parse Pixiv URL without downloading (for preview). Body: { url: string }
 */
export async function parseUrl(req: Request, res: Response): Promise<void> {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      res.status(200).json({
        data: {
          success: false,
          errorCode: ErrorCode.INVALID_REQUEST,
          message: 'URL is required',
        },
      });
      return;
    }

    const parsed = parsePixivUrl(url);
    if (!parsed || (!parsed.id && !parsed.seriesId && !parsed.userId)) {
      res.status(200).json({
        data: {
          success: false,
          errorCode: ErrorCode.INVALID_REQUEST,
          message:
            'Invalid Pixiv URL or ID. Supported formats:\n' +
            '- https://www.pixiv.net/artworks/123456\n' +
            '- https://www.pixiv.net/en/artworks/123456\n' +
            '- https://www.pixiv.net/member_illust.php?illust_id=123456\n' +
            '- https://www.pixiv.net/i/123456\n' +
            '- https://www.pixiv.net/novel/show.php?id=123456\n' +
            '- https://www.pixiv.net/novel/series/123456\n' +
            '- https://www.pixiv.net/users/123456\n' +
            '- Direct ID: 123456',
        },
      });
      return;
    }

    let target;
    try {
      target = toTarget(parsed);
    } catch (error) {
      target = undefined;
      logger.warn('Parsed URL could not be converted to a target', { url, error });
    }
    const info = target ? describeTarget(target) : undefined;

    res.status(200).json({
      data: {
        success: true,
        type: parsed.type,
        ...(info?.workId ? { workId: info.workId } : {}),
        workType: info?.workType,
        identifier: info?.label,
        originalUrl: url,
      },
    });
  } catch (error) {
    logger.error('Failed to parse URL', { error });
    res.status(200).json({
      data: {
        success: false,
        errorCode: ErrorCode.INVALID_REQUEST,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
