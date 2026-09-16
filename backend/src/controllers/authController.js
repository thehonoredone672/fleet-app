const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/authService');

const requestContext = (req) => ({
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
});

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body, requestContext(req));
  res.status(201).json({ success: true, data: result });
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body, requestContext(req));
  res.status(200).json({ success: true, data: result });
});

const refresh = asyncHandler(async (req, res) => {
  const result = await authService.refresh(req.body.refreshToken, requestContext(req));
  res.status(200).json({ success: true, data: result });
});

const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.body.refreshToken);
  res.status(200).json({ success: true, data: { message: 'Logged out' } });
});

const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(
    req.user.id,
    req.body.currentPassword,
    req.body.newPassword,
    requestContext(req)
  );
  res.status(200).json({ success: true, data: { message: 'Password changed' } });
});

const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body.email);
  res.status(200).json({
    success: true,
    data: { message: 'If that email is registered, a reset link has been sent' },
  });
});

const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body.token, req.body.newPassword, requestContext(req));
  res.status(200).json({ success: true, data: { message: 'Password reset successful' } });
});

module.exports = { register, login, refresh, logout, changePassword, forgotPassword, resetPassword };
