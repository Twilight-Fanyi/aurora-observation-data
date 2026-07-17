import { LOCATIONS } from './catalog.mjs';
import { validateSnapshot } from './contracts.mjs';
import {
  currentConfidence,
  darknessFactor,
  forecastConfidence,
  resolveLevel,
  scoreCurrent,
  scoreForecast,
  selectBestWindow
} from './score.mjs';
import { solarElevation } from './solar.mjs';
import { nearestOvation } from './upstreams.mjs';

const MINUTE_MS = 60000;
const HOUR_MS = 3600000;

function milliseconds(value, label) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(label + ' timestamp is invalid');
  }
  return parsed;
}

function assertFresh(label, timeUtc, nowMs, maxAgeMs, allowFuture = false) {
  const timeMs = milliseconds(timeUtc, label);
  if (!allowFuture && timeMs - nowMs > 10 * MINUTE_MS) {
    throw new Error(label + ' timestamp is too far in the future');
  }
  if (nowMs - timeMs > maxAgeMs) {
    throw new Error(label + ' data is stale');
  }
}

function assertFreshInputs(input, nowMs) {
  assertFresh(
    'current Kp',
    input.currentKp.intervalEndUtc ?? input.currentKp.timeUtc,
    nowMs,
    4 * HOUR_MS
  );
  assertFresh('Bz', input.bz.timeUtc, nowMs, 15 * MINUTE_MS);
  assertFresh('solar wind', input.solarWind.timeUtc, nowMs, 15 * MINUTE_MS);
  assertFresh('OVATION observation', input.ovation.observationTime, nowMs, 40 * MINUTE_MS);
  assertFresh('OVATION forecast', input.ovation.forecastTime, nowMs, 30 * MINUTE_MS, true);
  assertFresh('weather', input.fetchedAt, nowMs, 3 * HOUR_MS);
  if (!Array.isArray(input.kpForecast) ||
    !input.kpForecast.some((item) => milliseconds(item.timeUtc, 'Kp forecast') > nowMs)) {
    throw new Error('Kp forecast contains no future time slots');
  }
  if (!Array.isArray(input.weather) || input.weather.length !== LOCATIONS.length) {
    throw new Error('weather does not cover all approved locations');
  }
}

function closestByTime(values, targetMs, label) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(label + ' is empty');
  }
  let closest = values[0];
  let closestDistance = Math.abs(milliseconds(closest.timeUtc, label) - targetMs);
  for (let index = 1; index < values.length; index += 1) {
    const distance = Math.abs(milliseconds(values[index].timeUtc, label) - targetMs);
    if (distance < closestDistance) {
      closest = values[index];
      closestDistance = distance;
    }
  }
  return closest;
}

function forecastKpAt(values, targetMs, currentKp) {
  const sorted = values
    .slice()
    .sort((left, right) => milliseconds(left.timeUtc, 'Kp forecast') -
      milliseconds(right.timeUtc, 'Kp forecast'));
  let selected = currentKp;
  for (const item of sorted) {
    if (milliseconds(item.timeUtc, 'Kp forecast') <= targetMs) {
      selected = item.value;
    } else {
      break;
    }
  }
  return selected;
}

function reasons(input) {
  const values = [];
  if (darknessFactor(input.solarElevation) === 0) {
    values.push('daylight');
  }
  if (input.cloudCover >= 60) {
    values.push('high_cloud');
  }
  if (input.kp < input.referenceKp - 1.5) {
    values.push('kp_below_reference');
  }
  if (input.ovation < 10) {
    values.push('low_ovation');
  }
  if (input.bzGsm <= -5) {
    values.push('southward_bz');
  }
  if (input.cloudCover <= 20) {
    values.push('clear_sky');
  }
  if (darknessFactor(input.solarElevation) >= 0.85) {
    values.push('dark_now');
  }
  return values.slice(0, 3);
}

function olderTime(left, right) {
  return new Date(Math.min(milliseconds(left, 'source'), milliseconds(right, 'source')))
    .toISOString();
}

