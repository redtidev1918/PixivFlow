import { Router } from 'express';
import * as listHandlers from './handlers/files-list-handlers';
import * as operationsHandlers from './handlers/files-operations-handlers';

const router = Router();

// File list operations
router.get('/recent', listHandlers.getRecentFiles);
router.get('/list', listHandlers.listFiles);

// File operations
router.get('/preview', operationsHandlers.previewFile);
router.delete('/:id', operationsHandlers.deleteFile);
router.post('/normalize', operationsHandlers.normalizeFiles);

export default router;
