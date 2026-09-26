import { Router } from 'express';
import { getGateway, listGateways } from './handlers/gateway-handlers';
import { getPairing } from './handlers/pairing-handler';

const router = Router();

/**
 * Messaging Gateway projection.
 *
 * `/` and `/:name` render config truth plus the last stored observation.
 * `/:name/pairing` is a PASSTHROUGH to the gateway's own pairing endpoint: the
 * gateway owns pairing (QR generation, login state), PixivFlow only reads and
 * renders the answer. There is deliberately no write path — PixivFlow never
 * submits a code, never stores a session and never generates a QR itself.
 */
router.get('/', listGateways);
router.get('/:name/pairing', getPairing);
router.get('/:name', getGateway);

export default router;
