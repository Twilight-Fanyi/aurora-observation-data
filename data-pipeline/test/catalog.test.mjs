import test from 'node:test';
import assert from 'node:assert/strict';

import { LOCATIONS, LOCATION_IDS } from '../src/catalog.mjs';

test('catalog contains the approved 12 stable ids', () => {
  assert.equal(LOCATIONS.length, 12);
  assert.deepEqual(LOCATION_IDS, [
    'mohe-beiji',
    'genhe',
    'hemu',
    'tromso',
    'abisko',
    'rovaniemi',
    'thingvellir',
    'fairbanks',
    'yellowknife',
    'whitehorse',
    'lake-tekapo',
    'cradle-mountain'
  ]);
  assert.equal(new Set(LOCATION_IDS).size, 12);
});

test('catalog carries coordinates, timezone, hemisphere, and reference Kp', () => {
  for (const location of LOCATIONS) {
    assert.ok(location.latitude >= -90 && location.latitude <= 90);
    assert.ok(location.longitude >= -180 && location.longitude <= 180);
    assert.match(location.timeZone, /^[A-Za-z_]+\/[A-Za-z_]+$/);
    assert.ok(location.referenceKp >= 0 && location.referenceKp <= 9);
    assert.equal(location.hemisphere, location.latitude < 0 ? 'south' : 'north');
  }
});
