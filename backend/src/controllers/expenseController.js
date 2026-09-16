const asyncHandler = require('../utils/asyncHandler');
const expenseService = require('../services/expenseService');

const requestContext = (req) => ({ ipAddress: req.ip, userAgent: req.headers['user-agent'] });

const list = asyncHandler(async (req, res) => {
  const result = await expenseService.list(req.user, req.query);
  res.status(200).json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const expense = await expenseService.getOne(req.user, req.params.id);
  res.status(200).json({ success: true, data: { expense } });
});

const create = asyncHandler(async (req, res) => {
  const expense = await expenseService.create(req.user, req.body, requestContext(req));
  res.status(201).json({ success: true, data: { expense } });
});

const update = asyncHandler(async (req, res) => {
  const expense = await expenseService.update(req.user, req.params.id, req.body, requestContext(req));
  res.status(200).json({ success: true, data: { expense } });
});

const approve = asyncHandler(async (req, res) => {
  const expense = await expenseService.approve(req.user, req.params.id, requestContext(req));
  res.status(200).json({ success: true, data: { expense } });
});

const reject = asyncHandler(async (req, res) => {
  const expense = await expenseService.reject(req.user, req.params.id, requestContext(req));
  res.status(200).json({ success: true, data: { expense } });
});

module.exports = { list, getOne, create, update, approve, reject };
