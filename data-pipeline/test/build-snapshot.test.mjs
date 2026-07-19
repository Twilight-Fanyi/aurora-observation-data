import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSnapshot } from '../src/build-snapshot.mjs';
import { validateSnapshot } from '../src/contracts.mjs';
import { makeNormalizedInput } from './fixture-data.mjs';

test('builds a schema-valid 50-location snapshot with 12 future hours', () => {
  const now = new Date('2026-01-15T12:10:00Z');
  const snapshot = buildSnapshot(makeNormalizedInput(now), now);
  assert.doesNotThrow(() => validateSnapshot(snapshot));
  assert.equal(snapshot.locations.length, 50);
  for (const location of snapshot.locations) {
    assert.equal(location.hourly.length, 12);
    assert.equal(location.auroraDays.length, 3);
    assert.equal(location.weatherDays.length, 16);
    assert.ok(location.current.score >= 0 && location.current.score <= 100);
    assert.ok(location.current.reasonCodes.length <= 3);
    assert.ok(location.auroraDays.every((day) => day.maxKp === 8));
  }
  assert.notEqual(
    snapshot.locations[0].hourly[0].localTime,
    snapshot.locations[10].hourly[0].localTime
  );
});

test('keeps long-range weather separate from the three-day aurora score', () => {
  const now = new Date('2026-01-15T12:10:00Z');
  const snapshot = buildSnapshot(makeNormalizedInput(now, {
    forecastKp: 8,
    cloudCover: 15,
    visibilityKm: 30
  }), now);
  const location = snapshot.locations[0];

  assert.ok(location.auroraDays.some((day) => day.score > 0));
  assert.equal(location.weatherDays.length, 16);
  assert.equal('score' in location.weatherDays[15], false);
  assert.equal(location.weatherDays[15].cloudCover, 15);
});

test('thick cloud suppresses scores and produces an explanatory reason', () => {
  const now = new Date('2026-01-15T12:10:00Z');
  const snapshot = buildSnapshot(makeNormalizedInput(now, {
    cloudCover: 100,
    visibilityKm: 2
  }), now);
  for (const location of snapshot.locations) {
    assert.equal(location.current.score, 0);
    assert.ok(location.current.reasonCodes.includes('high_cloud'));
  }
});

test('rejects missing forecasts and stale required inputs', () => {
  const now = new Date('2026-01-15T12:10:00Z');
  const missingForecast = makeNormalizedInput(now);
  missingForecast.kpForecast = [];
  assert.throws(() => buildSnapshot(missingForecast, now), /Kp forecast/);

  const staleWeather = makeNormalizedInput(now);
  staleWeather.fetchedAt = '2026-01-15T08:00:00Z';
  assert.throws(() => buildSnapshot(staleWeather, now), /weather/);
});

test('uses the end of the three-hour Kp interval for freshness', () => {
  const now = new Date('2026-07-14T14:04:00Z');
  const input = makeNormalizedInput(now);
  input.currentKp = {
    timeUtc: '2026-07-14T09:00:00Z',
    intervalEndUtc: '2026-07-14T12:00:00Z',
    value: 2
  };

  const snapshot = buildSnapshot(input, now);

  assert.equal(snapshot.sources.kp.observedAt, '2026-07-14T12:00:00Z');
});

test('uses current Kp before the first forecast interval starts', () => {
  const now = new Date('2026-01-15T12:10:00Z');
  const input = makeNormalizedInput(now, { currentKp: 4 });
  input.kpForecast = Array.from({ length: 25 }, (_, index) => ({
    timeUtc: new Date(Date.parse('2026-01-15T15:00:00Z') + index * 3 * 3600000)
      .toISOString(),
    value: 8
  }));

  const snapshot = buildSnapshot(input, now);

  assert.equal(snapshot.locations[0].hourly[0].kp, 4);
  assert.equal(snapshot.locations[0].hourly[2].kp, 8);
});
