const asyncHandler = require('../utils/asyncHandler');
const reportService = require('../services/reportService');

const fleet = asyncHandler(async (req, res) => {
  const result = await reportService.getFleetReport(req.user, req.query);
  res.status(200).json({ success: true, data: result });
});

const fuel = asyncHandler(async (req, res) => {
  const result = await reportService.getFuelReport(req.user, req.query);
  res.status(200).json({ success: true, data: result });
});

const maintenance = asyncHandler(async (req, res) => {
  const result = await reportService.getMaintenanceReport(req.user, req.query);
  res.status(200).json({ success: true, data: result });
});

const drivers = asyncHandler(async (req, res) => {
  const result = await reportService.getDriverReport(req.user, req.query);
  res.status(200).json({ success: true, data: result });
});

module.exports = { fleet, fuel, maintenance, drivers };
