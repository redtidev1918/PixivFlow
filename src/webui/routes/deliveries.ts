import { Router } from 'express';
import { getDelivery, listDeliveries } from './handlers/delivery-handlers';

const router = Router();

/**
 * Delivery History projection.
 *
 * Read-only BY CONSTRUCTION: there is deliberately no retry/cancel route here.
 * An operator retry is a deliberate, audited act and belongs to the CLI
 * (`pixivflow delivery retry --yes`), which records an `actor=cli` event; the
 * WebUI only shows what the ledger already decided.
 */
router.get('/', listDeliveries);
router.get('/:id', getDelivery);

export default router;
