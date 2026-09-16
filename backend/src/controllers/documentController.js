const asyncHandler = require('../utils/asyncHandler');
const documentService = require('../services/documentService');

const requestContext = (req) => ({ ipAddress: req.ip, userAgent: req.headers['user-agent'] });

const uploadCredentials = asyncHandler(async (req, res) => {
  const credentials = await documentService.getUploadCredentials(req.user, req.body);
  res.status(200).json({ success: true, data: credentials });
});

const create = asyncHandler(async (req, res) => {
  const document = await documentService.create(req.user, req.body, requestContext(req));
  res.status(201).json({ success: true, data: { document } });
});

const list = asyncHandler(async (req, res) => {
  const result = await documentService.list(req.user, req.query);
  res.status(200).json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const document = await documentService.getOne(req.user, req.params.id);
  res.status(200).json({ success: true, data: { document } });
});

const update = asyncHandler(async (req, res) => {
  const document = await documentService.update(req.user, req.params.id, req.body, requestContext(req));
  res.status(200).json({ success: true, data: { document } });
});

const remove = asyncHandler(async (req, res) => {
  await documentService.remove(req.user, req.params.id, requestContext(req));
  res.status(200).json({ success: true, data: { message: 'Document deleted' } });
});

module.exports = { uploadCredentials, create, list, getOne, update, remove };
