import { Router, Request, Response } from 'express';
import { readdirSync, statSync, existsSync, unlinkSync, readFileSync } from 'fs';
import { join, extname, basename, resolve, relative, dirname, isAbsolute } from 'path';
import { loadConfig, getConfigPath } from '../../config';
import { logger } from '../../logger';
import { Database } from '../../storage/Database';
import { FileService } from '../../download/FileService';
import { FileNormalizationService } from '../../download/FileNormalizationService';
import { ErrorCode } from '../utils/error-codes';

const router = Router();

/**
 * GET /api/files/recent
 * Get recently downloaded files from database
 * Query parameters:
 *   - limit: number of records to return (default: 50)
 *   - type: 'illustration' | 'novel' (optional)
 *   - filter: 'today' | 'yesterday' | 'last7days' | 'last30days' (optional)
 */
router.get('/recent', async (req: Request, res: Response) => {
  let database: Database | null = null;
  try {
    const { limit = '50', type, filter } = req.query;
    const configPath = getConfigPath();
    const config = loadConfig(configPath);

    if (!config.storage?.databasePath) {
      return res.status(400).json({ 
        errorCode: ErrorCode.CONFIG_INVALID,
        error: 'Database path not configured' 
      });
    }

    database = new Database(config.storage.databasePath);
    database.migrate();

    let downloads: Array<{
      pixivId: string;
      type: 'illustration' | 'novel';
      tag: string;
      title: string;
      filePath: string;
      author: string | null;
      userId: string | null;
      downloadedAt: string;
    }>;

    // Handle date filters
    if (filter) {
      const now = new Date();
      let startDate: string;
      let endDate: string | undefined;

      switch (filter) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
          break;
        case 'yesterday':
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()).toISOString();
          endDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999).toISOString();
          break;
        case 'last7days':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
          break;
        case 'last30days':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
          break;
        default:
          return res.status(400).json({ 
            errorCode: ErrorCode.FILE_PATH_INVALID,
            error: `Invalid filter: ${filter}. Valid values: today, yesterday, last7days, last30days` 
          });
      }

      downloads = database.getDownloadsByDateRange(
        startDate,
        endDate,
        type as 'illustration' | 'novel' | undefined
      );

      // Apply limit after date filtering
      if (downloads.length > Number(limit)) {
        downloads = downloads.slice(0, Number(limit));
      }
    } else {
      downloads = database.getRecentDownloads(
        Number(limit),
        type as 'illustration' | 'novel' | undefined
      );
    }

    // Check if files still exist and get file info
    const result = downloads.map(download => {
      const filePath = download.filePath;
      const exists = existsSync(filePath);
      
      let fileInfo: any = {
        pixivId: download.pixivId,
        type: download.type,
        tag: download.tag,
        title: download.title,
        filePath: download.filePath,
        author: download.author,
        userId: download.userId,
        downloadedAt: download.downloadedAt,
        exists,
      };

      if (exists) {
        try {
          const stats = statSync(filePath);
          fileInfo.size = stats.size;
          fileInfo.modified = stats.mtime.toISOString();
          fileInfo.name = basename(filePath);
          fileInfo.extension = extname(filePath);
          
          // Calculate relative path from base directory
          const baseDir = download.type === 'novel'
            ? config.storage!.novelDirectory!
            : config.storage!.illustrationDirectory!;
          
          try {
            fileInfo.relativePath = relative(baseDir, filePath);
          } catch {
            fileInfo.relativePath = filePath;
          }
        } catch (error) {
          logger.warn(`Failed to get file stats for ${filePath}`, { error });
        }
      }

      return fileInfo;
    });

    res.json({ 
      files: result,
      total: result.length,
      filter: filter || null,
      type: type || null,
    });
  } catch (error) {
    logger.error('Failed to get recent downloads', { error });
    res.status(500).json({ 
      errorCode: ErrorCode.FILE_READ_FAILED,
      error: error instanceof Error ? error.message : 'Failed to get recent downloads' 
    });
  } finally {
    if (database) {
      // Database connection is managed internally, no need to close
    }
  }
});

/**
 * GET /api/files/list
 * List files in download directory
 */
