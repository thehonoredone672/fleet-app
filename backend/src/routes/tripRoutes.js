const { Router } = require('express');
const tripController = require('../controllers/tripController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const {
  createTripSchema,
  updateTripSchema,
  startTripSchema,
  endTripSchema,
  listTripsQuerySchema,
  listOwnTripsQuerySchema,
} = require('../validators/tripValidators');

const router = Router();

router.use(authenticate);

// Ownership route — a driver's own trips, independent of the `trips`
// permission grant (which a DRIVER doesn't hold). Must be registered
// before the generic '/:id' route.
router.get('/me', validate(listOwnTripsQuerySchema, 'query'), tripController.listMe);

router.get('/', authorize('trips', 'read'), validate(listTripsQuerySchema, 'query'), tripController.list);
router.post('/', authorize('trips', 'create'), validate(createTripSchema), tripController.create);
router.get('/:id', authorize('trips', 'read'), tripController.getOne);
router.patch('/:id', authorize('trips', 'update'), validate(updateTripSchema), tripController.update);
router.post('/:id/cancel', authorize('trips', 'update'), tripController.cancel);

// start/pause/resume/end are driver actions — ownership (or a dispatcher
// override role) is checked inside tripService, not via `authorize`.
router.post('/:id/start', validate(startTripSchema), tripController.start);
router.post('/:id/pause', tripController.pause);
router.post('/:id/resume', tripController.resume);
router.post('/:id/end', validate(endTripSchema), tripController.end);

module.exports = router;
