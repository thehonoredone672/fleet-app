const { Router } = require('express');
const documentController = require('../controllers/documentController');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const {
  uploadCredentialsSchema,
  createDocumentSchema,
  updateDocumentSchema,
  listDocumentQuerySchema,
} = require('../validators/documentValidators');

const router = Router();

router.use(authenticate);

// None of these routes carry `authorize` middleware — a driver's
// ownership path (their own Driver record) and an admin's matrix path
// both need to reach the same handlers, so documentService branches on
// role internally. Same pattern as fuel/expenses.
router.post('/upload-credentials', validate(uploadCredentialsSchema), documentController.uploadCredentials);
router.post('/', validate(createDocumentSchema), documentController.create);
router.get('/', validate(listDocumentQuerySchema, 'query'), documentController.list);
router.get('/:id', documentController.getOne);
router.patch('/:id', validate(updateDocumentSchema), documentController.update);
router.delete('/:id', documentController.remove);

module.exports = router;
