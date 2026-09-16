const { Router } = require('express');
const notificationController = require('../controllers/notificationController');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const { listNotificationsQuerySchema } = require('../validators/notificationValidators');

const router = Router();

router.use(authenticate);

// Ownership-only, every route — there's no permission-matrix entry for
// "notifications" because there's nothing to gate by role: every user
// (any role) can only ever see/manage their own notifications, same as
// GET /users/me needing no `authorize` check.
router.get('/', validate(listNotificationsQuerySchema, 'query'), notificationController.list);
router.patch('/read-all', notificationController.markAllRead);
router.patch('/:id/read', notificationController.markRead);

module.exports = router;
