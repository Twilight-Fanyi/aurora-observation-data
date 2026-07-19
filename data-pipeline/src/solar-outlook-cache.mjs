const HOUR_MS = 60 * 60 * 1000;

export const SOLAR_OUTLOOK_REFRESH_MS = 24 * HOUR_MS;
export const SOLAR_OUTLOOK_MAX_AGE_MS = 8 * 24 * HOUR_MS;

function utc(value, label) {
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

export function validateSolarOutlookCache(value, now = new Date()) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
    value.schemaVersion !== 1 || !Array.isArray(value.days) || value.days.length !== 27) {
    throw new Error('solar outlook cache must contain 27 days');
  }
  const nowMs = now.getTime();
  const fetchedAtMs = utc(value.fetchedAt, 'solar outlook fetchedAt');
  const issuedAtMs = utc(value.issuedAt, 'solar outlook issuedAt');
  if (!Number.isFinite(nowMs) || fetchedAtMs > nowMs || issuedAtMs > nowMs + HOUR_MS ||
    nowMs - fetchedAtMs > SOLAR_OUTLOOK_MAX_AGE_MS) {
    throw new Error('solar outlook cache is outside the allowed age');
  }
  let previousDate = '';
  value.days.forEach((day) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day?.dateUtc) || day.dateUtc <= previousDate) {
      throw new Error('solar outlook dates must be ordered');
    }
    previousDate = day.dateUtc;
    metric(day.radioFlux, 0, 1000, 'solar outlook radio flux');
    metric(day.planetaryA, 0, 400, 'solar outlook planetary A');
    metric(day.maxKp, 0, 9, 'solar outlook Kp');
  });
  return value;
}

export function createSolarOutlookCache(outlook, fetchedAt) {
  return validateSolarOutlookCache({
    schemaVersion: 1,
    fetchedAt,
    issuedAt: outlook.issuedAt,
    days: outlook.days
  }, new Date(fetchedAt));
}

export async function resolveSolarOutlookCache({ previous, now, fetchOutlookFn }) {
  let cached;
  try {
    cached = validateSolarOutlookCache(previous, now);
  } catch {
    cached = undefined;
  }
  if (cached !== undefined &&
    now.getTime() - Date.parse(cached.fetchedAt) < SOLAR_OUTLOOK_REFRESH_MS) {
    return cached;
  }
  try {
    return createSolarOutlookCache(await fetchOutlookFn(), now.toISOString());
  } catch {
    return cached;
  }
}
