// Derives the Live Map's display status for a vehicle from its stored
// `status` plus its latest location's speed. Deliberately does not claim
// "OFFLINE" — that requires the vehicle-offline-detection background job
// (tracked as not-yet-built in docs/gps-tracking.md); a vehicle with no
// recorded location is labeled "no data yet" instead of a false positive.
export const MAP_FILTERS = ['ALL', 'MOVING', 'IDLE', 'MAINTENANCE'];

const MOVING_SPEED_THRESHOLD_MS = 0.5; // ~1.8 km/h — above this counts as moving, not idle

export const deriveMapStatus = (vehicle) => {
  if (vehicle.status === 'MAINTENANCE') return { code: 'MAINTENANCE', label: 'Maintenance' };
  if (vehicle.status === 'INACTIVE') return { code: 'INACTIVE', label: 'Inactive' };
  if (vehicle.status === 'RETIRED') return { code: 'RETIRED', label: 'Retired' };

  if (!vehicle.location) return { code: 'NO_DATA', label: 'No data yet' };

  const speed = vehicle.location.speed || 0;
  return speed > MOVING_SPEED_THRESHOLD_MS
    ? { code: 'MOVING', label: 'In Transit' }
    : { code: 'IDLE', label: 'Idle' };
};

export const matchesFilter = (vehicle, filter) => {
  if (filter === 'ALL') return true;
  return deriveMapStatus(vehicle).code === filter;
};
