import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const patterns = [
  ['service_role', /service_role/],
  ['SUPABASE_SERVICE_ROLE_KEY', /SUPABASE_SERVICE_ROLE_KEY/],
  ['SERVICE_ROLE', /SERVICE_ROLE/],
  ['JWT', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}/],
];
let roots = 0;
let findings = 0;
async function scan(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (entry.isFile()) {
      const content = await readFile(path, 'utf8');
      for (const [name, pattern] of patterns) {
        if (pattern.test(content)) {
          console.error(`${path}: ${name}`);
          findings++;
        }
      }
    }
  }
}
for (const root of ['.next/static', '.open-next/assets']) {
  try {
    await readdir(root);
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  roots++;
  await scan(root);
}
if (!roots) console.error('No client build directories found.');
process.exitCode = !roots || findings ? 1 : 0;
