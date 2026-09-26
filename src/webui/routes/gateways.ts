import { Router } from 'express';
import { listGateways, getGateway } from './handlers/gateway-handlers';

const router = Router();

// Read-only Messaging Gateway projection. There is deliberately no
// `POST /api/gateways/:name/test` and no pairing write path here: probing an
// external gateway is an operator action (`pixivflow gateway test`) so the
// server never becomes a second control plane.
router.get('/', listGateways);
router.get('/:name', getGateway);

export default router;
