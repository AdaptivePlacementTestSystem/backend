const { test } = require('node:test');
const assert = require('node:assert/strict');
const { breakingChanges } = require('./check-openapi-breaking.cjs');

function spec(requestSchema, responseSchema) {
  return {
    paths: {
      '/items': {
        post: {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: requestSchema } },
          },
          responses: {
            200: {
              content: { 'application/json': { schema: responseSchema } },
            },
          },
        },
      },
    },
  };
}
const field = { type: 'string' };
const req = { type: 'object', properties: { name: field }, required: ['name'] };
const res = { type: 'object', properties: { id: field }, required: ['id'] };
test('identical and additive optional fields are compatible', () => {
  assert.deepEqual(
    breakingChanges(
      spec(req, res),
      spec(req, { ...res, properties: { ...res.properties, label: field } }),
    ),
    [],
  );
});
test('removed response fields are reported', () => {
  assert(
    breakingChanges(
      spec(req, res),
      spec(req, { type: 'object', properties: {} }),
    ).some((v) => v.includes('id')),
  );
});
test('new required request fields are reported', () => {
  const next = {
    ...req,
    properties: { ...req.properties, code: field },
    required: ['name', 'code'],
  };
  assert(
    breakingChanges(spec(req, res), spec(next, res)).some((v) =>
      v.includes('code'),
    ),
  );
});
test('removed operations are reported', () => {
  assert(
    breakingChanges(spec(req, res), { paths: {} }).some((v) =>
      v.includes('operation removed'),
    ),
  );
});
test('request enum narrowing and response enum expansion are reported', () => {
  const oldEnum = { ...field, enum: ['A', 'B'] };
  const newEnum = { ...field, enum: ['A'] };
  assert(
    breakingChanges(spec(oldEnum, newEnum), spec(newEnum, oldEnum)).length >= 2,
  );
});
