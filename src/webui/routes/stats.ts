import { Router } from 'express';
import * as statsHandlers from './handlers/stats-handlers';

const router = Router();

router.get('/overview', statsHandlers.getOverviewStats);
router.get('/downloads', statsHandlers.getDownloadStats);
router.get('/tags', statsHandlers.getTagStats);
router.get('/authors', statsHandlers.getAuthorStats);

export default router;

