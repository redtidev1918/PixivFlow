import { Request, Response } from 'express';
import { logger } from '../../../logger';
import { downloadTaskManager } from '../../services/DownloadTaskManager';
import { ErrorCode } from '../../utils/error-codes';

/**
 * Parse Pixiv URL to extract work ID and type
 * Supported formats:
 * - https://www.pixiv.net/artworks/123456
 * - https://www.pixiv.net/en/artworks/123456
 * - https://www.pixiv.net/member_illust.php?mode=medium&illust_id=123456
 * - https://www.pixiv.net/novel/show.php?id=123456
 * - https://pixiv.net/artworks/123456
 * - Direct ID: 123456
 */
function parsePixivUrl(url: string): { id: string; type: 'illustration' | 'novel' } | null {
  try {
    // If it's just a number, treat as illustration ID
    if (/^\d+$/.test(url.trim())) {
      return { id: url.trim(), type: 'illustration' };
    }

    // Try to parse as URL
    let urlObj: URL;
    try {
      urlObj = new URL(url);
    } catch {
      // If URL parsing fails, try adding https://
      urlObj = new URL(`https://${url}`);
    }

    // Check if it's a Pixiv domain
    if (!urlObj.hostname.includes('pixiv.net')) {
      return null;
    }

    // Extract ID from different URL formats
    const pathname = urlObj.pathname;
    const searchParams = urlObj.searchParams;

    // Format: /artworks/123456 or /en/artworks/123456
    const artworksMatch = pathname.match(/\/artworks\/(\d+)/);
    if (artworksMatch) {
      return { id: artworksMatch[1], type: 'illustration' };
    }

    // Format: /member_illust.php?illust_id=123456
    const illustId = searchParams.get('illust_id');
    if (illustId) {
      return { id: illustId, type: 'illustration' };
    }

    // Format: /novel/show.php?id=123456
    if (pathname.includes('/novel/')) {
      const novelId = searchParams.get('id');
      if (novelId) {
        return { id: novelId, type: 'novel' };
      }
    }

    return null;
  } catch (error) {
    logger.error('Failed to parse Pixiv URL', { url, error });
    return null;
  }
}

/**
 * POST /api/download/url
 * Download from Pixiv URL or ID
 * Body: { url: string }
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

    // Parse URL to extract work ID and type
    const parsed = parsePixivUrl(url);
    if (!parsed) {
      res.status(400).json({
        errorCode: ErrorCode.INVALID_REQUEST,
        message: 'Invalid Pixiv URL or ID. Supported formats: https://www.pixiv.net/artworks/123456 or just 123456',
      });
      return;
    }

    // Check if there's already an active task
    if (downloadTaskManager.hasActiveTask()) {
      res.status(409).json({
        errorCode: ErrorCode.DOWNLOAD_TASK_ALREADY_RUNNING,
        message: 'Another download task is already running. Please wait for it to complete.',
      });
      return;
    }

    const taskId = `url_task_${Date.now()}`;

    // Create a temporary config for this specific download
    const tempConfig = {
      targets: [
        parsed.type === 'illustration'
          ? {
              type: 'illustration' as const,
              illustId: parseInt(parsed.id, 10),
            }
          : {
              type: 'novel' as const,
              novelId: parseInt(parsed.id, 10),
            },
      ],
    };

    // Start task in background
    downloadTaskManager.startTask(taskId, undefined, tempConfig).catch((error) => {
      logger.error('Background URL download task error', { error, taskId, url, parsed });
    });

    res.json({
      success: true,
      taskId,
      workId: parsed.id,
      workType: parsed.type,
      message: `Started downloading ${parsed.type} ${parsed.id}`,
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
 * Download multiple URLs at once
 * Body: { urls: string[] }
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

    // Parse all URLs
    const parsed = urls
      .map((url) => ({ url, parsed: parsePixivUrl(url) }))
      .filter((item) => item.parsed !== null);

    if (parsed.length === 0) {
      res.status(400).json({
        errorCode: ErrorCode.INVALID_REQUEST,
        message: 'No valid Pixiv URLs found',
      });
      return;
    }

    // Check if there's already an active task
    if (downloadTaskManager.hasActiveTask()) {
      res.status(409).json({
        errorCode: ErrorCode.DOWNLOAD_TASK_ALREADY_RUNNING,
        message: 'Another download task is already running. Please wait for it to complete.',
      });
      return;
    }

    const taskId = `batch_url_task_${Date.now()}`;

    // Create targets for all parsed URLs
    const targets = parsed.map((item) => {
      const parsedItem = item.parsed!;
      return parsedItem.type === 'illustration'
        ? {
            type: 'illustration' as const,
            illustId: parseInt(parsedItem.id, 10),
          }
        : {
            type: 'novel' as const,
            novelId: parseInt(parsedItem.id, 10),
          };
    });

    const tempConfig = {
      targets,
    };

    // Start task in background
    downloadTaskManager.startTask(taskId, undefined, tempConfig).catch((error) => {
      logger.error('Background batch URL download task error', { error, taskId, urls });
    });

    res.json({
      success: true,
      taskId,
      totalUrls: urls.length,
      validUrls: parsed.length,
      invalidUrls: urls.length - parsed.length,
      targets: parsed.map((item) => ({
        url: item.url,
        workId: item.parsed!.id,
        workType: item.parsed!.type,
      })),
      message: `Started downloading ${parsed.length} works`,
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
 * Parse Pixiv URL without downloading (for preview)
 * Body: { url: string }
 */
export async function parseUrl(req: Request, res: Response): Promise<void> {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      // 返回 200 状态码，但 success: false，以便前端统一处理
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
    if (!parsed) {
      // 返回 200 状态码，但 success: false，以便前端统一处理
      res.status(200).json({
        data: {
          success: false,
          errorCode: ErrorCode.INVALID_REQUEST,
          message: 'Invalid Pixiv URL or ID. Supported formats: https://www.pixiv.net/artworks/123456 or just 123456',
        },
      });
      return;
    }

    res.status(200).json({
      data: {
        success: true,
        workId: parsed.id,
        workType: parsed.type,
        originalUrl: url,
      },
    });
  } catch (error) {
    logger.error('Failed to parse URL', { error });
    // 返回 200 状态码，但 success: false，以便前端统一处理
    res.status(200).json({
      data: {
        success: false,
        errorCode: ErrorCode.INVALID_REQUEST,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

