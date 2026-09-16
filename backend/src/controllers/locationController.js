const asyncHandler = require('../utils/asyncHandler');
const locationService = require('../services/locationService');

const ingest = asyncHandler(async (req, res) => {
  const result = await locationService.ingest(req.user, req.body);
  res.status(201).json({ success: true, data: result });
});

module.exports = { ingest };
