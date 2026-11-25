import { once } from 'node:events';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStaticServer } from '../../scripts/serve.mjs';

test('serves the calculator over HTTP from the source directory', async t => {
  const server = createStaticServer().listen(0, '127.0.0.1');
  t.after(() => server.close());
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(url);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Water Chemistry Calculator/i);
  assert.equal((await fetch(url + '/package.json')).status, 404);
});
