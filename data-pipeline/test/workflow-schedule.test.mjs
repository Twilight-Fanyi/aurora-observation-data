import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('scheduled publishing stays on the approved ten-minute cadence', async () => {
  const workflowUrl = new URL(
    '../../.github/workflows/aurora-data.yml',
    import.meta.url
  );
  const workflow = await readFile(workflowUrl, 'utf8');
  assert.match(workflow, /cron:\s*["']\*\/10 \* \* \* \*["']/);
  assert.doesNotMatch(workflow, /cron:\s*["']3\/10 \* \* \* \*["']/);
});

test('workflow recovers and restores the complete weather-backed publication', async () => {
  const workflowUrl = new URL(
    '../../.github/workflows/aurora-data.yml',
    import.meta.url
  );
  const workflow = await readFile(workflowUrl, 'utf8');

  assert.match(
    workflow,
    /for FILE in catalog\.json manifest\.json snapshot\.json weather\.json/
  );
  assert.match(
    workflow,
    /cp previous\/v1\/weather\.json public\/v1\/weather\.json/
  );
});
