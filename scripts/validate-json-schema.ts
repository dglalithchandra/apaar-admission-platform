import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
for (const path of [
  'contracts/schemas/student-admission.schema.json',
  'contracts/schemas/batch-admission-row.schema.json',
]) {
  const source = await readFile(path, 'utf8');
  const schema: unknown = JSON.parse(source);
  ajv.compile(schema);
}
process.stdout.write('JSON Schemas are valid.\n');
