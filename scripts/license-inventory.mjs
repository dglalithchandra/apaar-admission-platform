import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const licenses = new Map();
const visited = new Set();
const undeclared = [];

function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const path = join(directory, entry.name);
    if (entry.name.startsWith('@')) {
      inspect(path);
      continue;
    }
    const manifestPath = join(path, 'package.json');
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const identity = `${String(manifest.name)}@${String(manifest.version)}`;
      if (!visited.has(identity)) {
        visited.add(identity);
        const licenseFile = join(path, 'LICENSE');
        const license =
          typeof manifest.license === 'string'
            ? manifest.license
            : existsSync(licenseFile) &&
                readFileSync(licenseFile, 'utf8').includes('Permission is hereby granted')
              ? 'MIT'
              : 'UNDECLARED';
        if (license === 'UNDECLARED') undeclared.push(identity);
        licenses.set(license, (licenses.get(license) || 0) + 1);
      }
    } catch {
      // Package folders without manifests are not distributable package records.
    }
    const nestedDependencies = join(path, 'node_modules');
    if (existsSync(nestedDependencies)) inspect(nestedDependencies);
  }
}

inspect('node_modules');
const result = Object.fromEntries(
  [...licenses.entries()].sort(([left], [right]) => left.localeCompare(right)),
);
process.stdout.write(
  `${JSON.stringify({ packages: visited.size, licenses: result, undeclared: undeclared.sort() }, null, 2)}\n`,
);
if (licenses.has('UNDECLARED')) process.exitCode = 1;
