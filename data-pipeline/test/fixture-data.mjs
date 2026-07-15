import { LOCATIONS } from '../src/catalog.mjs';

function localTime(timeUtc, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(timeUtc));
}

export function makeNormalizedInput(
  now = new Date('2026-01-15T12:10:00Z'),
  options = {}
) {
  const nowMs = now.getTime();
  const hourMs = 3600000;
  const startMs = Math.floor(nowMs / hourMs) * hourMs - 2 * hourMs;
  const cloudCover = options.cloudCover ?? 10;
  const visibilityKm = options.visibilityKm ?? 30;

  return {
    fetchedAt: now.toISOString(),
    currentKp: {
      timeUtc: new Date(nowMs - 10 * 60000).toISOString(),
      value: options.currentKp ?? 8.3
    },
    kpForecast: [1, 4, 7, 10, 13].map((offset) => ({
      timeUtc: new Date(Math.ceil(nowMs / hourMs) * hourMs + (offset - 1) * hourMs).toISOString(),
      value: options.forecastKp ?? 8
    })),
    bz: {
      timeUtc: new Date(nowMs - 5 * 60000).toISOString(),
      value: options.bzGsm ?? -15
    },
    solarWind: {
      timeUtc: new Date(nowMs - 5 * 60000).toISOString(),
      valueKmS: options.solarWindKmS ?? 690
    },
    ovation: {
      observationTime: new Date(nowMs - 10 * 60000).toISOString(),
      forecastTime: new Date(nowMs + 20 * 60000).toISOString(),
      grid: LOCATIONS.map((location) => [
        location.longitude,
        location.latitude,
        options.ovation ?? 35
      ])
    },
    weather: LOCATIONS.map((location) => ({
      id: location.id,
      timeZone: location.timeZone,
      hourly: Array.from({ length: 48 }, (_, index) => {
        const timeUtc = new Date(startMs + index * hourMs).toISOString();
        return {
          timeUtc,
          localTime: localTime(timeUtc, location.timeZone),
          cloudCover,
          visibilityKm
        };
      })
    }))
  };
}
