import test from 'node:test';
import assert from 'node:assert/strict';

import { solarElevation } from '../src/solar.mjs';

test('solar elevation distinguishes equatorial noon and midnight', () => {
  const noon = solarElevation(new Date('2026-03-20T12:00:00Z'), 0, 0);
  const midnight = solarElevation(new Date('2026-03-20T00:00:00Z'), 0, 0);
  assert.ok(noon > 87 && noon <= 90);
  assert.ok(midnight < -87 && midnight >= -90);
});

test('solar elevation follows longitude and remains physically bounded', () => {
  const eastNoon = solarElevation(new Date('2026-03-20T04:00:00Z'), 0, 120);
  const westNight = solarElevation(new Date('2026-03-20T04:00:00Z'), 0, -120);
  assert.ok(eastNoon > 87);
  assert.ok(westNight < -20);

  for (const latitude of [-90, -44, 0, 53, 90]) {
    const value = solarElevation(new Date('2026-07-14T13:30:00Z'), latitude, 122);
    assert.ok(value >= -90 && value <= 90);
  }
});
