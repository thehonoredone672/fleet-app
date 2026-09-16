const { Router } = require('express');
const reportController = require('../controllers/reportController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { reportQuerySchema, driverReportQuerySchema } = require('../validators/reportValidators');

const router = Router();

router.use(authenticate);
router.use(authorize('reports', 'read'));

router.get('/fleet', validate(reportQuerySchema, 'query'), reportController.fleet);
router.get('/fuel', validate(reportQuerySchema, 'query'), reportController.fuel);
router.get('/maintenance', validate(reportQuerySchema, 'query'), reportController.maintenance);
router.get('/drivers', validate(driverReportQuerySchema, 'query'), reportController.drivers);

module.exports = router;
