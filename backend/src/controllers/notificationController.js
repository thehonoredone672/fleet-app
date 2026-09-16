const asyncHandler = require('../utils/asyncHandler');
const notificationService = require('../services/notificationService');

const list = asyncHandler(async (req, res) => {
  const result = await notificationService.list(req.user, req.query);
  res.status(200).json({ success: true, data: result });
});

const markRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markRead(req.user, req.params.id);
  res.status(200).json({ success: true, data: { notification } });
});

const markAllRead = asyncHandler(async (req, res) => {
  const count = await notificationService.markAllRead(req.user);
  res.status(200).json({ success: true, data: { markedRead: count } });
});

module.exports = { list, markRead, markAllRead };
