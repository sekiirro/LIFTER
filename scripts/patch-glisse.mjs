import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packagePath = join(root, 'node_modules/glisse/package.json');
const bundlePath = join(root, 'node_modules/glisse/dist/index.js');
const pkg = JSON.parse(await readFile(packagePath, 'utf8'));

if (pkg.version !== '0.5.0') {
  throw new Error(`Expected glisse 0.5.0, found ${pkg.version}`);
}

let bundle = await readFile(bundlePath, 'utf8');

function patchSection(startMarker, endMarker, before, after) {
  const start = bundle.indexOf(startMarker);
  const end = bundle.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    throw new Error(`Could not locate Glisse section ${startMarker}`);
  }
  const section = bundle.slice(start, end);
  if (section.includes(after)) return;
  const occurrences = section.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `Expected one patch target in ${startMarker}, found ${occurrences}`,
    );
  }
  bundle =
    bundle.slice(0, start) + section.replace(before, after) + bundle.slice(end);
}

// Glisse already memoizes both map families by exact geometry and settings.
// The lower sampling cap shrinks first-use work while keeping a smooth map
// once the browser scales it across the small floating dock.
patchSection(
  'function fit(glass, options) {',
  'const surfaces = /* @__PURE__ */ new Map();',
  'const density = Math.min(devicePixelRatio || 1, 2);',
  'const density = Math.min(devicePixelRatio || 1, 0.75);',
);
patchSection(
  'function paintRim(element) {',
  'const repaints = /* @__PURE__ */ new Set();',
  'const density = Math.min(devicePixelRatio || 1, 3);',
  'const density = Math.min(devicePixelRatio || 1, 0.75);',
);

await writeFile(bundlePath, bundle);

// The Glass export is the only live Glisse export in this app. Mark the ESM
// entry as tree-shakeable so the deferred chunk omits unrelated controls.
const sideEffects = pkg.sideEffects ?? [];
pkg.sideEffects = sideEffects.filter((entry) => entry !== './dist/index.js');
await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
