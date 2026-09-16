import api from './api';
import * as offlineQueue from './offlineQueue';
import { generateClientId } from '../utils/id';

// Ownership-scoped server-side — a driver only ever sees their own
// records here (backend/src/services/fuelService.js).
export const listMine = async (params) => {
  const res = await api.get('/fuel', { params });
  return res.data.data.fuelRecords;
};

const createRaw = async (payload) => {
  const res = await api.post('/fuel', payload);
  return res.data.data.fuelRecord;
};

offlineQueue.registerHandler('fuel:create', createRaw);

// Queued — see offlineQueue.js. A clientId is always attached so a
// retried/replayed submission after a lost response is deduped
// server-side (fuelService.create in the backend) instead of creating a
// duplicate fill-up record.
export const submitFuelRecord = (payload) =>
  offlineQueue.enqueue('fuel:create', { ...payload, clientId: generateClientId() });
