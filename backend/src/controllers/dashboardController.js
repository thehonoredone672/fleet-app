const asyncHandler = require('../utils/asyncHandler');
const dashboardService = require('../services/dashboardService');

const kpis = asyncHandler(async (req, res) => {
  const result = await dashboardService.getKpis(req.user, req.query);
  res.status(200).json({ success: true, data: result });
});

module.exports = { kpis };
