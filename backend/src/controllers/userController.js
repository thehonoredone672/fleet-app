const asyncHandler = require('../utils/asyncHandler');
const userService = require('../services/userService');

const requestContext = (req) => ({ ipAddress: req.ip, userAgent: req.headers['user-agent'] });

const getMe = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.user.id);
  res.status(200).json({ success: true, data: { user } });
});

const updateMe = asyncHandler(async (req, res) => {
  const user = await userService.updateOwnProfile(req.user.id, req.body);
  res.status(200).json({ success: true, data: { user } });
});

const updatePushToken = asyncHandler(async (req, res) => {
  await userService.updatePushToken(req.user.id, req.body.pushToken);
  res.status(200).json({ success: true, data: { message: 'Push token registered' } });
});

const list = asyncHandler(async (req, res) => {
  const result = await userService.list(req.user, req.query);
  res.status(200).json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const user = await userService.getOne(req.user, req.params.id);
  res.status(200).json({ success: true, data: { user } });
});

const create = asyncHandler(async (req, res) => {
  const user = await userService.create(req.user, req.body, requestContext(req));
  res.status(201).json({ success: true, data: { user } });
});

const update = asyncHandler(async (req, res) => {
  const user = await userService.update(req.user, req.params.id, req.body, requestContext(req));
  res.status(200).json({ success: true, data: { user } });
});

const remove = asyncHandler(async (req, res) => {
  const user = await userService.deactivate(req.user, req.params.id, requestContext(req));
  res.status(200).json({ success: true, data: { user } });
});

module.exports = { getMe, updateMe, updatePushToken, list, getOne, create, update, remove };
