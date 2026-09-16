const { Router } = require('express');
const dashboardController = require('../controllers/dashboardController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { reportQuerySchema } = require('../validators/reportValidators');

const router = Router();

router.use(authenticate);
router.get('/kpis', authorize('reports', 'read'), validate(reportQuerySchema, 'query'), dashboardController.kpis);

module.exports = router;
