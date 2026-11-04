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

/**
 * SQL for the haversine distance in metres from `origin` to a row's `lat` / `lng` columns, for
 * sorting and filtering in the database (TiDB has no ST_Distance_Sphere). `origin` must be numbers.
 *
 *   distanceSql('`vendor`.`lat`', '`vendor`.`lng`', { lat: 6.5, lng: 3.38 })
 */
export const distanceSql = (latColumn, lngColumn, origin) => {
  const lat = Number(origin.lat);
  const lng = Number(origin.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('distanceSql needs a numeric origin');
  return (
    `ROUND(${2 * EARTH_RADIUS_M} * ASIN(SQRT(POW(SIN(RADIANS(${latColumn} - ${lat}) / 2), 2) + ` +
    `COS(RADIANS(${lat})) * COS(RADIANS(${latColumn})) * POW(SIN(RADIANS(${lngColumn} - ${lng}) / 2), 2))))`
  );
};
