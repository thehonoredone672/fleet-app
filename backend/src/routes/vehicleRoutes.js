const { Router } = require('express');
const vehicleController = require('../controllers/vehicleController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const {
  createVehicleSchema,
  updateVehicleSchema,
  listVehiclesQuerySchema,
} = require('../validators/vehicleValidators');

const router = Router();

router.use(authenticate);

// Ownership route — a driver's own assigned vehicle, independent of the
// `vehicles` permission grant (which a DRIVER doesn't hold). Same pattern
// as GET /drivers/me. Must be registered before the generic '/:id' route.
router.get('/me', vehicleController.getMe);

router.get('/', authorize('vehicles', 'read'), validate(listVehiclesQuerySchema, 'query'), vehicleController.list);
router.post('/', authorize('vehicles', 'create'), validate(createVehicleSchema), vehicleController.create);
router.get('/:id', authorize('vehicles', 'read'), vehicleController.getOne);
router.get('/:id/location', authorize('vehicles', 'read'), vehicleController.getLocation);
router.patch('/:id', authorize('vehicles', 'update'), validate(updateVehicleSchema), vehicleController.update);
router.delete('/:id', authorize('vehicles', 'delete'), vehicleController.remove);

module.exports = router;
