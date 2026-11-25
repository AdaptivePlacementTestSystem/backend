const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const checker = path.join(__dirname, 'check-openapi-coverage.cjs');
function run(inventory, debt, paths = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-debt-'));
  try {
    for (const [file, value] of Object.entries({
      'openapi.json': { paths, components: { schemas: {} } },
      'openapi-inventory.json': inventory,
      'openapi-coverage-debt.json': debt,
    })) fs.writeFileSync(path.join(dir, file), JSON.stringify(value));
    return spawnSync(process.execPath, [checker], { cwd: dir, encoding: 'utf8' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const item = { method: 'GET', path: '/api/v1/example', contract: 'pending' };
test('unlisted pending operation fails', () => {
  assert.equal(run([item], []).status, 1);
});
test('explicit debt passes only for exact pending operation', () => {
  assert.equal(run([item], [{ method: 'GET', path: item.path, reason: 'Migration' }]).status, 0);
  assert.equal(run([item], [{ method: 'POST', path: item.path, reason: 'Migration' }]).status, 1);
});
test('stale, duplicate, and unexplained debt fails', () => {
  const entry = { method: 'GET', path: item.path, reason: 'Migration' };
  assert.equal(run([], [entry]).status, 1);
  assert.equal(run([item], [entry, entry]).status, 1);
  assert.equal(run([item], [{ ...entry, reason: '' }]).status, 1);
});
test('documented operations still require a success schema', () => {
  const documented = [{ ...item, contract: 'documented' }];
  assert.equal(run(documented, [], { [item.path]: { get: { operationId: 'getExample', responses: { 200: {} } } } }).status, 1);
  assert.equal(run(documented, [], { [item.path]: { get: { operationId: 'getExample', responses: { 204: {} } } } }).status, 0);
});
