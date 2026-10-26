import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const paths = [
  'contracts/schemas/student-admission.schema.json',
  'contracts/schemas/batch-admission-row.schema.json',
  'contracts/schemas/admission-casework.schema.json',
];
const schemas: unknown[] = [];
for (const path of paths) {
  const source = await readFile(path, 'utf8');
  schemas.push(JSON.parse(source) as unknown);
}
for (const schema of schemas) ajv.addSchema(schema);
for (const schema of schemas) {
  ajv.compile(schema);
}

const caseworkFixture = JSON.parse(
  await readFile('contracts/fixtures/synthetic/casework-journey.json', 'utf8'),
) as Record<string, unknown>;
const fixtureDefinitions = {
  createCase: 'CreateCaseRequest',
  caseView: 'CaseView',
  cancellationImplementation: 'CancellationImplementationRequest',
  cancellationReceipt: 'ImplementationReceipt',
  transferImplementation: 'TransferImplementationRequest',
  transferReceipt: 'ImplementationReceipt',
} as const;

for (const [fixtureName, definition] of Object.entries(fixtureDefinitions)) {
  const validate = ajv.getSchema(
    `https://example.invalid/schemas/admission-casework.schema.json#/$defs/${definition}`,
  );
  if (validate === undefined || !validate(caseworkFixture[fixtureName])) {
    throw new Error(
      `Synthetic casework fixture ${fixtureName} is invalid: ${JSON.stringify(validate?.errors)}`,
    );
  }
}
process.stdout.write('JSON Schemas are valid.\n');
