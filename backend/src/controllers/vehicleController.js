const asyncHandler = require('../utils/asyncHandler');
const vehicleService = require('../services/vehicleService');
const locationService = require('../services/locationService');

const requestContext = (req) => ({ ipAddress: req.ip, userAgent: req.headers['user-agent'] });

const list = asyncHandler(async (req, res) => {
  const result = await vehicleService.list(req.user, req.query);
  res.status(200).json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const vehicle = await vehicleService.getOne(req.user, req.params.id);
  res.status(200).json({ success: true, data: { vehicle } });
});

const getMe = asyncHandler(async (req, res) => {
  const vehicle = await vehicleService.getAssignedToDriverUser(req.user.id);
  res.status(200).json({ success: true, data: { vehicle } });
});

const getLocation = asyncHandler(async (req, res) => {
  const location = await locationService.getLatestForVehicle(req.user, req.params.id);
  res.status(200).json({ success: true, data: { location } });
});

const create = asyncHandler(async (req, res) => {
  const vehicle = await vehicleService.create(req.user, req.body, requestContext(req));
  res.status(201).json({ success: true, data: { vehicle } });
});

const update = asyncHandler(async (req, res) => {
  const vehicle = await vehicleService.update(req.user, req.params.id, req.body, requestContext(req));
  res.status(200).json({ success: true, data: { vehicle } });
});

const remove = asyncHandler(async (req, res) => {
  const vehicle = await vehicleService.retire(req.user, req.params.id, requestContext(req));
  res.status(200).json({ success: true, data: { vehicle } });
});

module.exports = { list, getOne, getMe, getLocation, create, update, remove };
