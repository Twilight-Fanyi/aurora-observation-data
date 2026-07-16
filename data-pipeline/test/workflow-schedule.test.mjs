import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function workflowText() {
  const workflowUrl = new URL(
    '../../.github/workflows/aurora-data.yml',
    import.meta.url
  );
  return readFile(workflowUrl, 'utf8');
}

test('uses Cloudflare dispatch with an hourly GitHub fallback', async () => {
  const workflow = await workflowText();
  assert.match(workflow, /workflow_dispatch:\s*\n\s+inputs:\s*\n\s+dispatch_slot:/);
  assert.match(workflow, /cron:\s*["']37 \* \* \* \*["']/);
  assert.doesNotMatch(workflow, /cron:\s*["']\*\/10 \* \* \* \*["']/);
  assert.match(workflow, /run-name:.*dispatch_slot/s);
  assert.match(workflow, /group:\s*aurora-pages/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
});

test('workflow recovers and restores the complete weather-backed publication', async () => {
  const workflow = await workflowText();

  assert.match(
    workflow,
    /for FILE in catalog\.json manifest\.json snapshot\.json weather\.json/
  );
  assert.match(
    workflow,
    /cp previous\/v1\/weather\.json public\/v1\/weather\.json/
  );
});
