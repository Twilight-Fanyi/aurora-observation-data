import test from 'node:test';
import assert from 'node:assert/strict';

import {
  currentConfidence,
  darknessFactor,
  forecastConfidence,
  resolveLevel,
  scoreCurrent,
  scoreForecast,
  selectBestWindow,
  skyFactor
} from '../src/score.mjs';

test('darkness and sky factors preserve the approved boundaries', () => {
  assert.equal(darknessFactor(-5.9), 0);
  assert.equal(darknessFactor(-12), 0.5);
  assert.equal(darknessFactor(-18), 1);
  assert.equal(skyFactor(0, 30), 1);
  assert.equal(skyFactor(100, 2), 0);
});

test('current score combines OVATION, Kp, southward Bz, sky, and darkness', () => {
  assert.equal(scoreCurrent({
    ovation: 40,
    currentKp: 7.5,
    referenceKp: 7,
    bzGsm: -12,
    cloudCover: 0,
    visibilityKm: 30,
    solarElevation: -18
  }), 100);

  assert.equal(scoreCurrent({
    ovation: 40,
    currentKp: 9,
    referenceKp: 2,
    bzGsm: -20,
    cloudCover: 0,
    visibilityKm: 30,
    solarElevation: 2
  }), 0);
});

test('forecast score does not extend current Bz or OVATION', () => {
  assert.equal(scoreForecast({
    forecastKp: 7.5,
    referenceKp: 7,
    cloudCover: 0,
    visibilityKm: 30,
    solarElevation: -18
  }), 100);
  assert.equal(scoreForecast({
    forecastKp: 7.5,
    referenceKp: 7,
    cloudCover: 100,
    visibilityKm: 2,
    solarElevation: -18
  }), 0);
});

test('activity level boundaries are stable', () => {
  assert.deepEqual(
    [0, 19, 20, 44, 45, 74, 75, 100].map(resolveLevel),
    ['quiet', 'quiet', 'faint', 'faint', 'active', 'active', 'storm', 'storm']
  );
});

test('confidence reflects source coverage, OVATION distance, and forecast horizon', () => {
  assert.equal(currentConfidence({
    ovationAvailable: true,
    ovationDistanceDegrees: 0.5,
    kpAvailable: true,
    weatherAvailable: true,
    solarWindAvailable: true
  }), 100);
  assert.equal(currentConfidence({
    ovationAvailable: true,
    ovationDistanceDegrees: 2,
    kpAvailable: true,
    weatherAvailable: true,
    solarWindAvailable: true
  }), 85);
  assert.equal(forecastConfidence({
    kpAvailable: true,
    weatherAvailable: true,
    hourOffset: 12
  }), 70);
});

test('best window chooses the earliest highest-scoring run of at least two hours', () => {
  const scores = [8, 22, 62, 80, 80, 45, 12, 80, 80, 30, 10, 4];
  const hourly = scores.map((score, index) => ({
    timeUtc: new Date(Date.parse('2026-07-14T12:00:00Z') + index * 3600000).toISOString(),
    score
  }));
  assert.deepEqual(selectBestWindow(hourly), {
    startUtc: '2026-07-14T15:00:00.000Z',
    endUtc: '2026-07-14T16:00:00.000Z'
  });
  assert.equal(selectBestWindow(hourly.map((hour) => ({ ...hour, score: 19 }))), null);
});
