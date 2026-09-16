const asyncHandler = require('../utils/asyncHandler');
const geofenceService = require('../services/geofenceService');

const requestContext = (req) => ({ ipAddress: req.ip, userAgent: req.headers['user-agent'] });

const list = asyncHandler(async (req, res) => {
  const result = await geofenceService.list(req.user, req.query);
  res.status(200).json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const geofence = await geofenceService.getOne(req.user, req.params.id);
  res.status(200).json({ success: true, data: { geofence } });
});

const create = asyncHandler(async (req, res) => {
  const geofence = await geofenceService.create(req.user, req.body, requestContext(req));
  res.status(201).json({ success: true, data: { geofence } });
});

const update = asyncHandler(async (req, res) => {
  const geofence = await geofenceService.update(req.user, req.params.id, req.body, requestContext(req));
  res.status(200).json({ success: true, data: { geofence } });
});

const remove = asyncHandler(async (req, res) => {
  const geofence = await geofenceService.deactivate(req.user, req.params.id, requestContext(req));
  res.status(200).json({ success: true, data: { geofence } });
});

module.exports = { list, getOne, create, update, remove };
