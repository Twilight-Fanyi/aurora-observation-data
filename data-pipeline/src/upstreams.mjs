import { LOCATIONS } from './catalog.mjs';

export const URLS = Object.freeze({
  kpCurrent: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
  kpForecast: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json',
  bz: 'https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json',
  speed: 'https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json',
  ovation: 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json',
  weather: 'https://api.open-meteo.com/v1/forecast'
});

function number(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(label + ' must be a finite number');
  }
  return parsed;
}

function timestamp(value, label) {
  const normalized = typeof value === 'string' &&
    !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value + 'Z' : value;
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(label + ' must be a valid timestamp');
  }
  return new Date(parsed).toISOString();
}

function lastByTime(values, timeField) {
  return values
    .slice()
    .sort((left, right) => Date.parse(left[timeField]) - Date.parse(right[timeField]))
    .at(-1);
}

export const WEATHER_BATCH_SIZE = 10;
const WEATHER_COORDINATE_TOLERANCE_DEGREES = 0.25;

export function weatherBatches(
  locations = LOCATIONS,
  batchSize = WEATHER_BATCH_SIZE
) {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error('weather batch size must be a positive integer');
  }
  const batches = [];
  for (let index = 0; index < locations.length; index += batchSize) {
    batches.push(locations.slice(index, index + batchSize));
  }
  return batches;
}

export function buildWeatherUrl(locations) {
  const url = new URL(URLS.weather);
  url.searchParams.set('latitude', locations.map((location) => location.latitude).join(','));
  url.searchParams.set('longitude', locations.map((location) => location.longitude).join(','));
  url.searchParams.set('hourly', 'cloud_cover,visibility');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '16');
  return url.toString();
}

export function buildWeatherUrls(locations = LOCATIONS) {
  return weatherBatches(locations).map((batch) => buildWeatherUrl(batch));
}

function weatherCoordinatesMatch(item, location) {
  const latitude = Number(item?.latitude);
  const longitude = Number(item?.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return false;
  }
  const latitudeDelta = Math.abs(latitude - location.latitude);
  const longitudeDelta = Math.abs(
    ((longitude - location.longitude + 540) % 360) - 180
  );
  return latitudeDelta <= WEATHER_COORDINATE_TOLERANCE_DEGREES &&
    longitudeDelta <= WEATHER_COORDINATE_TOLERANCE_DEGREES;
}

export function parseCurrentKp(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('current Kp response is empty');
  }
  const item = lastByTime(raw, 'time_tag');
  const timeUtc = timestamp(item.time_tag, 'current Kp time_tag');
  return {
    timeUtc,
    intervalEndUtc: new Date(Date.parse(timeUtc) + 3 * 60 * 60 * 1000).toISOString(),
    value: number(item.Kp, 'current Kp')
  };
}

export function parseKpForecast(raw) {
  if (!Array.isArray(raw)) {
    throw new Error('Kp forecast response must be an array');
  }
  const forecast = raw
    .filter((item) => item.observed === 'estimated' || item.observed === 'predicted')
    .map((item) => ({
      timeUtc: timestamp(item.time_tag, 'forecast Kp time_tag'),
      value: number(item.kp, 'forecast Kp')
    }))
    .sort((left, right) => Date.parse(left.timeUtc) - Date.parse(right.timeUtc));
  if (forecast.length === 0) {
    throw new Error('Kp forecast contains no estimated or predicted rows');
  }
  return forecast;
}

export function parseBz(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Bz response is empty');
  }
  const item = lastByTime(raw, 'time_tag');
  return {
    timeUtc: timestamp(item.time_tag, 'Bz time_tag'),
    value: number(item.bz_gsm, 'Bz')
  };
}

export function parseSolarWind(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('solar wind response is empty');
  }
  const item = lastByTime(raw, 'time_tag');
  return {
    timeUtc: timestamp(item.time_tag, 'solar wind time_tag'),
    valueKmS: number(item.proton_speed, 'solar wind speed')
  };
}

export function parseOvation(raw) {
  if (raw === null || typeof raw !== 'object' || !Array.isArray(raw.coordinates)) {
    throw new Error('OVATION response is malformed');
  }
  const grid = raw.coordinates.map((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length < 3) {
      throw new Error('OVATION coordinate is malformed');
    }
    return [
      number(coordinate[0], 'OVATION longitude'),
      number(coordinate[1], 'OVATION latitude'),
      number(coordinate[2], 'OVATION intensity')
    ];
  });
  if (grid.length === 0) {
    throw new Error('OVATION grid is empty');
  }
  return {
    observationTime: timestamp(raw['Observation Time'], 'OVATION observation time'),
    forecastTime: timestamp(raw['Forecast Time'], 'OVATION forecast time'),
    grid
  };
}

