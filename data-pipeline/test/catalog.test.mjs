import test from 'node:test';
import assert from 'node:assert/strict';

import { LOCATIONS, LOCATION_IDS } from '../src/catalog.mjs';

const EXPECTED_IDS = [
  'mohe-beiji', 'genhe', 'hemu', 'rikubetsu',
  'tromso', 'alta', 'lofoten', 'senja', 'lyngen', 'kirkenes',
  'north-cape', 'longyearbyen',
  'abisko', 'kiruna-jukkasjarvi', 'jokkmokk', 'lulea',
  'rovaniemi', 'inari', 'saariselka-ivalo', 'kilpisjarvi', 'levi',
  'thingvellir', 'snaefellsnes-kirkjufell', 'myvatn-akureyri',
  'jokulsarlon-south-coast',
  'ilulissat', 'kangerlussuaq', 'nuuk', 'murmansk', 'teriberka',
  'yellowknife', 'whitehorse', 'churchill', 'inuvik', 'iqaluit',
  'dawson-city',
  'fairbanks', 'coldfoot-wiseman', 'nome', 'utqiagvik',
  'anchorage-girdwood',
  'shetland', 'orkney', 'lewis-harris',
  'lake-tekapo', 'stewart-island', 'dunedin-catlins',
  'cradle-mountain', 'hobart-mount-wellington', 'bruny-island'
];

test('catalog contains the approved 50 stable ids', () => {
  assert.equal(LOCATIONS.length, 50);
  assert.deepEqual(LOCATION_IDS, EXPECTED_IDS);
  assert.equal(new Set(LOCATION_IDS).size, 50);
});

test('catalog time zones are supported by the runtime', () => {
  for (const location of LOCATIONS) {
    assert.doesNotThrow(() => new Intl.DateTimeFormat('en-GB', {
      timeZone: location.timeZone
    }).format(new Date('2026-01-15T12:00:00Z')));
  }
});

test('catalog carries coordinates, timezone, hemisphere, reference Kp, and sort order', () => {
  for (const [index, location] of LOCATIONS.entries()) {
    assert.ok(location.latitude >= -90 && location.latitude <= 90);
    assert.ok(location.longitude >= -180 && location.longitude <= 180);
    assert.match(location.timeZone, /^[A-Za-z_]+\/[A-Za-z_]+$/);
    assert.ok(location.referenceKp >= 0 && location.referenceKp <= 9);
    assert.equal(location.hemisphere, location.latitude < 0 ? 'south' : 'north');
    assert.equal(location.sortOrder, index);
  }
});
