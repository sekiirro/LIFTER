import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

function filesUnder(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path).flatMap((name) => {
    const full = join(path, name);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

export function collectProductionServerOutput(root = process.cwd()) {
  const worker = resolve(root, '.open-next/worker.js');
  if (!existsSync(worker)) throw new Error('Missing production Worker output');
  const paths = [
    worker,
    ...filesUnder(resolve(root, '.open-next/server-functions')),
    ...filesUnder(resolve(root, '.open-next/middleware')),
  ];
  return paths.map((path) => ({
    path: relative(root, path).replaceAll('\\', '/'),
    contents: readFileSync(path, 'utf8'),
  }));
}

const signupServiceMarker = 'client_signup_admit';
const overrideIdentifiers = ['ALLOW_SIGNUP_TEST_IP_OVERRIDE', 'SIGNUP_TEST_IP'];
const dynamicNodeEnv =
  /process\s*(?:\.\s*env\s*\.\s*NODE_ENV|\[\s*['"]NODE_ENV['"]\s*\])/;

export function assertSignupServerOutputSafe(files) {
  const signupFiles = files.filter((file) =>
    file.contents.includes(signupServiceMarker),
  );
  if (signupFiles.length === 0)
    throw new Error('Signup service marker client_signup_admit was not found');

  for (const file of files) {
    const overridePresent = overrideIdentifiers.filter((name) =>
      file.contents.includes(name),
    );
    if (overridePresent.length > 0)
      throw new Error(
        `Test-IP override identifiers remain in production server output: ${file.path}`,
      );
  }

  for (const file of signupFiles) {
    if (dynamicNodeEnv.test(file.contents))
      throw new Error(
        `Un-inlined NODE_ENV guard remains in signup service output: ${file.path}`,
      );
  }

  return signupFiles.map((file) => file.path).sort();
}
