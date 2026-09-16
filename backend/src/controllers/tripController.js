const asyncHandler = require('../utils/asyncHandler');
const tripService = require('../services/tripService');

const requestContext = (req) => ({ ipAddress: req.ip, userAgent: req.headers['user-agent'] });

const list = asyncHandler(async (req, res) => {
  const result = await tripService.list(req.user, req.query);
  res.status(200).json({ success: true, data: result });
});

const listMe = asyncHandler(async (req, res) => {
  const result = await tripService.listOwn(req.user.id, req.query);
  res.status(200).json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const trip = await tripService.getOne(req.user, req.params.id);
  res.status(200).json({ success: true, data: { trip } });
});

const create = asyncHandler(async (req, res) => {
  const trip = await tripService.create(req.user, req.body, requestContext(req));
  res.status(201).json({ success: true, data: { trip } });
});

const update = asyncHandler(async (req, res) => {
  const trip = await tripService.update(req.user, req.params.id, req.body, requestContext(req));
  res.status(200).json({ success: true, data: { trip } });
});

const cancel = asyncHandler(async (req, res) => {
  const trip = await tripService.cancel(req.user, req.params.id, requestContext(req));
  res.status(200).json({ success: true, data: { trip } });
});

const start = asyncHandler(async (req, res) => {
  const trip = await tripService.start(req.user, req.params.id, req.body, requestContext(req));
  res.status(200).json({ success: true, data: { trip } });
});

const pause = asyncHandler(async (req, res) => {
  const trip = await tripService.pause(req.user, req.params.id, requestContext(req));
  res.status(200).json({ success: true, data: { trip } });
});

const resume = asyncHandler(async (req, res) => {
  const trip = await tripService.resume(req.user, req.params.id, requestContext(req));
  res.status(200).json({ success: true, data: { trip } });
});

const end = asyncHandler(async (req, res) => {
  const trip = await tripService.end(req.user, req.params.id, req.body, requestContext(req));
  res.status(200).json({ success: true, data: { trip } });
});

module.exports = { list, listMe, getOne, create, update, cancel, start, pause, resume, end };
