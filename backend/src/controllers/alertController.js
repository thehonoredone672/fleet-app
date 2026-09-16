const asyncHandler = require('../utils/asyncHandler');
const alertService = require('../services/alertService');

const requestContext = (req) => ({ ipAddress: req.ip, userAgent: req.headers['user-agent'] });

const list = asyncHandler(async (req, res) => {
  const result = await alertService.list(req.user, req.query);
  res.status(200).json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const alert = await alertService.getOne(req.user, req.params.id);
  res.status(200).json({ success: true, data: { alert } });
});

const resolve = asyncHandler(async (req, res) => {
  const alert = await alertService.resolve(req.user, req.params.id, requestContext(req));
  res.status(200).json({ success: true, data: { alert } });
});

module.exports = { list, getOne, resolve };