router.get('/list', async (req: Request, res: Response) => {
  let database: Database | null = null;
  try {
    const { path: dirPath = '', type = 'illustration', sort = 'name', order = 'asc' } = req.query;
    const configPath = getConfigPath();
    const config = loadConfig(configPath);

    // Ensure storage configuration exists
    if (!config.storage) {
      logger.error('Storage configuration is missing', { configPath });
      return res.status(500).json({ 
        errorCode: ErrorCode.FILE_READ_FAILED,
        error: 'Storage configuration is missing' 
      });
    }

    let baseDir =
      type === 'novel'
        ? config.storage.novelDirectory
        : config.storage.illustrationDirectory;

    if (!baseDir) {
      logger.error('Base directory is not configured', { type, storage: config.storage });
      return res.status(500).json({ 
        errorCode: ErrorCode.FILE_READ_FAILED,
        error: `Base directory for ${type} is not configured` 
      });
    }

    const fullPath = dirPath ? join(baseDir, String(dirPath)) : baseDir;

    logger.info('Listing files', { 
      type, 
      baseDir, 
      dirPath, 
      fullPath, 
      exists: existsSync(fullPath),
      itemsCount: existsSync(fullPath) ? readdirSync(fullPath).length : 0
    });

    // Security: Ensure path is within base directory
    if (!fullPath.startsWith(baseDir)) {
      logger.warn('Path traversal attempt detected', { baseDir, fullPath });
      return res.status(400).json({ errorCode: ErrorCode.FILE_PATH_INVALID });
    }

    if (!existsSync(fullPath)) {
      logger.warn('Directory does not exist', { fullPath, baseDir, type });
      return res.json({ files: [], directories: [] });
    }

    const items = readdirSync(fullPath);
    const files: any[] = [];
    const directories: any[] = [];

    for (const item of items) {
      const itemPath = join(fullPath, item);
      const stats = statSync(itemPath);

      if (stats.isDirectory()) {
        directories.push({
          name: item,
          path: dirPath ? `${dirPath}/${item}` : item,
          type: 'directory',
          modified: stats.mtime.toISOString(),
        });
      } else {
        const relativePath = dirPath ? `${dirPath}/${item}` : item;
        const absolutePath = resolve(itemPath);
        files.push({
          name: item,
          path: relativePath,
          type: 'file',
          size: stats.size,
          modified: stats.mtime.toISOString(),
          extension: extname(item),
          absolutePath, // Store for database lookup
        });
      }
    }

    // Query database for download times
    let downloadTimesMap = new Map<string, string>();
    if (files.length > 0) {
      try {
        database = new Database(config.storage!.databasePath!);
        database.migrate();
        
        // Collect all possible path variations for database query
        // Database may store absolute paths, so we need to query with absolute paths
        const absolutePathsForQuery = files.map(f => f.absolutePath);
        downloadTimesMap = database.getDownloadTimesForPaths(
          absolutePathsForQuery,
          type as 'illustration' | 'novel'
        );
        
        // Also try relative paths (relative to baseDir) in case database stores relative paths
        // Convert absolute paths to relative paths from baseDir
        const relativePathsFromBase = files.map(f => {
          // Try to get relative path from baseDir
          try {
            return relative(baseDir, f.absolutePath);
          } catch {
            return f.path; // Fallback to the relative path we already have
          }
        });
        
        // Query with relative paths too
        const relativeDownloadTimes = database.getDownloadTimesForPaths(
          relativePathsFromBase,
          type as 'illustration' | 'novel'
        );
        
        // Merge results (absolute path matches take precedence)
        for (const [path, time] of relativeDownloadTimes.entries()) {
          if (!downloadTimesMap.has(path)) {
            downloadTimesMap.set(path, time);
          }
        }
      } catch (dbError) {
        logger.warn('Failed to query download times from database', { error: dbError });
        // Continue without download times if database query fails
      }
    }

    // Add download time to files
    for (const file of files) {
      // Try to find download time by absolute path first (most likely match)
      let downloadTime = downloadTimesMap.get(file.absolutePath);
      
      // If not found, try relative path from baseDir
      if (!downloadTime) {
        try {
          const relativeFromBase = relative(baseDir, file.absolutePath);
          downloadTime = downloadTimesMap.get(relativeFromBase);
        } catch {
          // Ignore if relative() fails
        }
      }
      
      // If still not found, try the relative path we're using in the API
      if (!downloadTime) {
        downloadTime = downloadTimesMap.get(file.path);
      }
      
      file.downloadedAt = downloadTime || null;
      // Remove absolutePath from response
      delete file.absolutePath;
    }

    // Sort directories and files based on sort parameter
    const sortBy = String(sort);
    const sortOrder = String(order).toLowerCase() === 'desc' ? -1 : 1;

    if (sortBy === 'time') {
      // Sort by modified time
      directories.sort((a, b) => {
        const timeA = new Date(a.modified).getTime();
        const timeB = new Date(b.modified).getTime();
        return (timeA - timeB) * sortOrder;
      });
      files.sort((a, b) => {
        // Prefer downloadedAt if available, fallback to modified
        const timeA = a.downloadedAt 
          ? new Date(a.downloadedAt).getTime() 
          : new Date(a.modified).getTime();
        const timeB = b.downloadedAt 
          ? new Date(b.downloadedAt).getTime() 
          : new Date(b.modified).getTime();
        return (timeA - timeB) * sortOrder;
      });
    } else if (sortBy === 'downloadTime' || sortBy === 'downloadedAt') {
      // Sort by download time (downloadedAt)
      directories.sort((a, b) => {
        const timeA = new Date(a.modified).getTime();
        const timeB = new Date(b.modified).getTime();
        return (timeA - timeB) * sortOrder;
      });
      files.sort((a, b) => {
        // Sort by downloadedAt, files without download time go to the end
        if (!a.downloadedAt && !b.downloadedAt) {
          return 0;
        }
        if (!a.downloadedAt) return 1 * sortOrder;
        if (!b.downloadedAt) return -1 * sortOrder;
        const timeA = new Date(a.downloadedAt).getTime();
        const timeB = new Date(b.downloadedAt).getTime();
        return (timeA - timeB) * sortOrder;
      });
    } else {
      // Sort by name (case-insensitive, default)
      directories.sort((a, b) => {
        const comparison = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        return comparison * sortOrder;
      });
      files.sort((a, b) => {
        const comparison = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        return comparison * sortOrder;
      });
    }

    // Close database connection
    if (database) {
      try {
        database.close();
      } catch (closeError) {
        // Ignore close errors
      }
      database = null;
    }

    res.json({
      data: {
        files,
        directories,
        currentPath: dirPath || '/',
      },
    });
  } catch (error) {
    // Close database connection on error
    if (database) {
      try {
        database.close();
      } catch (closeError) {
        // Ignore close errors
      }
    }
    logger.error('Failed to list files', { error });
    res.status(500).json({ errorCode: ErrorCode.FILE_LIST_FAILED });
  }
});

