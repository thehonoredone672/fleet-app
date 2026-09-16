const asyncHandler = require('../utils/asyncHandler');
const assignmentService = require('../services/assignmentService');

const requestContext = (req) => ({ ipAddress: req.ip, userAgent: req.headers['user-agent'] });

const list = asyncHandler(async (req, res) => {
  const result = await assignmentService.list(req.user, req.query);
  res.status(200).json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const assignment = await assignmentService.getOne(req.user, req.params.id);
  res.status(200).json({ success: true, data: { assignment } });
});

const create = asyncHandler(async (req, res) => {
  const assignment = await assignmentService.create(req.user, req.body, requestContext(req));
  res.status(201).json({ success: true, data: { assignment } });
});

const unassign = asyncHandler(async (req, res) => {
  const assignment = await assignmentService.unassign(req.user, req.params.id, requestContext(req));
  res.status(200).json({ success: true, data: { assignment } });
});

module.exports = { list, getOne, create, unassign };