function localTimeToUtc(value, offsetSeconds) {
  const isoLocal = value.length === 16 ? value + ':00Z' : value + 'Z';
  const localAsUtc = Date.parse(isoLocal);
  if (!Number.isFinite(localAsUtc)) {
    throw new Error('weather time is invalid');
  }
  return new Date(localAsUtc - offsetSeconds * 1000).toISOString();
}

export function parseWeather(raw, locations = LOCATIONS) {
  if (!Array.isArray(raw) || raw.length !== locations.length) {
    throw new Error('weather response must match the approved location count');
  }
  return raw.map((item, locationIndex) => {
    const time = item?.hourly?.time;
    const cloud = item?.hourly?.cloud_cover;
    const visibility = item?.hourly?.visibility;
    if (!Array.isArray(time) ||
      !Array.isArray(cloud) ||
      !Array.isArray(visibility) ||
      time.length === 0 ||
      time.length !== cloud.length ||
      time.length !== visibility.length) {
      throw new Error('weather hourly arrays are malformed');
    }
    const offsetSeconds = number(item.utc_offset_seconds, 'weather UTC offset');
    return {
      id: locations[locationIndex].id,
      timeZone: item.timezone || locations[locationIndex].timeZone,
      hourly: time.map((localTime, hourIndex) => ({
        timeUtc: localTimeToUtc(localTime, offsetSeconds),
        localDate: localTime.slice(0, 10),
        localTime: localTime.slice(11, 16),
        cloudCover: number(cloud[hourIndex], 'cloud cover'),
        visibilityKm: number(visibility[hourIndex], 'visibility') / 1000
      }))
    };
  });
}

export function nearestOvation(grid, location) {
  let nearest = null;
  for (const coordinate of grid) {
    const longitudeDelta = Math.abs(
      ((coordinate[0] - location.longitude + 540) % 360) - 180
    );
    const latitudeDelta = coordinate[1] - location.latitude;
    const distanceDegrees = Math.hypot(longitudeDelta, latitudeDelta);
    if (nearest === null || distanceDegrees < nearest.distanceDegrees) {
      nearest = {
        longitude: coordinate[0],
        latitude: coordinate[1],
        aurora: coordinate[2],
        distanceDegrees
      };
    }
  }
  if (nearest === null) {
    throw new Error('OVATION grid is empty');
  }
  return nearest;
}

async function fetchJsonOnce(fetchFn, url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchFn(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'Aurora/1.0 public-data-pipeline'
      }
    });
    if (!response.ok) {
      throw new Error('HTTP ' + response.status + ' for ' + url);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(fetchFn, url) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetchJsonOnce(fetchFn, url);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function fetchWeather(fetchFn = fetch, locations = LOCATIONS) {
  const batches = weatherBatches(locations);
  const rawBatches = await Promise.all(
    batches.map((batch) => fetchJson(fetchFn, buildWeatherUrl(batch)))
  );
  const coordinatesMatch = rawBatches.every((raw, batchIndex) =>
    Array.isArray(raw) && raw.length === batches[batchIndex].length &&
    raw.every((item, itemIndex) =>
      weatherCoordinatesMatch(item, batches[batchIndex][itemIndex])));
  if (!coordinatesMatch) {
    throw new Error('weather response coordinates do not match requested catalog order');
  }
  const weather = rawBatches.flatMap((raw, index) =>
    parseWeather(raw, batches[index]));
  if (weather.length !== locations.length ||
    weather.some((item, index) => item.id !== locations[index].id)) {
    throw new Error('weather batches do not match approved catalog order');
  }
  return weather;
}

export async function fetchSpaceWeather(fetchFn = fetch) {
  const [currentKpRaw, kpForecastRaw, bzRaw, speedRaw, ovationRaw] =
    await Promise.all([
    fetchJson(fetchFn, URLS.kpCurrent),
    fetchJson(fetchFn, URLS.kpForecast),
    fetchJson(fetchFn, URLS.bz),
    fetchJson(fetchFn, URLS.speed),
    fetchJson(fetchFn, URLS.ovation)
  ]);
  return {
    currentKp: parseCurrentKp(currentKpRaw),
    kpForecast: parseKpForecast(kpForecastRaw),
    bz: parseBz(bzRaw),
    solarWind: parseSolarWind(speedRaw),
    ovation: parseOvation(ovationRaw)
  };
}

export async function fetchUpstreams(fetchFn = fetch, now = new Date()) {
  const [spaceWeather, weather] = await Promise.all([
    fetchSpaceWeather(fetchFn),
    fetchWeather(fetchFn)
  ]);
  return {
    fetchedAt: now.toISOString(),
    ...spaceWeather,
    weather
  };
}
