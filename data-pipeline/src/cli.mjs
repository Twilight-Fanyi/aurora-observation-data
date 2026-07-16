import { createHash, randomUUID } from 'node:crypto';
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile
} from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { LOCATIONS } from './catalog.mjs';
import {
  validateCatalog,
  validateManifest,
  validateSnapshot
} from './contracts.mjs';
import { buildSnapshot } from './build-snapshot.mjs';
import { fetchSpaceWeather, fetchWeather } from './upstreams.mjs';
import {
  resolveWeatherCache,
  validateWeatherCache
} from './weather-cache.mjs';

const MINUTE_MS = 60000;
const HOUR_MS = 3600000;
const MAX_SNAPSHOT_BYTES = 256 * 1024;
const DEFAULT_OUTPUT_DIR = fileURLToPath(new URL('../../public/v1', import.meta.url));

const SOURCES = Object.freeze([
  Object.freeze({
    id: 'noaa-swpc',
    name: 'NOAA Space Weather Prediction Center',
    url: 'https://www.swpc.noaa.gov/'
  }),
  Object.freeze({
    id: 'open-meteo',
    name: 'Open-Meteo',
    url: 'https://open-meteo.com/'
  })
]);

function serialize(value) {
  return JSON.stringify(value) + '\n';
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(label + ' is not valid JSON');
  }
}

function validatePublicationTexts(catalogText, manifestText, snapshotText, weatherText) {
  if (Buffer.byteLength(snapshotText) >= MAX_SNAPSHOT_BYTES) {
    throw new Error('snapshot must be smaller than 262144 bytes');
  }
  const catalog = validateCatalog(parseJson(catalogText, 'catalog'));
  const manifest = validateManifest(parseJson(manifestText, 'manifest'));
  const snapshot = validateSnapshot(parseJson(snapshotText, 'snapshot'));
  const weather = validateWeatherCache(
    parseJson(weatherText, 'weather'),
    new Date(snapshot.generatedAt)
  );
  if (manifest.generatedAt !== snapshot.generatedAt) {
    throw new Error('manifest and snapshot generatedAt differ');
  }
  if (manifest.snapshotSha256 !== sha256(snapshotText)) {
    throw new Error('snapshot SHA-256 mismatch');
  }
  if (snapshot.sources.weather.observedAt !== weather.fetchedAt) {
    throw new Error('snapshot and weather fetchedAt differ');
  }
  return { catalog, manifest, snapshot, weather };
}

export async function verifyPublishedArtifacts(outputDir = DEFAULT_OUTPUT_DIR) {
  const [catalogText, manifestText, snapshotText, weatherText] = await Promise.all([
    readFile(resolve(outputDir, 'catalog.json'), 'utf8'),
    readFile(resolve(outputDir, 'manifest.json'), 'utf8'),
    readFile(resolve(outputDir, 'snapshot.json'), 'utf8'),
    readFile(resolve(outputDir, 'weather.json'), 'utf8')
  ]);
  return validatePublicationTexts(catalogText, manifestText, snapshotText, weatherText);
}

async function readPreviousWeather(previousDir) {
  try {
    return parseJson(
      await readFile(resolve(previousDir, 'weather.json'), 'utf8'),
      'previous weather'
    );
  } catch {
    return undefined;
  }
}

