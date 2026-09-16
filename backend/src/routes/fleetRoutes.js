const { Router } = require('express');
const fleetController = require('../controllers/fleetController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { liveSnapshotQuerySchema } = require('../validators/fleetValidators');

const router = Router();

router.use(authenticate);

// A read over vehicle data, so it rides the existing `vehicles:read`
// grant rather than inventing a separate "fleet" resource in the
// permission matrix for one endpoint.
router.get('/live', authorize('vehicles', 'read'), validate(liveSnapshotQuerySchema, 'query'), fleetController.live);

module.exports = router;
