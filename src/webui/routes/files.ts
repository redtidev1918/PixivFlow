import { Router, Request, Response } from 'express';
import { readdirSync, statSync, existsSync, unlinkSync, readFileSync } from 'fs';
import { join, extname, basename, resolve } from 'path';
import { loadConfig, getConfigPath } from '../../config';
import { logger } from '../../logger';
import { Database } from '../../storage/Database';
import { FileService } from '../../download/FileService';
import { FileNormalizationService } from '../../download/FileNormalizationService';
import { ErrorCode } from '../utils/error-codes';

const router = Router();

/**
 * GET /api/files/list
 * List files in download directory
 */
router.get('/list', async (req: Request, res: Response) => {
  try {
    const { path: dirPath = '', type = 'illustration', sort = 'name', order = 'asc' } = req.query;
    const configPath = getConfigPath();
    const config = loadConfig(configPath);

    const baseDir =
      type === 'novel'
        ? config.storage!.novelDirectory!
        : config.storage!.illustrationDirectory!;

    const fullPath = dirPath ? join(baseDir, String(dirPath)) : baseDir;

    // Security: Ensure path is within base directory
    if (!fullPath.startsWith(baseDir)) {
      return res.status(400).json({ errorCode: ErrorCode.FILE_PATH_INVALID });
    }

    if (!existsSync(fullPath)) {
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
        files.push({
          name: item,
          path: dirPath ? `${dirPath}/${item}` : item,
          type: 'file',
          size: stats.size,
          modified: stats.mtime.toISOString(),
          extension: extname(item),
        });
      }
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
        const timeA = new Date(a.modified).getTime();
        const timeB = new Date(b.modified).getTime();
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

    res.json({
      files,
      directories,
      currentPath: dirPath || '/',
    });
  } catch (error) {
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
      success: true,
      result,
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

