// Simple module-level singleton for the Socket.IO server instance, set
// once at boot (server.js) and read by any service that needs to
// broadcast (e.g. locationService after ingesting a GPS point). Avoids a
// circular require between server.js and the service layer.
let io = null;

const setIO = (instance) => {
  io = instance;
};

const getIO = () => io;

module.exports = { setIO, getIO };
