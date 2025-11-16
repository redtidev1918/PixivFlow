import { Router } from 'express';
import * as basicHandlers from './handlers/download-basic-handlers';
import * as incompleteHandlers from './handlers/download-incomplete-handlers';
import * as batchHandlers from './handlers/download-batch-handlers';
import * as urlHandlers from './handlers/download-url-handlers';

const router = Router();

// Download task management
router.post('/start', basicHandlers.startDownload);
router.post('/stop', basicHandlers.stopDownload);
router.get('/status', basicHandlers.getDownloadStatus);
router.get('/logs', basicHandlers.getDownloadLogs);
router.get('/history', basicHandlers.getDownloadHistory);

// Batch download operations
router.post('/run-all', batchHandlers.runAllDownloads);
router.post('/random', batchHandlers.randomDownload);

// URL download operations
router.post('/url', urlHandlers.downloadFromUrl);
router.post('/batch-url', urlHandlers.downloadFromBatchUrls);
router.post('/parse-url', urlHandlers.parseUrl);

// Incomplete tasks management
router.get('/incomplete', incompleteHandlers.getIncompleteTasks);
router.delete('/incomplete', incompleteHandlers.deleteAllIncompleteTasks);
router.delete('/incomplete/:id', incompleteHandlers.deleteIncompleteTask);
router.get('/incomplete/test', incompleteHandlers.testIncompleteTasks);
router.post('/resume', incompleteHandlers.resumeDownload);

export default router;