async function validPrevious(previousDir, now) {
  try {
    const [manifestText, snapshotText] = await Promise.all([
      readFile(resolve(previousDir, 'manifest.json'), 'utf8'),
      readFile(resolve(previousDir, 'snapshot.json'), 'utf8')
    ]);
    const manifest = validateManifest(parseJson(manifestText, 'previous manifest'));
    const snapshot = validateSnapshot(parseJson(snapshotText, 'previous snapshot'));
    const ageMs = now.getTime() - Date.parse(manifest.generatedAt);
    if (manifest.generatedAt !== snapshot.generatedAt ||
      manifest.snapshotSha256 !== sha256(snapshotText) ||
      ageMs < 0 || ageMs > 6 * HOUR_MS ||
      now.getTime() > Date.parse(manifest.expiresAt)) {
      return undefined;
    }
    return manifest;
  } catch {
    return undefined;
  }
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function replaceDirectory(stagingDir, outputDir) {
  const backupDir = outputDir + '.backup-' + randomUUID();
  const hadOutput = await pathExists(outputDir);
  if (hadOutput) {
    await rename(outputDir, backupDir);
  }
  try {
    await rename(stagingDir, outputDir);
  } catch (error) {
    if (hadOutput) {
      await rename(backupDir, outputDir);
    }
    throw error;
  }
  if (hadOutput) {
    await rm(backupDir, { recursive: true, force: true });
  }
}

async function publish(
  outputDir,
  catalogText,
  manifestText,
  snapshotText,
  weatherText
) {
  const stagingDir = outputDir + '.staging-' + randomUUID();
  await mkdir(dirname(outputDir), { recursive: true });
  await mkdir(stagingDir);
  try {
    await Promise.all([
      writeFile(resolve(stagingDir, '.gitkeep'), ''),
      writeFile(resolve(stagingDir, 'catalog.json'), catalogText),
      writeFile(resolve(stagingDir, 'manifest.json'), manifestText),
      writeFile(resolve(stagingDir, 'snapshot.json'), snapshotText),
      writeFile(resolve(stagingDir, 'weather.json'), weatherText)
    ]);
    await verifyPublishedArtifacts(stagingDir);
    await replaceDirectory(stagingDir, outputDir);
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
}

export async function runPipeline(options = {}) {
  const fetchFn = options.fetchFn ?? fetch;
  const now = options.now ?? new Date();
  const outputDir = resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR);
  const previousDir = resolve(options.previousDir ?? outputDir);
  let snapshot;
  let weatherCache;
  try {
    const spaceWeather = await fetchSpaceWeather(fetchFn);
    const previousWeather = await readPreviousWeather(previousDir);
    const weatherResult = await resolveWeatherCache({
      previous: previousWeather,
      now,
      fetchWeatherFn: () => fetchWeather(fetchFn)
    });
    weatherCache = weatherResult.cache;
    const input = {
      fetchedAt: weatherCache.fetchedAt,
      ...spaceWeather,
      weather: weatherCache.locations
    };
    snapshot = buildSnapshot(input, now);
  } catch (error) {
    const previous = await validPrevious(previousDir, now);
    if (previous !== undefined) {
      return { status: 'kept-previous', generatedAt: previous.generatedAt };
    }
    throw error;
  }

  const catalogText = serialize({
    schemaVersion: 1,
    sources: SOURCES,
    locations: LOCATIONS
  });
  const snapshotText = serialize(snapshot);
  const manifest = {
    schemaVersion: 1,
    generatedAt: snapshot.generatedAt,
    staleAt: new Date(now.getTime() + 20 * MINUTE_MS).toISOString(),
    expiresAt: new Date(now.getTime() + 6 * HOUR_MS).toISOString(),
    snapshotSha256: sha256(snapshotText),
    snapshotPath: '/v1/snapshot.json'
  };
  const manifestText = serialize(manifest);
  const weatherText = serialize(weatherCache);
  validatePublicationTexts(catalogText, manifestText, snapshotText, weatherText);
  await publish(outputDir, catalogText, manifestText, snapshotText, weatherText);
  return {
    status: 'published',
    generatedAt: snapshot.generatedAt,
    snapshotBytes: Buffer.byteLength(snapshotText)
  };
}

function parseArguments(argv) {
  const result = {
    verifyOnly: false,
    outputDir: DEFAULT_OUTPUT_DIR,
    previousDir: undefined
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--verify-only') {
      result.verifyOnly = true;
    } else if (argument === '--output' || argument === '--previous') {
      const value = argv[index + 1];
      if (value === undefined) {
        throw new Error(argument + ' requires a directory');
      }
      if (argument === '--output') {
        result.outputDir = resolve(value);
      } else {
        result.previousDir = resolve(value);
      }
      index += 1;
    } else {
      throw new Error('unknown argument: ' + argument);
    }
  }
  return result;
}

async function main() {
  const argumentsValue = parseArguments(process.argv.slice(2));
  if (argumentsValue.verifyOnly) {
    const verified = await verifyPublishedArtifacts(argumentsValue.outputDir);
    console.log(JSON.stringify({
      status: 'verified',
      generatedAt: verified.snapshot.generatedAt,
      locations: verified.snapshot.locations.length
    }));
    return;
  }
  const result = await runPipeline({
    outputDir: argumentsValue.outputDir,
    previousDir: argumentsValue.previousDir
  });
  console.log(JSON.stringify(result));
}

if (process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
