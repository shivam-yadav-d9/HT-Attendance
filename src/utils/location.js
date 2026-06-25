// src/utils/location.js
// Single source of truth for geofence coordinates and radii.
// Used by geofence.service.js (native BackgroundGeolocation config)
// and anywhere else that needs office coordinates (e.g. distance display).

export const OFFICE_LOCATION = {
  latitude: 19.137031,
  longitude: 72.862710,
};

// IMPORTANT: native Android/iOS geofencing APIs are NOT reliable below
// ~200m radius — the OS will not fire enter/exit transitions consistently.
// If you need tighter precision than 200m, you cannot use native geofences
// alone; you'd need to pair this with a foreground polling check.
export const CHECKIN_RADIUS_M = 100;

// Exit when beyond this distance — larger than entry to prevent GPS-jitter
// flicker right at the boundary (hysteresis).
export const CHECKOUT_RADIUS_M = 150;

// Legacy alias (keeps any old imports working)
export const MAX_DISTANCE = CHECKIN_RADIUS_M;

/**
 * Haversine distance in metres between two lat/lng points.
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};