/* Conservative structural check, not a substitute for runtime or consumer tests. */
const fs = require('node:fs');

function resolve(schema, doc, visited = new Set()) {
  if (!schema || !schema.$ref) return schema || {};
  const prefix = '#/components/schemas/';
  if (!schema.$ref.startsWith(prefix) || visited.has(schema.$ref)) return {};
  visited.add(schema.$ref);
  return resolve(
    doc.components?.schemas?.[schema.$ref.slice(prefix.length)],
    doc,
    visited,
  );
}

function compareSchema(
  oldSchema,
  newSchema,
  oldDoc,
  newDoc,
  where,
  direction,
  changes,
  seen = new Set(),
) {
  if (!oldSchema || !newSchema) return;
  const oldRef = oldSchema.$ref || '';
  const newRef = newSchema.$ref || '';
  const pair = `${oldRef}|${newRef}|${direction}`;
  if (oldRef && newRef) {
    if (seen.has(pair)) return;
    seen = new Set(seen).add(pair);
  }
  const before = resolve(oldSchema, oldDoc);
  const after = resolve(newSchema, newDoc);
  if (before.type && after.type && before.type !== after.type)
    changes.push(`${where}: type ${before.type} → ${after.type}`);
  if (
    direction === 'response' &&
    before.nullable !== true &&
    after.nullable === true
  )
    changes.push(`${where}: response became nullable`);
  if (
    direction === 'request' &&
    before.nullable === true &&
    after.nullable !== true
  )
    changes.push(`${where}: request no longer accepts null`);
  if (before.enum && after.enum) {
    const source = direction === 'response' ? after.enum : before.enum;
    const target = direction === 'response' ? before.enum : after.enum;
    for (const value of source)
      if (!target.includes(value))
        changes.push(`${where}: incompatible enum value ${value}`);
  }
  const oldProps = before.properties || {};
  const newProps = after.properties || {};
  const oldRequired = new Set(before.required || []);
  const newRequired = new Set(after.required || []);
  if (direction === 'request') {
    for (const key of newRequired)
      if (!oldRequired.has(key))
        changes.push(`${where}.${key}: new required request field`);
  } else {
    for (const key of oldRequired)
      if (!newRequired.has(key))
        changes.push(
          `${where}.${key}: response field removed or no longer required`,
        );
  }
  for (const [key, field] of Object.entries(oldProps)) {
    if (!newProps[key])
      changes.push(`${where}.${key}: ${direction} field removed`);
    else
      compareSchema(
        field,
        newProps[key],
        oldDoc,
        newDoc,
        `${where}.${key}`,
        direction,
        changes,
        seen,
      );
  }
  if (before.items && after.items)
    compareSchema(
      before.items,
      after.items,
      oldDoc,
      newDoc,
      `${where}[]`,
      direction,
      changes,
      seen,
    );
  for (const keyword of ['oneOf', 'anyOf', 'allOf']) {
    if (
      JSON.stringify(before[keyword] || null) !==
        JSON.stringify(after[keyword] || null) &&
      (before[keyword] || after[keyword])
    )
      changes.push(`${where}: ${keyword} changed; review compatibility`);
  }
}

function breakingChanges(oldDoc, newDoc) {
  const changes = [];
  for (const [path, methods] of Object.entries(oldDoc.paths || {})) {
    for (const [method, before] of Object.entries(methods)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      const where = `${method.toUpperCase()} ${path}`;
      const after = newDoc.paths?.[path]?.[method];
      if (!after) {
        changes.push(`${where}: operation removed`);
        continue;
      }
      const oldParams = before.parameters || [];
      const newParams = after.parameters || [];
      for (const param of newParams)
        if (
          param.required &&
          !oldParams.some(
            (old) =>
              old.in === param.in && old.name === param.name && old.required,
          )
        )
          changes.push(
            `${where}: new required ${param.in} parameter ${param.name}`,
          );
      for (const [contentType, content] of Object.entries(
        before.requestBody?.content || {},
      )) {
        const replacement = after.requestBody?.content?.[contentType];
        if (!replacement)
          changes.push(`${where}: request content type ${contentType} removed`);
        else
          compareSchema(
            content.schema,
            replacement.schema,
            oldDoc,
            newDoc,
            `${where} request`,
            'request',
            changes,
          );
      }
      if (!before.requestBody?.required && after.requestBody?.required)
        changes.push(`${where}: request body became required`);
      for (const [status, response] of Object.entries(before.responses || {})) {
        if (!status.startsWith('2')) continue;
        const replacement = after.responses?.[status];
        if (!replacement) {
          changes.push(`${where}: success status ${status} removed`);
          continue;
        }
        for (const [contentType, content] of Object.entries(
          response.content || {},
        )) {
          const next = replacement.content?.[contentType];
          if (!next)
            changes.push(`${where}: response ${status} ${contentType} removed`);
          else
            compareSchema(
              content.schema,
              next.schema,
              oldDoc,
              newDoc,
              `${where} response ${status}`,
              'response',
              changes,
            );
        }
      }
    }
  }
  return changes;
}

const WAVE1_ALLOWLIST_PREFIXES = [
  'GET /api/v1/items response 200:',
  'GET /api/v1/placement-profiles/{studentCode} response 200.',
  'GET /api/v1/reports/error-patterns response 200',
];

if (require.main === module) {
  if (process.argv.length !== 4)
    throw new Error('Usage: node check-openapi-breaking.cjs old.json new.json');
  const changes = breakingChanges(
    JSON.parse(fs.readFileSync(process.argv[2], 'utf8')),
    JSON.parse(fs.readFileSync(process.argv[3], 'utf8')),
  );
  const allowed = changes.filter((change) =>
    WAVE1_ALLOWLIST_PREFIXES.some((prefix) => change.startsWith(prefix)),
  );
  const blocking = changes.filter(
    (change) =>
      !WAVE1_ALLOWLIST_PREFIXES.some((prefix) => change.startsWith(prefix)),
  );
  if (allowed.length) {
    console.warn(
      `Allowlisted Wave 1 API changes (FE synchronized):\n${allowed.map((change) => `- ${change}`).join('\n')}`,
    );
  }
  if (blocking.length) {
    console.error(
      `Potential breaking changes:\n${blocking.map((change) => `- ${change}`).join('\n')}`,
    );
    process.exitCode = 1;
  } else console.log('No breaking changes detected by structural checks.');
}
module.exports = { breakingChanges };
