import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function sourceFiles(directory: string): string[] {
  return readdirSync(resolve(root, directory)).flatMap((entry) => {
    const relative = `${directory}/${entry}`;
    const absolute = resolve(root, relative);
    if (statSync(absolute).isDirectory()) return sourceFiles(relative);
    return /\.(ts|tsx)$/u.test(entry) ? [relative] : [];
  });
}

describe('production staff Forms route boundary', () => {
  it('binds the authenticated route to the persisted adapter without mock modules', () => {
    const route = readFileSync(
      resolve(root, 'app/(app)/forms/page.tsx'),
      'utf8',
    );
    const productionClient = readFileSync(
      resolve(root, 'app/(app)/forms/ProductionFormsConsole.tsx'),
      'utf8',
    );
    const serverActions = readFileSync(
      resolve(root, 'app/(app)/forms/actions.ts'),
      'utf8',
    );
    const staffConsole = readFileSync(
      resolve(root, 'components/forms/FormsStaffConsole.tsx'),
      'utf8',
    );
    const appHome = readFileSync(resolve(root, 'app/(app)/page.tsx'), 'utf8');
    const mockImports = [
      ...sourceFiles('app'),
      ...sourceFiles('components'),
    ].filter((file) =>
      readFileSync(resolve(root, file), 'utf8').includes(
        "from '../../lib/forms/mock-staff-adapter'",
      ),
    );

    expect(route).toContain('requireActor');
    expect(route).toContain('author_forms');
    expect(route).toContain('activeWorkspaceIds');
    expect(serverActions).toContain("'use server'");
    expect(serverActions).toContain('createSessionClient');
    expect(serverActions).toContain('createPersistedFormsStaffAdapter');
    expect(serverActions).toContain('author_forms');
    expect(productionClient).not.toMatch(/@supabase\//u);
    expect(productionClient).not.toContain('createBrowserClient');
    expect(productionClient).not.toContain('mock-staff-adapter');
    expect(productionClient).not.toContain('FormsStaffDemo');
    expect(staffConsole).not.toContain('mock-staff-adapter');
    expect(productionClient).toContain('demo={false}');
    expect(mockImports).toEqual(['components/forms/FormsStaffDemo.tsx']);
    expect(appHome).toContain("roleHasCapability(actor.role, 'author_forms')");
    expect(appHome).toContain("m['forms.staffTitle']");
  });

  it('keeps role simulation and the preview notice behind demo mode', () => {
    const staffConsole = readFileSync(
      resolve(root, 'components/forms/FormsStaffConsole.tsx'),
      'utf8',
    );
    expect(staffConsole).toMatch(/\{demo\s*&&\s*\(\s*<label/u);
    expect(staffConsole).toMatch(
      /\{demo\s*&&\s*\(\s*<p className=\{styles\.previewNotice\}/u,
    );
  });

  it('accepts the saved draft before starting publish', () => {
    const staffConsole = readFileSync(
      resolve(root, 'components/forms/FormsStaffConsole.tsx'),
      'utf8',
    );
    const publishAction = staffConsole.slice(
      staffConsole.indexOf('async function publish()'),
      staffConsole.indexOf('async function retire()'),
    );

    expect(publishAction.indexOf('acceptResult(saved,')).toBeLessThan(
      publishAction.indexOf('adapter.publish('),
    );
  });
});
