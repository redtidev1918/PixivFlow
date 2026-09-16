import { Router } from 'express';
import { listSystemErrors, resolveSystemError } from './handlers/system-errors-handlers';

const router = Router();

router.get('/', listSystemErrors);
router.post('/:id/resolve', resolveSystemError);

export default router;
