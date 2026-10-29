const EARTH_RADIUS_M = 6_371_000;
const toRad = (degrees) => (degrees * Math.PI) / 180;

/** Distance in whole metres between two `{ lat, lng }` points (haversine), as `distanceM`. */
export const haversineM = (a, b) => {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h)));
};

// Used for distanceM when the request has no lat/lng and the user has no default address
export const CENTRAL_LAGOS = { lat: 6.5244, lng: 3.3792 };
