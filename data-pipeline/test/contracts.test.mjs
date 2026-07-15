import test from 'node:test';
import assert from 'node:assert/strict';

import { LOCATIONS } from '../src/catalog.mjs';
import {
  validateCatalog,
  validateManifest,
  validateSnapshot
} from '../src/contracts.mjs';

function source(observedAt = '2026-07-14T13:30:00Z') {
  return { observedAt, status: 'fresh' };
}

function hourly(index) {
  return {
    timeUtc: new Date(Date.parse('2026-07-14T14:00:00Z') + index * 3600000).toISOString(),
    localTime: String((22 + index) % 24).padStart(2, '0') + ':00',
    score: 72,
    kp: 7,
    cloudCover: 13,
    visibilityKm: 25,
    darkness: 1,
    confidence: 80
  };
}

function location(locationDefinition) {
  return {
    id: locationDefinition.id,
    localTimeZone: locationDefinition.timeZone,
    current: {
      score: 72,
      level: 'active',
      confidence: 80,
      kp: 7,
      bzGsm: -9,
      solarWindKmS: 520,
      ovation: 32,
      ovationDistanceDegrees: 0.5,
      cloudCover: 13,
      visibilityKm: 25,
      solarElevation: -18,
      reasonCodes: ['dark_now', 'southward_bz']
    },
    hourly: Array.from({ length: 12 }, (_, index) => hourly(index)),
    bestWindow: {
      startUtc: '2026-07-14T14:00:00Z',
      endUtc: '2026-07-14T16:00:00Z'
    }
  };
}

function snapshot() {
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-14T13:30:00Z',
    sources: {
      kp: source(),
      solarWind: source(),
      ovation: source(),
      weather: source()
    },
    locations: LOCATIONS.map(location)
  };
}

test('accepts the version one catalog, manifest, and snapshot contracts', () => {
  assert.doesNotThrow(() => validateCatalog({
    schemaVersion: 1,
    sources: [
      {
        id: 'noaa-swpc',
        name: 'NOAA Space Weather Prediction Center',
        url: 'https://www.swpc.noaa.gov/'
      },
      {
        id: 'open-meteo',
        name: 'Open-Meteo',
        url: 'https://open-meteo.com/'
      }
    ],
    locations: LOCATIONS
  }));
  assert.doesNotThrow(() => validateManifest({
    schemaVersion: 1,
    generatedAt: '2026-07-14T13:30:00Z',
    staleAt: '2026-07-14T13:50:00Z',
    expiresAt: '2026-07-14T19:30:00Z',
    snapshotSha256: 'a'.repeat(64),
    snapshotPath: '/v1/snapshot.json'
  }));
  assert.doesNotThrow(() => validateSnapshot(snapshot()));
});

test('rejects incomplete, oversized, and out-of-range snapshots', () => {
  const elevenLocations = snapshot();
  elevenLocations.locations.pop();
  assert.throws(() => validateSnapshot(elevenLocations), /snapshot invalid/);

  const thirteenHours = snapshot();
  thirteenHours.locations[0].hourly.push(hourly(12));
  assert.throws(() => validateSnapshot(thirteenHours), /snapshot invalid/);

  const fourReasons = snapshot();
  fourReasons.locations[0].current.reasonCodes =
    ['dark_now', 'southward_bz', 'clear_sky', 'low_ovation'];
  assert.throws(() => validateSnapshot(fourReasons), /snapshot invalid/);

  const invalidScore = snapshot();
  invalidScore.locations[0].current.score = 101;
  assert.throws(() => validateSnapshot(invalidScore), /snapshot invalid/);
});
