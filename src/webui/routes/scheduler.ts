import { Router } from 'express';
import { listRecentSlots } from './handlers/scheduler-handlers';

const router = Router();

router.get('/', listRecentSlots);

export default router;
