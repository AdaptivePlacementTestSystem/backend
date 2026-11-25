const fs = require('node:fs');
const document = JSON.parse(fs.readFileSync('openapi.json', 'utf8'));
const inventory = JSON.parse(fs.readFileSync('openapi-inventory.json', 'utf8'));
const debt = JSON.parse(fs.readFileSync('openapi-coverage-debt.json', 'utf8'));
const errors = [];
const operationIds = new Set();
const debtKeys = new Set();
for (const entry of debt) {
  const key = `${entry.method} ${entry.path}`;
  if (!/^(GET|POST|PUT|PATCH|DELETE)$/.test(entry.method) ||
      typeof entry.path !== 'string' || !entry.path.startsWith('/') ||
      typeof entry.reason !== 'string' || !entry.reason.trim() || debtKeys.has(key))
    errors.push(`${key}: invalid or duplicate coverage debt`);
  debtKeys.add(key);
}
function checkReferences(value, where) {
  if (!value || typeof value !== 'object') return;
  if (
    typeof value.$ref === 'string' &&
    value.$ref.startsWith('#/components/schemas/')
  ) {
    const key = value.$ref.slice('#/components/schemas/'.length);
    if (!document.components?.schemas?.[key])
      errors.push(`${where}: missing schema ${key}`);
  }
  for (const child of Object.values(value)) checkReferences(child, where);
}
for (const entry of inventory) {
  const key = `${entry.method} ${entry.path}`;
  if (entry.contract !== 'documented') {
    if (!debtKeys.has(key)) errors.push(`${key}: missing OpenAPI contract`);
    else debtKeys.delete(key);
    continue;
  }
  const operation = document.paths[entry.path]?.[entry.method.toLowerCase()];
  if (!operation) {
    errors.push(`${entry.method} ${entry.path}: operation missing`);
    continue;
  }
  if (!operation.operationId || operationIds.has(operation.operationId))
    errors.push(
      `${entry.method} ${entry.path}: missing or duplicate operationId`,
    );
  operationIds.add(operation.operationId);
  const success = Object.entries(operation.responses || {}).filter(([status]) =>
    /^2\d\d$/.test(status),
  );
  if (success.length === 0)
    errors.push(`${entry.method} ${entry.path}: no success response`);
  for (const [status, response] of success) {
    if (status === '204' || status === '205') continue;
    const media = Object.values(response.content || {});
    if (!media.length || media.some((value) => !value.schema))
      errors.push(
        `${entry.method} ${entry.path}: ${status} response schema missing`,
      );
  }
}
for (const key of debtKeys) errors.push(`${key}: stale coverage debt`);
checkReferences(document, 'OpenAPI');
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `OpenAPI coverage: ${inventory.length} inventoried operations, ${debt.length} explicitly deferred.`,
  );
