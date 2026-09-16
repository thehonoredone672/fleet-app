const asyncHandler = require('../utils/asyncHandler');
const maintenanceService = require('../services/maintenanceService');

const requestContext = (req) => ({ ipAddress: req.ip, userAgent: req.headers['user-agent'] });

const list = asyncHandler(async (req, res) => {
  const result = await maintenanceService.list(req.user, req.query);
  res.status(200).json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const record = await maintenanceService.getOne(req.user, req.params.id);
  res.status(200).json({ success: true, data: { maintenance: record } });
});

const create = asyncHandler(async (req, res) => {
  const record = await maintenanceService.create(req.user, req.body, requestContext(req));
  res.status(201).json({ success: true, data: { maintenance: record } });
});

const update = asyncHandler(async (req, res) => {
  const record = await maintenanceService.update(req.user, req.params.id, req.body, requestContext(req));
  res.status(200).json({ success: true, data: { maintenance: record } });
});

module.exports = { list, getOne, create, update };
