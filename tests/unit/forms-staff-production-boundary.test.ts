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
      resolve(root, 'components/forms/ProductionFormsConsole.tsx'),
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
    expect(productionClient).toContain('createPersistedFormsStaffAdapter');
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
    expect(staffConsole).toContain('{demo && <label');
    expect(staffConsole).toContain(
      '{demo && <p className={styles.previewNotice}',
    );
  });
});
