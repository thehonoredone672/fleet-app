const { Router } = require('express');
const locationController = require('../controllers/locationController');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const { ingestLocationSchema } = require('../validators/locationValidators');

const router = Router();

// Ownership-gated inside locationService (must be a driver, submitting
// for their own actively-assigned vehicle) — not a `authorize` permission
// check, same pattern as the trip driver actions.
router.post('/', authenticate, validate(ingestLocationSchema), locationController.ingest);

module.exports = router;
