import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LOCATIONS } from '../src/catalog.mjs';
import { runPipeline, verifyPublishedArtifacts } from '../src/cli.mjs';
import { URLS } from '../src/upstreams.mjs';
import { makeNormalizedInput } from './fixture-data.mjs';

function rawResponses(now, malformedWeather = false) {
  const input = makeNormalizedInput(now);
  const threeHoursMs = 3 * 60 * 60 * 1000;
  const intervalEndMs = Math.floor(now.getTime() / threeHoursMs) * threeHoursMs;
  const intervalStart = new Date(intervalEndMs - threeHoursMs).toISOString();
  const responses = new Map([
    [URLS.kpCurrent, [{ time_tag: intervalStart.slice(0, 19), Kp: input.currentKp.value }]],
    [URLS.kpForecast, input.kpForecast.map((item) => ({
      time_tag: item.timeUtc.slice(0, 19),
      kp: item.value,
      observed: 'predicted'
    }))],
    [URLS.bz, [{ time_tag: input.bz.timeUtc, bz_gsm: input.bz.value }]],
    [URLS.speed, [{
      time_tag: input.solarWind.timeUtc,
      proton_speed: input.solarWind.valueKmS
    }]],
    [URLS.ovation, {
      'Observation Time': input.ovation.observationTime,
      'Forecast Time': input.ovation.forecastTime,
      coordinates: input.ovation.grid
    }]
  ]);
  const weather = malformedWeather ? [] : input.weather.map((item, index) => ({
    latitude: LOCATIONS[index].latitude,
    longitude: LOCATIONS[index].longitude,
    timezone: LOCATIONS[index].timeZone,
    utc_offset_seconds: 0,
    hourly: {
      time: item.hourly.map((hour) => hour.timeUtc.slice(0, 16)),
      cloud_cover: item.hourly.map((hour) => hour.cloudCover),
      visibility: item.hourly.map((hour) => hour.visibilityKm * 1000)
    }
  }));
  return { responses, weather };
}

