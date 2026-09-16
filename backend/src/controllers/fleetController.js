const asyncHandler = require('../utils/asyncHandler');
const fleetService = require('../services/fleetService');

const live = asyncHandler(async (req, res) => {
  const result = await fleetService.getLiveSnapshot(req.user, req.query);
  res.status(200).json({ success: true, data: result });
});

module.exports = { live };
