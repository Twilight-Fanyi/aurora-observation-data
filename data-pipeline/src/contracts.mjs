import { readFileSync } from 'node:fs';

import Ajv from 'ajv';

import { LOCATION_IDS } from './catalog.mjs';

function loadSchema(name) {
  return JSON.parse(readFileSync(new URL('../schema/' + name, import.meta.url), 'utf8'));
}

const ajv = new Ajv({ allErrors: true, strict: true });
const catalogValidator = ajv.compile(loadSchema('catalog.schema.json'));
const manifestValidator = ajv.compile(loadSchema('manifest.schema.json'));
const snapshotValidator = ajv.compile(loadSchema('snapshot.schema.json'));

function run(validator, value, label) {
  if (!validator(value)) {
    throw new Error(label + ' invalid: ' + ajv.errorsText(validator.errors));
  }
  return value;
}

function assertApprovedLocationOrder(locations, label) {
  for (let index = 0; index < LOCATION_IDS.length; index += 1) {
    if (locations[index]?.id !== LOCATION_IDS[index]) {
      throw new Error(label + ' invalid: location ids must match the approved catalog order');
    }
  }
}

function validTime(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function validateCatalog(value) {
  const catalog = run(catalogValidator, value, 'catalog');
  assertApprovedLocationOrder(catalog.locations, 'catalog');
  return catalog;
}

export function validateManifest(value) {
  const manifest = run(manifestValidator, value, 'manifest');
  if (!validTime(manifest.generatedAt) ||
    !validTime(manifest.staleAt) ||
    !validTime(manifest.expiresAt) ||
    Date.parse(manifest.generatedAt) >= Date.parse(manifest.staleAt) ||
    Date.parse(manifest.staleAt) >= Date.parse(manifest.expiresAt)) {
    throw new Error('manifest invalid: freshness timestamps are not ordered');
  }
  return manifest;
}

export function validateSnapshot(value) {
  const snapshot = run(snapshotValidator, value, 'snapshot');
  assertApprovedLocationOrder(snapshot.locations, 'snapshot');
  if (!validTime(snapshot.generatedAt)) {
    throw new Error('snapshot invalid: generatedAt is not a UTC timestamp');
  }
  return snapshot;
}
