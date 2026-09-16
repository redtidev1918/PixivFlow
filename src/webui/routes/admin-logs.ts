import { Router } from 'express';
import { getAdminLogs, downloadLogs } from './handlers/admin-logs-handlers';

const router = Router();

router.get('/', getAdminLogs);
router.get('/download', downloadLogs);

export default router;
