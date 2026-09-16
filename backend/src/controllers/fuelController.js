const asyncHandler = require('../utils/asyncHandler');
const fuelService = require('../services/fuelService');

const requestContext = (req) => ({ ipAddress: req.ip, userAgent: req.headers['user-agent'] });

const create = asyncHandler(async (req, res) => {
  const record = await fuelService.create(req.user, req.body, requestContext(req));
  res.status(201).json({ success: true, data: { fuelRecord: record } });
});

const list = asyncHandler(async (req, res) => {
  const result = await fuelService.list(req.user, req.query);
  res.status(200).json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const record = await fuelService.getOne(req.user, req.params.id);
  res.status(200).json({ success: true, data: { fuelRecord: record } });
});

const update = asyncHandler(async (req, res) => {
  const record = await fuelService.update(req.user, req.params.id, req.body, requestContext(req));
  res.status(200).json({ success: true, data: { fuelRecord: record } });
});

const summary = asyncHandler(async (req, res) => {
  const result = await fuelService.getSummary(req.user, req.query);
  res.status(200).json({ success: true, data: result });
});

module.exports = { create, list, getOne, update, summary };