function buildLocation(input, location, nowMs, firstHourMs) {
  const weather = input.weather.find((item) => item.id === location.id);
  if (weather === undefined) {
    throw new Error('weather is missing for ' + location.id);
  }
  const currentWeather = closestByTime(weather.hourly, nowMs, 'weather hour');
  if (Math.abs(milliseconds(currentWeather.timeUtc, 'weather hour') - nowMs) > 3 * HOUR_MS) {
    throw new Error('weather hour is stale for ' + location.id);
  }
  const ovation = nearestOvation(input.ovation.grid, location);
  const currentSolarElevation = solarElevation(
    new Date(nowMs),
    location.latitude,
    location.longitude
  );
  const currentScore = scoreCurrent({
    ovation: ovation.aurora,
    currentKp: input.currentKp.value,
    referenceKp: location.referenceKp,
    bzGsm: input.bz.value,
    cloudCover: currentWeather.cloudCover,
    visibilityKm: currentWeather.visibilityKm,
    solarElevation: currentSolarElevation
  });
  const hourly = Array.from({ length: 12 }, (_, index) => {
    const targetMs = firstHourMs + index * HOUR_MS;
    const targetWeather = closestByTime(weather.hourly, targetMs, 'weather hour');
    if (Math.abs(milliseconds(targetWeather.timeUtc, 'weather hour') - targetMs) >
      90 * MINUTE_MS) {
      throw new Error('weather forecast has a gap for ' + location.id);
    }
    const kp = forecastKpAt(input.kpForecast, targetMs, input.currentKp.value);
    const elevation = solarElevation(
      new Date(targetMs),
      location.latitude,
      location.longitude
    );
    return {
      timeUtc: new Date(targetMs).toISOString(),
      localTime: targetWeather.localTime,
      score: scoreForecast({
        forecastKp: kp,
        referenceKp: location.referenceKp,
        cloudCover: targetWeather.cloudCover,
        visibilityKm: targetWeather.visibilityKm,
        solarElevation: elevation
      }),
      kp,
      cloudCover: targetWeather.cloudCover,
      visibilityKm: targetWeather.visibilityKm,
      darkness: darknessFactor(elevation),
      confidence: forecastConfidence({
        kpAvailable: true,
        weatherAvailable: true,
        hourOffset: index + 1
      })
    };
  });
  return {
    id: location.id,
    localTimeZone: location.timeZone,
    current: {
      score: currentScore,
      level: resolveLevel(currentScore),
      confidence: currentConfidence({
        ovationAvailable: true,
        ovationDistanceDegrees: ovation.distanceDegrees,
        kpAvailable: true,
        weatherAvailable: true,
        solarWindAvailable: true
      }),
      kp: input.currentKp.value,
      bzGsm: input.bz.value,
      solarWindKmS: input.solarWind.valueKmS,
      ovation: ovation.aurora,
      ovationDistanceDegrees: ovation.distanceDegrees,
      cloudCover: currentWeather.cloudCover,
      visibilityKm: currentWeather.visibilityKm,
      solarElevation: currentSolarElevation,
      reasonCodes: reasons({
        solarElevation: currentSolarElevation,
        cloudCover: currentWeather.cloudCover,
        kp: input.currentKp.value,
        referenceKp: location.referenceKp,
        ovation: ovation.aurora,
        bzGsm: input.bz.value
      })
    },
    hourly,
    bestWindow: selectBestWindow(hourly)
  };
}

export function buildSnapshot(input, now = new Date()) {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) {
    throw new Error('snapshot time is invalid');
  }
  assertFreshInputs(input, nowMs);
  const firstHourMs = Math.ceil(nowMs / HOUR_MS) * HOUR_MS;
  const snapshot = {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    sources: {
      kp: {
        observedAt: input.currentKp.intervalEndUtc ?? input.currentKp.timeUtc,
        status: 'fresh'
      },
      solarWind: {
        observedAt: olderTime(input.bz.timeUtc, input.solarWind.timeUtc),
        status: 'fresh'
      },
      ovation: {
        observedAt: input.ovation.forecastTime,
        status: 'fresh'
      },
      weather: {
        observedAt: input.fetchedAt,
        status: 'fresh'
      }
    },
    locations: LOCATIONS.map((location) =>
      buildLocation(input, location, nowMs, firstHourMs))
  };
  return validateSnapshot(snapshot);
}
