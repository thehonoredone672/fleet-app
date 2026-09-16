const { Router } = require('express');
const maintenanceController = require('../controllers/maintenanceController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const {
  createMaintenanceSchema,
  updateMaintenanceSchema,
  listMaintenanceQuerySchema,
} = require('../validators/maintenanceValidators');

const router = Router();

router.use(authenticate);

router.get('/', authorize('maintenance', 'read'), validate(listMaintenanceQuerySchema, 'query'), maintenanceController.list);
router.post('/', authorize('maintenance', 'create'), validate(createMaintenanceSchema), maintenanceController.create);
router.get('/:id', authorize('maintenance', 'read'), maintenanceController.getOne);
router.patch('/:id', authorize('maintenance', 'update'), validate(updateMaintenanceSchema), maintenanceController.update);

module.exports = router;
