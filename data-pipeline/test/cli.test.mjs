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
  return async (url) => {
    const key = String(url);
    const value = key.startsWith(URLS.weather) ? raw.weather : raw.responses.get(key);
    if (value === undefined) {
      return new Response('not found', { status: 404 });
    }
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };
}

async function readPublicFiles(outputDir) {
  return {
    catalog: await readFile(join(outputDir, 'catalog.json'), 'utf8'),
    manifest: await readFile(join(outputDir, 'manifest.json'), 'utf8'),
    snapshot: await readFile(join(outputDir, 'snapshot.json'), 'utf8')
  };
}

test('publishes a validated atomic artifact with exact hash and freshness times', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aurora-publish-'));
  const outputDir = join(root, 'v1');
  const now = new Date('2026-01-15T12:10:00Z');
  try {
    const result = await runPipeline({
      fetchFn: fakeFetch(now),
      now,
      outputDir,
      previousDir: outputDir
    });
    const files = await readPublicFiles(outputDir);
    const manifest = JSON.parse(files.manifest);
    const snapshot = JSON.parse(files.snapshot);

    assert.equal(result.status, 'published');
    assert.equal(snapshot.locations.length, 12);
    assert.equal(manifest.generatedAt, now.toISOString());
    assert.equal(manifest.staleAt, '2026-01-15T12:30:00.000Z');
    assert.equal(manifest.expiresAt, '2026-01-15T18:10:00.000Z');
    assert.equal(
      manifest.snapshotSha256,
      createHash('sha256').update(files.snapshot).digest('hex')
    );
    assert.ok(Buffer.byteLength(files.snapshot) < 100000);
    await assert.doesNotReject(() => verifyPublishedArtifacts(outputDir));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('keeps an existing publication byte-for-byte when a required source fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aurora-previous-'));
  const outputDir = join(root, 'v1');
  const now = new Date('2026-01-15T12:10:00Z');
  try {
    await runPipeline({ fetchFn: fakeFetch(now), now, outputDir, previousDir: outputDir });
    const before = await readPublicFiles(outputDir);
    const result = await runPipeline({
      fetchFn: fakeFetch(new Date(now.getTime() + 10 * 60 * 1000), true),
      now: new Date(now.getTime() + 10 * 60 * 1000),
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
    }), /weather response/);
    await assert.rejects(() => readdir(outputDir), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
