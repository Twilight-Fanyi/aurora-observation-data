import test from 'node:test';
import assert from 'node:assert/strict';

import { LOCATION_IDS, LOCATIONS } from '../src/catalog.mjs';
import {
  WEATHER_BATCH_SIZE,
  buildWeatherUrls,
  fetchWeather,
  nearestOvation,
  parseBz,
  parseCurrentKp,
  parseKpForecast,
  parseOvation,
  parseSolarWind,
  parseWeather
} from '../src/upstreams.mjs';

test('builds five Open-Meteo requests with ten ordered coordinates each', () => {
  assert.equal(WEATHER_BATCH_SIZE, 10);
  const urls = buildWeatherUrls();
  assert.equal(urls.length, 5);
  urls.forEach((value, batchIndex) => {
    const url = new URL(value);
    assert.equal(url.hostname, 'api.open-meteo.com');
    const latitudes = url.searchParams.get('latitude').split(',').map(Number);
    const longitudes = url.searchParams.get('longitude').split(',').map(Number);
    assert.equal(latitudes.length, 10);
    assert.equal(longitudes.length, 10);
    assert.deepEqual(
      latitudes,
      LOCATIONS.slice(batchIndex * 10, batchIndex * 10 + 10)
        .map((location) => location.latitude)
    );
    assert.deepEqual(
      longitudes,
      LOCATIONS.slice(batchIndex * 10, batchIndex * 10 + 10)
        .map((location) => location.longitude)
    );
    assert.equal(url.searchParams.get('hourly'), 'cloud_cover,visibility');
    assert.equal(url.searchParams.get('forecast_days'), '16');
  });
});

test('merges weather batches back into exact catalog order', async () => {
  const calls = [];
  const weather = await fetchWeather(async (url) => {
    calls.push(String(url));
    const request = new URL(url);
    const latitudes = request.searchParams.get('latitude').split(',').map(Number);
    const rows = latitudes.map((latitude) => {
      const location = LOCATIONS.find((candidate) => candidate.latitude === latitude);
      return {
        latitude: location.latitude + 0.2,
        longitude: location.longitude - 0.2,
        timezone: location.timeZone,
        utc_offset_seconds: 0,
        hourly: {
          time: ['2026-01-15T12:00'],
          cloud_cover: [10],
          visibility: [30000]
        }
      };
    });
    return new Response(JSON.stringify(rows), { status: 200 });
  });
  assert.equal(calls.length, 5);
  assert.deepEqual(weather.map((item) => item.id), LOCATION_IDS);
});

test('rejects weather batches whose response rows are swapped', async () => {
  await assert.rejects(() => fetchWeather(async (url) => {
    const request = new URL(url);
    const latitudes = request.searchParams.get('latitude').split(',').map(Number);
    const longitudes = request.searchParams.get('longitude').split(',').map(Number);
    const rows = latitudes.map((latitude, index) => ({
      latitude,
      longitude: longitudes[index],
      timezone: 'UTC',
      utc_offset_seconds: 0,
      hourly: {
        time: ['2026-01-15T12:00'],
        cloud_cover: [10],
        visibility: [30000]
      }
    }));
    if (latitudes[0] === LOCATIONS[0].latitude) {
      [rows[0], rows[1]] = [rows[1], rows[0]];
    }
    return new Response(JSON.stringify(rows), { status: 200 });
  }), /weather response coordinates do not match requested catalog order/);
});

test('normalizes NOAA current, forecast, solar wind, and OVATION products', () => {
  assert.deepEqual(parseCurrentKp([
    { time_tag: '2026-07-14T12:00:00Z', Kp: '7.33' }
  ]), {
    timeUtc: '2026-07-14T12:00:00.000Z',
    intervalEndUtc: '2026-07-14T15:00:00.000Z',
    value: 7.33
  });

  assert.deepEqual(parseKpForecast([
    {
      time_tag: '2026-07-14T12:00:00Z',
      kp: '7.00',
      observed: 'observed'
    },
    {
      time_tag: '2026-07-14T15:00:00Z',
      kp: '8.00',
      observed: 'estimated',
      noaa_scale: 'G4'
    },
    {
      time_tag: '2026-07-14T18:00:00Z',
      kp: '6.00',
      observed: 'predicted'
    }
  ]), [
    {
      timeUtc: '2026-07-14T15:00:00.000Z',
      value: 8
    },
    {
      timeUtc: '2026-07-14T18:00:00.000Z',
      value: 6
    }
  ]);

  assert.deepEqual(parseBz([
    { time_tag: '2026-07-14T13:25:00Z', bt: 10, bz_gsm: -9 }
  ]), {
    timeUtc: '2026-07-14T13:25:00.000Z',
    value: -9
  });

  assert.deepEqual(parseSolarWind([
    { time_tag: '2026-07-14T13:25:00Z', proton_speed: 520 }
  ]), {
    timeUtc: '2026-07-14T13:25:00.000Z',
    valueKmS: 520
  });

  assert.deepEqual(parseOvation({
    'Observation Time': '2026-07-14T13:20:00Z',
    'Forecast Time': '2026-07-14T13:40:00Z',
    coordinates: [[122, 53, 32]]
  }), {
    observationTime: '2026-07-14T13:20:00.000Z',
    forecastTime: '2026-07-14T13:40:00.000Z',
    grid: [[122, 53, 32]]
  });
});

test('treats timezone-less NOAA product timestamps as UTC', () => {
  const previousTimeZone = process.env.TZ;
  process.env.TZ = 'Asia/Shanghai';
  try {
    assert.deepEqual(parseCurrentKp([
      { time_tag: '2026-07-14T09:00:00', Kp: '2.00' }
    ]), {
      timeUtc: '2026-07-14T09:00:00.000Z',
      intervalEndUtc: '2026-07-14T12:00:00.000Z',
      value: 2
    });
  } finally {
    if (previousTimeZone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previousTimeZone;
    }
  }
});

test('normalizes batched local weather timestamps to UTC', () => {
  const raw = LOCATIONS.map((location) => ({
    timezone: location.timeZone,
    utc_offset_seconds: 3600,
    hourly: {
      time: ['2026-07-14T14:00'],
      cloud_cover: [13],
      visibility: [25000]
    }
  }));
  const weather = parseWeather(raw);
  assert.equal(weather.length, 50);
  assert.equal(weather[0].id, 'mohe-beiji');
  assert.deepEqual(weather[0].hourly[0], {
    timeUtc: '2026-07-14T13:00:00.000Z',
    localDate: '2026-07-14',
    localTime: '14:00',
    cloudCover: 13,
    visibilityKm: 25
  });
});

test('finds nearest OVATION points across the antimeridian', () => {
  const point = nearestOvation(
    [[179, 65, 12], [-175, 65, 30]],
    { latitude: 65, longitude: -180 }
  );
  assert.equal(point.aurora, 12);
  assert.equal(point.distanceDegrees, 1);
});
