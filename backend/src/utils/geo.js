// Haversine great-circle distance in meters — pure, no dependencies, used
// to test whether a GPS point falls inside a geofence's radius. Accurate
// enough for geofencing at the radii this app deals with (tens of meters
// to a few km); no need for a more precise ellipsoidal model.
const EARTH_RADIUS_METERS = 6371000;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

const haversineDistanceMeters = (lat1, lng1, lat2, lng2) => {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
};

module.exports = { haversineDistanceMeters };
