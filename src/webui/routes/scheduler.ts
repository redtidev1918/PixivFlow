import { Router } from 'express';
import { listRecentSlots, listExecutions, getSlotLogs, recoverTarget, recoverStatus } from './handlers/scheduler-handlers';

const router = Router();

router.get('/', listRecentSlots);
router.get('/executions', listExecutions);
router.get('/slots/:slotId/logs', getSlotLogs);
router.post('/targets/:targetId/recover', recoverTarget);
router.get('/targets/:targetId/recover/:requestId', recoverStatus);

export default router;