function fakeFetch(now, malformedWeather = false) {
  const raw = rawResponses(now, malformedWeather);
  let weatherCalls = 0;
  const fetchFn = async (url) => {
    const key = String(url);
    if (key.startsWith(URLS.weather)) {
      weatherCalls += 1;
      const requested = new URL(key).searchParams.get('latitude')
        .split(',').map(Number);
      const rows = requested.map((latitude) => {
        const locationIndex = LOCATIONS.findIndex(
          (location) => location.latitude === latitude
        );
        if (locationIndex < 0) {
          throw new Error('test requested an unknown latitude');
        }
        return raw.weather[locationIndex];
      });
      return new Response(JSON.stringify(rows), {
        status: malformedWeather ? 503 : 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    const value = raw.responses.get(key);
    if (value === undefined) {
      return new Response('not found', { status: 404 });
    }
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };
  Object.defineProperty(fetchFn, 'weatherCalls', {
    get: () => weatherCalls
  });
  return fetchFn;
}

async function readPublicFiles(outputDir) {
  return {
    catalog: await readFile(join(outputDir, 'catalog.json'), 'utf8'),
    manifest: await readFile(join(outputDir, 'manifest.json'), 'utf8'),
    snapshot: await readFile(join(outputDir, 'snapshot.json'), 'utf8'),
    weather: await readFile(join(outputDir, 'weather.json'), 'utf8')
  };
}

test('publishes a validated atomic artifact with exact hash and freshness times', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aurora-publish-'));
  const outputDir = join(root, 'v1');
  const now = new Date('2026-01-15T12:10:00Z');
  try {
    const fetchFn = fakeFetch(now);
    const result = await runPipeline({
      fetchFn,
      now,
      outputDir,
      previousDir: outputDir
    });
    const files = await readPublicFiles(outputDir);
    const manifest = JSON.parse(files.manifest);
    const snapshot = JSON.parse(files.snapshot);
    const weather = JSON.parse(files.weather);

    assert.equal(result.status, 'published');
    assert.equal(fetchFn.weatherCalls, 5);
    assert.equal(snapshot.locations.length, 50);
    assert.equal(weather.fetchedAt, now.toISOString());
    assert.equal(snapshot.sources.weather.observedAt, weather.fetchedAt);
    assert.equal(manifest.generatedAt, now.toISOString());
    assert.equal(manifest.staleAt, '2026-01-15T12:30:00.000Z');
    assert.equal(manifest.expiresAt, '2026-01-15T18:10:00.000Z');
    assert.equal(
      manifest.snapshotSha256,
      createHash('sha256').update(files.snapshot).digest('hex')
    );
    assert.ok(Buffer.byteLength(files.snapshot) < 256 * 1024);
    await assert.doesNotReject(() => verifyPublishedArtifacts(outputDir));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reuses weather younger than fifteen minutes while publishing fresh NOAA data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aurora-previous-'));
  const outputDir = join(root, 'v1');
  const now = new Date('2026-01-15T12:10:00Z');
  try {
    await runPipeline({ fetchFn: fakeFetch(now), now, outputDir, previousDir: outputDir });
    const nextNow = new Date(now.getTime() + 10 * 60 * 1000);
    const fetchFn = fakeFetch(nextNow, true);
    const result = await runPipeline({
      fetchFn,
      now: nextNow,
      outputDir,
      previousDir: outputDir
    });
    const files = await readPublicFiles(outputDir);
    const snapshot = JSON.parse(files.snapshot);
    const weather = JSON.parse(files.weather);

    assert.equal(result.status, 'published');
    assert.equal(result.generatedAt, nextNow.toISOString());
    assert.equal(fetchFn.weatherCalls, 0);
    assert.equal(weather.fetchedAt, now.toISOString());
    assert.equal(snapshot.sources.weather.observedAt, now.toISOString());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('refreshes weather at the fifteen-minute boundary', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aurora-refresh-'));
  const outputDir = join(root, 'v1');
  const now = new Date('2026-01-15T12:10:00Z');
  try {
    await runPipeline({ fetchFn: fakeFetch(now), now, outputDir, previousDir: outputDir });
    const nextNow = new Date(now.getTime() + 15 * 60 * 1000);
    const fetchFn = fakeFetch(nextNow);
    const result = await runPipeline({ fetchFn, now: nextNow, outputDir, previousDir: outputDir });
    const files = await readPublicFiles(outputDir);

    assert.equal(result.status, 'published');
    assert.equal(fetchFn.weatherCalls, 5);
    assert.equal(JSON.parse(files.weather).fetchedAt, nextNow.toISOString());
    assert.equal(
      JSON.parse(files.snapshot).sources.weather.observedAt,
      nextNow.toISOString()
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('publishes with cached weather when a due refresh fails within three hours', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aurora-weather-fallback-'));
  const outputDir = join(root, 'v1');
  const now = new Date('2026-01-15T12:10:00Z');
  try {
    await runPipeline({ fetchFn: fakeFetch(now), now, outputDir, previousDir: outputDir });
    const nextNow = new Date(now.getTime() + 15 * 60 * 1000);
    const result = await runPipeline({
      fetchFn: fakeFetch(nextNow, true),
      now: nextNow,
      outputDir,
      previousDir: outputDir
    });
    const files = await readPublicFiles(outputDir);

    assert.equal(result.status, 'published');
    assert.equal(result.generatedAt, nextNow.toISOString());
    assert.equal(JSON.parse(files.weather).fetchedAt, now.toISOString());
    assert.equal(
      JSON.parse(files.snapshot).sources.weather.observedAt,
      now.toISOString()
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('keeps every published file unchanged when weather is expired and unavailable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aurora-weather-expired-'));
  const outputDir = join(root, 'v1');
  const now = new Date('2026-01-15T12:10:00Z');
  try {
    await runPipeline({ fetchFn: fakeFetch(now), now, outputDir, previousDir: outputDir });
    const before = await readPublicFiles(outputDir);
    const nextNow = new Date(now.getTime() + 3 * 60 * 60 * 1000 + 1);
    const result = await runPipeline({
      fetchFn: fakeFetch(nextNow, true),
      now: nextNow,
      outputDir,
      previousDir: outputDir
    });

    assert.deepEqual(result, {
      status: 'kept-previous',
      generatedAt: now.toISOString()
    });
    assert.deepEqual(await readPublicFiles(outputDir), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('does not expose partial files when the first publication fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aurora-failed-'));
  const outputDir = join(root, 'v1');
  const now = new Date('2026-01-15T12:10:00Z');
  try {
    await assert.rejects(() => runPipeline({
      fetchFn: fakeFetch(now, true),
      now,
      outputDir,
      previousDir: outputDir
    }), /HTTP 503/);
    await assert.rejects(() => readdir(outputDir), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
