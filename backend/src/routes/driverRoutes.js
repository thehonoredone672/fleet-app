const { Router } = require('express');
const driverController = require('../controllers/driverController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const {
  createDriverSchema,
  updateDriverSchema,
  updateOwnDriverProfileSchema,
  listDriversQuerySchema,
} = require('../validators/driverValidators');

const router = Router();

router.use(authenticate);

// Self-service routes — available to the driver themselves regardless of
// the `drivers` permission grant (which governs viewing/managing *other*
// drivers), same pattern as GET/PATCH /users/me.
router.get('/me', driverController.getMe);
router.patch('/me', validate(updateOwnDriverProfileSchema), driverController.updateMe);

router.get('/', authorize('drivers', 'read'), validate(listDriversQuerySchema, 'query'), driverController.list);
router.post('/', authorize('drivers', 'create'), validate(createDriverSchema), driverController.create);
router.get('/:id', authorize('drivers', 'read'), driverController.getOne);
router.patch('/:id', authorize('drivers', 'update'), validate(updateDriverSchema), driverController.update);
router.delete('/:id', authorize('drivers', 'delete'), driverController.remove);

module.exports = router;
