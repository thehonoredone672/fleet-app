const { Router } = require('express');
const assignmentController = require('../controllers/assignmentController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { createAssignmentSchema, listAssignmentsQuerySchema } = require('../validators/assignmentValidators');

const router = Router();

router.use(authenticate);

router.get('/', authorize('assignments', 'read'), validate(listAssignmentsQuerySchema, 'query'), assignmentController.list);
router.post('/', authorize('assignments', 'create'), validate(createAssignmentSchema), assignmentController.create);
router.get('/:id', authorize('assignments', 'read'), assignmentController.getOne);
router.patch('/:id/unassign', authorize('assignments', 'update'), assignmentController.unassign);

module.exports = router;
