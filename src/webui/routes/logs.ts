import { Router } from 'express';
import * as logsHandlers from './handlers/logs-handlers';

const router = Router();

router.get('/', logsHandlers.getLogs);
router.delete('/', logsHandlers.clearLogs);

export default router;

