import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const source = await readFile('contracts/schemas/student-admission.schema.json', 'utf8');
const schema: unknown = JSON.parse(source);
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.compile(schema);
process.stdout.write('JSON Schema is valid.\n');
