import { Router } from 'express';
import * as listHandlers from './handlers/files-list-handlers';
import * as operationsHandlers from './handlers/files-operations-handlers';
import * as locationHandlers from './handlers/files-location-handlers';

const router = Router();

// File list operations
router.get('/recent', listHandlers.getRecentFiles);
router.get('/list', listHandlers.listFiles);

// File operations
router.get('/preview', operationsHandlers.previewFile);
router.delete('/:id', operationsHandlers.deleteFile);
router.post('/normalize', operationsHandlers.normalizeFiles);
// Answer where a downloaded file (or the download directory) is on disk.
// Showing it is the user's device's job, never this runtime's.
router.get('/location', locationHandlers.fileLocation);

export default router;
