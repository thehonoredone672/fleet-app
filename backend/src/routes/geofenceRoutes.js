const { Router } = require('express');
const geofenceController = require('../controllers/geofenceController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const {
  createGeofenceSchema,
  updateGeofenceSchema,
  listGeofencesQuerySchema,
} = require('../validators/geofenceValidators');

const router = Router();

router.use(authenticate);

router.get('/', authorize('geofences', 'read'), validate(listGeofencesQuerySchema, 'query'), geofenceController.list);
router.post('/', authorize('geofences', 'create'), validate(createGeofenceSchema), geofenceController.create);
router.get('/:id', authorize('geofences', 'read'), geofenceController.getOne);
router.patch('/:id', authorize('geofences', 'update'), validate(updateGeofenceSchema), geofenceController.update);
router.delete('/:id', authorize('geofences', 'delete'), geofenceController.remove);

module.exports = router;
