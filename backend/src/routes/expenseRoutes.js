const { Router } = require('express');
const expenseController = require('../controllers/expenseController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { createExpenseSchema, updateExpenseSchema, listExpenseQuerySchema } = require('../validators/expenseValidators');

const router = Router();

router.use(authenticate);

// Not `authorize`-gated at the route level — a DRIVER can create an
// ownership-gated claim for their own vehicle, or an admin-tier role can
// create one directly; expenseService branches on which. Same pattern as
// fuel/location.
router.post('/', validate(createExpenseSchema), expenseController.create);

router.get('/', authorize('expenses', 'read'), validate(listExpenseQuerySchema, 'query'), expenseController.list);
router.get('/:id', authorize('expenses', 'read'), expenseController.getOne);
router.patch('/:id', authorize('expenses', 'update'), validate(updateExpenseSchema), expenseController.update);
router.patch('/:id/approve', authorize('expenses', 'approve'), expenseController.approve);
router.patch('/:id/reject', authorize('expenses', 'approve'), expenseController.reject);

module.exports = router;
