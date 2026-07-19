import test from 'node:test';
import assert from 'node:assert/strict';

import { LOCATIONS } from '../src/catalog.mjs';
import {
  WEATHER_MAX_AGE_MS,
  WEATHER_REFRESH_MS,
  createWeatherCache,
  resolveWeatherCache,
  validateWeatherCache
} from '../src/weather-cache.mjs';

function weather(fetchedAt) {
  return LOCATIONS.map((location) => ({
    id: location.id,
    timeZone: location.timeZone,
    hourly: [{
      timeUtc: fetchedAt,
      localDate: fetchedAt.slice(0, 10),
      localTime: fetchedAt.slice(11, 16),
      cloudCover: 20,
      visibilityKm: 25
    }]
  }));
}

test('reuses weather younger than fifteen minutes', async () => {
  const fetchedAt = '2026-07-16T04:00:00.000Z';
  const previous = createWeatherCache(weather(fetchedAt), fetchedAt);
  let calls = 0;

  const result = await resolveWeatherCache({
    previous,
    now: new Date(Date.parse(fetchedAt) + WEATHER_REFRESH_MS - 1),
    fetchWeatherFn: async () => {
      calls += 1;
      return weather(fetchedAt);
    }
  });

  assert.equal(calls, 0);
  assert.equal(result.refreshed, false);
  assert.equal(result.cache.fetchedAt, fetchedAt);
});

test('refreshes weather at fifteen minutes', async () => {
  const fetchedAt = '2026-07-16T04:00:00.000Z';
  const next = '2026-07-16T04:15:00.000Z';

  const result = await resolveWeatherCache({
    previous: createWeatherCache(weather(fetchedAt), fetchedAt),
    now: new Date(next),
    fetchWeatherFn: async () => weather(next)
  });

  assert.equal(result.refreshed, true);
  assert.equal(result.cache.fetchedAt, next);
});

test('refreshes a legacy cache without local dates immediately', async () => {
  const now = new Date('2026-07-14T12:10:00Z');
  const fetchedAt = '2026-07-14T12:05:00.000Z';
  const legacy = createWeatherCache(weather(fetchedAt), fetchedAt);
  legacy.locations.forEach((location) => {
    location.hourly.forEach((hour) => {
      delete hour.localDate;
    });
  });
  let calls = 0;
  const result = await resolveWeatherCache({
    previous: legacy,
    now,
    fetchWeatherFn: async () => {
      calls += 1;
      return weather(now.toISOString());
    }
  });

  assert.equal(calls, 1);
  assert.equal(result.refreshed, true);
  assert.equal(result.cache.locations[0].hourly[0].localDate, '2026-07-14');
});

test('falls back to valid weather for no more than three hours', async () => {
  const fetchedAt = '2026-07-16T04:00:00.000Z';
  const previous = createWeatherCache(weather(fetchedAt), fetchedAt);

  const result = await resolveWeatherCache({
    previous,
    now: new Date(Date.parse(fetchedAt) + WEATHER_MAX_AGE_MS),
    fetchWeatherFn: async () => {
      throw new Error('weather unavailable');
    }
  });

  assert.equal(result.cache.fetchedAt, fetchedAt);
  await assert.rejects(() => resolveWeatherCache({
    previous,
    now: new Date(Date.parse(fetchedAt) + WEATHER_MAX_AGE_MS + 1),
    fetchWeatherFn: async () => {
      throw new Error('weather unavailable');
    }
  }), /weather unavailable/);
});

test('rejects missing, reordered, or malformed location weather', () => {
  const fetchedAt = '2026-07-16T04:00:00.000Z';
  const missing = createWeatherCache(weather(fetchedAt), fetchedAt);
  missing.locations.pop();
  assert.throws(
    () => validateWeatherCache(missing, new Date(fetchedAt)),
    /50 locations/
  );

  const reordered = createWeatherCache(weather(fetchedAt), fetchedAt);
  [reordered.locations[0], reordered.locations[1]] =
    [reordered.locations[1], reordered.locations[0]];
  assert.throws(
    () => validateWeatherCache(reordered, new Date(fetchedAt)),
    /catalog order/
  );

  const malformed = createWeatherCache(weather(fetchedAt), fetchedAt);
  malformed.locations[0].hourly[0].cloudCover = 101;
  assert.throws(
    () => validateWeatherCache(malformed, new Date(fetchedAt)),
    /cloudCover/
  );
});
