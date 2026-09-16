const { Router } = require('express');
const fuelController = require('../controllers/fuelController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const {
  createFuelRecordSchema,
  updateFuelRecordSchema,
  listFuelQuerySchema,
  fuelSummaryQuerySchema,
} = require('../validators/fuelValidators');

const router = Router();

router.use(authenticate);

// Ownership-gated inside fuelService (must be a driver, submitting for
// their own actively-assigned vehicle) — not an `authorize` permission
// check, same pattern as location ingestion.
router.post('/', validate(createFuelRecordSchema), fuelController.create);

// Must be registered before '/:id' — a literal path segment, not a param.
// Admin-side aggregate view only — not ownership-accessible, so this one
// stays `authorize`-gated.
router.get('/summary', authorize('fuel', 'read'), validate(fuelSummaryQuerySchema, 'query'), fuelController.summary);

// Not `authorize`-gated — a driver reads their own records (ownership,
// checked in fuelService), an admin-tier role reads the org's (matrix,
// also checked in fuelService.list/getOne). Same pattern as documents.
router.get('/', validate(listFuelQuerySchema, 'query'), fuelController.list);
router.get('/:id', fuelController.getOne);
router.patch('/:id', authorize('fuel', 'update'), validate(updateFuelRecordSchema), fuelController.update);

module.exports = router;
