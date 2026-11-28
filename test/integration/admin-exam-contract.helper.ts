import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';

const document = JSON.parse(readFileSync('openapi-admin-exam.json', 'utf8'));
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

export function expectContract(
  path: string,
  method: string,
  status: number,
  body: unknown,
): void {
  const schema =
    document.paths[path]?.[method]?.responses[String(status)]?.content?.[
      'application/json'
    ]?.schema;
  if (!schema)
    throw new Error(`Missing response schema: ${method} ${path} ${status}`);
  const validate = ajv.compile(schema);
  if (!validate(JSON.parse(JSON.stringify(body))))
    throw new Error(`Contract mismatch: ${ajv.errorsText(validate.errors)}`);
}
