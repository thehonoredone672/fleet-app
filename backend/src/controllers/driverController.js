const asyncHandler = require('../utils/asyncHandler');
const driverService = require('../services/driverService');

const requestContext = (req) => ({ ipAddress: req.ip, userAgent: req.headers['user-agent'] });

const list = asyncHandler(async (req, res) => {
  const result = await driverService.list(req.user, req.query);
  res.status(200).json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const driver = await driverService.getOne(req.user, req.params.id);
  res.status(200).json({ success: true, data: { driver } });
});

const getMe = asyncHandler(async (req, res) => {
  const driver = await driverService.getByUserId(req.user.id);
  res.status(200).json({ success: true, data: { driver } });
});

const updateMe = asyncHandler(async (req, res) => {
  const driver = await driverService.updateOwnProfile(req.user.id, req.body);
  res.status(200).json({ success: true, data: { driver } });
});

const create = asyncHandler(async (req, res) => {
  const driver = await driverService.create(req.user, req.body, requestContext(req));
  res.status(201).json({ success: true, data: { driver } });
});

const update = asyncHandler(async (req, res) => {
  const driver = await driverService.update(req.user, req.params.id, req.body, requestContext(req));
  res.status(200).json({ success: true, data: { driver } });
});

const remove = asyncHandler(async (req, res) => {
  const driver = await driverService.deactivate(req.user, req.params.id, requestContext(req));
  res.status(200).json({ success: true, data: { driver } });
});

module.exports = { list, getOne, getMe, updateMe, create, update, remove };
