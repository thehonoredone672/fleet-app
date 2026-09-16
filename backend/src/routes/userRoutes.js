const { Router } = require('express');
const userController = require('../controllers/userController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const {
  inviteUserSchema,
  updateUserSchema,
  updateProfileSchema,
  listUsersQuerySchema,
} = require('../validators/userValidators');
const { pushTokenSchema } = require('../validators/notificationValidators');

const router = Router();

router.use(authenticate);

router.get('/me', userController.getMe);
router.patch('/me', validate(updateProfileSchema), userController.updateMe);
router.patch('/me/push-token', validate(pushTokenSchema), userController.updatePushToken);

router.get('/', authorize('users', 'read'), validate(listUsersQuerySchema, 'query'), userController.list);
router.post('/', authorize('users', 'create'), validate(inviteUserSchema), userController.create);
router.get('/:id', authorize('users', 'read'), userController.getOne);
router.patch('/:id', authorize('users', 'update'), validate(updateUserSchema), userController.update);
router.delete('/:id', authorize('users', 'delete'), userController.remove);

module.exports = router;
