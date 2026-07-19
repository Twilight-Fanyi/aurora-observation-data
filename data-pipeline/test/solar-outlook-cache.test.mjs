import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SOLAR_OUTLOOK_REFRESH_MS,
  createSolarOutlookCache,
  resolveSolarOutlookCache
} from '../src/solar-outlook-cache.mjs';

function outlook(start = '2026-07-13T00:00:00Z') {
  const startMs = Date.parse(start);
  return {
    issuedAt: '2026-07-13T22:56:00Z',
    days: Array.from({ length: 27 }, (_, index) => ({
      dateUtc: new Date(startMs + index * 86400000).toISOString().slice(0, 10),
      radioFlux: 110 + index,
      planetaryA: 5 + index % 12,
      maxKp: 2 + index % 4
    }))
  };
}

test('reuses the 27-day outlook for twenty-four hours', async () => {
  const fetchedAt = '2026-07-14T00:00:00Z';
  const previous = createSolarOutlookCache(outlook(), fetchedAt);
  let calls = 0;
  const result = await resolveSolarOutlookCache({
    previous,
    now: new Date(Date.parse(fetchedAt) + SOLAR_OUTLOOK_REFRESH_MS - 1),
    fetchOutlookFn: async () => {
      calls += 1;
      return outlook();
    }
  });

  assert.equal(calls, 0);
  assert.equal(result.fetchedAt, fetchedAt);
});

test('refreshes a due 27-day outlook and reuses a valid cache on failure', async () => {
  const fetchedAt = '2026-07-14T00:00:00Z';
  const previous = createSolarOutlookCache(outlook(), fetchedAt);
  const due = new Date(Date.parse(fetchedAt) + SOLAR_OUTLOOK_REFRESH_MS);
  const refreshed = await resolveSolarOutlookCache({
    previous,
    now: due,
    fetchOutlookFn: async () => outlook('2026-07-14T00:00:00Z')
  });
  const fallback = await resolveSolarOutlookCache({
    previous,
    now: due,
    fetchOutlookFn: async () => { throw new Error('offline'); }
  });

  assert.equal(refreshed.fetchedAt, due.toISOString());
  assert.equal(refreshed.days[0].dateUtc, '2026-07-14');
  assert.equal(fallback.fetchedAt, fetchedAt);
});
