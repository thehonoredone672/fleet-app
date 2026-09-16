// Not cryptographically unique — just unique enough for offline-queue
// dedup keys (Location.clientId, FuelRecord.clientId), which only need
// to distinguish "this exact submission" from any other on the same
// device.
export const generateClientId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
