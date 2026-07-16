import { LOCATION_IDS } from './catalog.mjs';

const MINUTE_MS = 60000;
export const WEATHER_REFRESH_MS = 15 * MINUTE_MS;
export const WEATHER_MAX_AGE_MS = 3 * 60 * MINUTE_MS;

function timestamp(value, label) {
  const parsed = Date.parse(value);
  if (typeof value !== 'string' || !value.endsWith('Z') || !Number.isFinite(parsed)) {
    throw new Error(label + ' must be a UTC timestamp');
  }
  return parsed;
}

function metric(value, minimum, maximum, label) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(label + ' is outside its allowed range');
  }
}

export function validateWeatherCache(value, now = new Date()) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
    value.schemaVersion !== 1 || !Array.isArray(value.locations) ||
    value.locations.length !== LOCATION_IDS.length) {
    throw new Error('weather cache must contain 50 locations');
  }

  const nowMs = now.getTime();
  const fetchedMs = timestamp(value.fetchedAt, 'weather fetchedAt');
  if (!Number.isFinite(nowMs) || fetchedMs > nowMs ||
    nowMs - fetchedMs > WEATHER_MAX_AGE_MS) {
    throw new Error('weather cache is outside the allowed age');
  }

  value.locations.forEach((location, locationIndex) => {
    if (location?.id !== LOCATION_IDS[locationIndex]) {
      throw new Error('weather cache locations must match catalog order');
    }
    if (typeof location.timeZone !== 'string' ||
      !Array.isArray(location.hourly) || location.hourly.length === 0) {
      throw new Error('weather cache location is malformed');
    }

    let previousTime = -Infinity;
    location.hourly.forEach((hour) => {
      const time = timestamp(hour?.timeUtc, 'weather hour');
      if (time <= previousTime || !/^\d{2}:\d{2}$/.test(hour.localTime)) {
        throw new Error('weather cache hours must be ordered');
      }
      previousTime = time;
      metric(hour.cloudCover, 0, 100, 'weather cloudCover');
      metric(hour.visibilityKm, 0, 1000, 'weather visibilityKm');
    });
  });

  return value;
}

export function createWeatherCache(weather, fetchedAt) {
  return validateWeatherCache({
    schemaVersion: 1,
    fetchedAt,
    locations: weather
  }, new Date(fetchedAt));
}

export async function resolveWeatherCache({ previous, now, fetchWeatherFn }) {
  let cached;
  try {
    cached = validateWeatherCache(previous, now);
  } catch {
    cached = undefined;
  }

  if (cached !== undefined &&
    now.getTime() - Date.parse(cached.fetchedAt) < WEATHER_REFRESH_MS) {
    return { cache: cached, refreshed: false };
  }

  try {
    const locations = await fetchWeatherFn();
    return {
      cache: createWeatherCache(locations, now.toISOString()),
      refreshed: true
    };
  } catch (error) {
    if (cached !== undefined) {
      return { cache: cached, refreshed: false };
    }
    throw error;
  }
}
