const { Server } = require('socket.io');
const prisma = require('../config/database');
const env = require('../config/env');
const logger = require('../utils/logger');
const tokenService = require('../services/tokenService');
const locationService = require('../services/locationService');
const { locationPointSchema } = require('../validators/locationValidators');
const { orgFleetRoom } = require('./rooms');
const { setIO } = require('./ioInstance');

// Mirrors the `authenticate` HTTP middleware: verify the JWT, then
// re-fetch the user from the database rather than trusting the token's
// claims, so a deactivated account is rejected even with a still-valid
// access token. Never allow an unauthenticated socket to subscribe to
// fleet data (docs/security.md).
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) throw new Error('Authentication required');

    const payload = tokenService.verifyAccessToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user) throw new Error('User no longer exists');
    if (!user.isActive) throw new Error('Account is deactivated');

    socket.data.user = {
      id: user.id,
      role: user.role,
      organizationId: user.organizationId,
    };
    next();
  } catch (err) {
    next(new Error(err.message || 'Authentication failed'));
  }
};

const handleVehicleLocation = (socket) => async (payload, ack) => {
  const respond = (body) => {
    if (typeof ack === 'function') ack(body);
  };

  try {
    const point = locationPointSchema.parse(payload);
    const result = await locationService.ingest(socket.data.user, point);
    respond({ success: true, data: result });
  } catch (err) {
    // Validation (Zod) and business-rule (AppError) failures both land
    // here — never let a bad payload crash the connection.
    respond({ success: false, message: err.message });
  }
};

const initSockets = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: env.corsOrigin, credentials: true },
  });

  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const { user } = socket.data;
    socket.join(orgFleetRoom(user.organizationId));
    logger.debug('Socket connected', { userId: user.id, role: user.role });

    socket.on('vehicle:location', handleVehicleLocation(socket));

    socket.on('disconnect', (reason) => {
      logger.debug('Socket disconnected', { userId: user.id, reason });
    });
  });

  setIO(io);
  return io;
};

module.exports = { initSockets };