/**
 * GET /api/files/preview
 * Get file preview (for images and files)
 * Query params: path (file path), type (illustration|novel)
 */
router.get('/preview', async (req: Request, res: Response) => {
  try {
    const { path: filePath, type = 'illustration' } = req.query;
    
    if (!filePath) {
      return res.status(400).json({ errorCode: ErrorCode.FILE_PATH_REQUIRED });
    }

    const configPath = getConfigPath();
    const config = loadConfig(configPath);

    const baseDir =
      type === 'novel'
        ? config.storage!.novelDirectory!
        : config.storage!.illustrationDirectory!;

    // Handle both absolute paths (from database) and relative paths
    let fullPath: string;
    const filePathStr = String(filePath);
    if (filePathStr.startsWith('/')) {
      // Absolute path - use directly, but ensure it's within base directory
      fullPath = filePathStr;
    } else {
      // Relative path - join with base directory
      fullPath = join(baseDir, filePathStr);
    }

    // Security: Ensure path is within base directory
    const resolvedBaseDir = resolve(baseDir);
    const resolvedFullPath = resolve(fullPath);
    
    logger.info('Preview request', { 
      filePath: String(filePath),
      baseDir,
      resolvedBaseDir,
      fullPath,
      resolvedFullPath
    });
    
    if (!resolvedFullPath.startsWith(resolvedBaseDir)) {
      logger.error('Invalid path - security check failed', { 
        baseDir: resolvedBaseDir, 
        fullPath: resolvedFullPath 
      });
      return res.status(400).json({ errorCode: ErrorCode.FILE_PATH_INVALID });
    }

    if (!existsSync(resolvedFullPath)) {
      logger.error('File not found', { path: resolvedFullPath, baseDir: resolvedBaseDir });
      return res.status(404).json({ errorCode: ErrorCode.FILE_NOT_FOUND });
    }

    const stats = statSync(resolvedFullPath);
    if (stats.isDirectory()) {
      return res.status(400).json({ errorCode: ErrorCode.FILE_IS_DIRECTORY });
    }

    // Set appropriate headers
    const ext = extname(resolvedFullPath).toLowerCase();
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const textExtensions = ['.txt', '.md', '.text'];
    const isImage = imageExtensions.includes(ext);
    const isText = textExtensions.includes(ext);

    if (isImage) {
      // Map extensions to correct MIME types
      const mimeTypes: { [key: string]: string } = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
      };
      res.setHeader('Content-Type', mimeTypes[ext] || 'image/jpeg');
    } else if (isText) {
      const fileName = basename(resolvedFullPath);
      // Encode filename for Content-Disposition header to avoid invalid characters
      const encodedFileName = encodeURIComponent(fileName);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodedFileName}`);
    } else {
      const fileName = basename(resolvedFullPath);
      const encodedFileName = encodeURIComponent(fileName);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodedFileName}`);
    }

    // Send file content
    try {
      if (isText) {
        // For text files, read and send directly
        const fileContent = readFileSync(resolvedFullPath, 'utf-8');
        res.send(fileContent);
      } else if (isImage) {
        // For images, use sendFile
        res.sendFile(resolvedFullPath, (err) => {
          if (err) {
            logger.error('Failed to send image file', { error: err, path: resolvedFullPath });
            if (!res.headersSent) {
              res.status(500).json({ errorCode: ErrorCode.FILE_READ_FAILED });
            }
          }
        });
      } else {
        // For other files, try to read as text first, fallback to sendFile
        try {
          const fileContent = readFileSync(resolvedFullPath, 'utf-8');
          res.send(fileContent);
        } catch (readError) {
          res.sendFile(resolvedFullPath, (err) => {
            if (err) {
              logger.error('Failed to send file', { error: err, path: resolvedFullPath });
              if (!res.headersSent) {
                res.status(500).json({ errorCode: ErrorCode.FILE_READ_FAILED });
              }
            }
          });
        }
      }
    } catch (error) {
      logger.error('Failed to send file content', { 
        error, 
        path: resolvedFullPath,
        isText,
        isImage
      });
      if (!res.headersSent) {
        res.status(500).json({ errorCode: ErrorCode.FILE_PREVIEW_FAILED });
      }
    }
  } catch (error) {
    logger.error('Failed to get file preview', { error });
    if (!res.headersSent) {
      res.status(500).json({ errorCode: ErrorCode.FILE_PREVIEW_FAILED });
    }
  }
});

