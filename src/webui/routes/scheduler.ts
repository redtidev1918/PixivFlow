import { Router } from 'express';
import { listRecentSlots, recoverTarget, recoverStatus } from './handlers/scheduler-handlers';

const router = Router();

router.get('/', listRecentSlots);
router.post('/targets/:targetId/recover', recoverTarget);
router.get('/targets/:targetId/recover/:requestId', recoverStatus);

export default router;
