const { Router } = require('express');
const alertController = require('../controllers/alertController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { listAlertsQuerySchema } = require('../validators/alertValidators');

const router = Router();

router.use(authenticate);

router.get('/', authorize('alerts', 'read'), validate(listAlertsQuerySchema, 'query'), alertController.list);
router.get('/:id', authorize('alerts', 'read'), alertController.getOne);
router.patch('/:id/resolve', authorize('alerts', 'resolve'), alertController.resolve);

module.exports = router;