/**
 * DELETE /api/files/:id
 * Delete a file
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { path: filePath, type = 'illustration' } = req.query;
    const configPath = getConfigPath();
    const config = loadConfig(configPath);

    const baseDir =
      type === 'novel'
        ? config.storage!.novelDirectory!
        : config.storage!.illustrationDirectory!;

    const fullPath = filePath ? join(baseDir, String(filePath)) : join(baseDir, id);

    // Security: Ensure path is within base directory
    if (!fullPath.startsWith(baseDir)) {
      return res.status(400).json({ errorCode: ErrorCode.FILE_PATH_INVALID });
    }

    if (!existsSync(fullPath)) {
      return res.status(404).json({ errorCode: ErrorCode.FILE_NOT_FOUND });
    }

    unlinkSync(fullPath);

    res.json({
      success: true,
      errorCode: ErrorCode.FILE_DELETE_SUCCESS,
    });
  } catch (error) {
    logger.error('Failed to delete file', { error });
    res.status(500).json({ errorCode: ErrorCode.FILE_DELETE_FAILED });
  }
});

/**
 * POST /api/files/normalize
 * Normalize and reorganize downloaded files
 * Body: { dryRun?: boolean, normalizeNames?: boolean, reorganize?: boolean, updateDatabase?: boolean, type?: 'illustration' | 'novel' | 'all' }
 */
router.post('/normalize', async (req: Request, res: Response) => {
  let database: Database | null = null;
  try {
    const {
      dryRun = false,
      normalizeNames = true,
      reorganize = true,
      updateDatabase = true,
      type = 'all',
    } = req.body;

    const configPath = getConfigPath();
    const config = loadConfig(configPath);

    // Initialize database and file service
    database = new Database(config.storage!.databasePath!);
    database.migrate();

    const fileService = new FileService(config.storage!);
    const normalizationService = new FileNormalizationService(
      config.storage!,
      fileService,
      database
    );

    // Run normalization
    const result = await normalizationService.normalizeFiles({
      dryRun,
      normalizeNames,
      reorganize,
      updateDatabase,
      type: type as 'illustration' | 'novel' | 'all',
    });

    database.close();
    database = null;

    res.json({
      data: {
        success: true,
        result,
      },
    });
  } catch (error) {
    if (database) {
      try {
        database.close();
      } catch (closeError) {
        // Ignore close errors
      }
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to normalize files', { error: { message: errorMessage } });
    res.status(500).json({ errorCode: ErrorCode.FILE_NORMALIZE_FAILED, message: errorMessage });
  }
});

export default router;

