import { describe, expect, it } from 'vitest';
import {
  analyzeIdentity,
  parseLsTreeEntries,
} from '../../scripts/audit-migration-identity.mjs';

const e = (name: string, oid: string) => ({ name, oid });

describe('T053 migration identity across all origin refs (S32-R1)', () => {
  it('parses ls-tree -z output, keeping non-ASCII names and ignoring non-SQL files', () => {
    const out =
      '100644 blob aaa111\tsupabase/migrations/20261029120000_packages.sql\0' +
      '100644 blob bbb222\tsupabase/migrations/README.md\0';
    expect(parseLsTreeEntries(out)).toEqual([
      { oid: 'aaa111', name: '20261029120000_packages.sql' },
    ]);
  });

  it('accepts the same file/blob on many refs', () => {
    const r = analyzeIdentity([
      { ref: 'a', entries: [e('20261029120000_packages.sql', 'x')] },
      { ref: 'b', entries: [e('20261029120000_packages.sql', 'x')] },
    ]);
    expect(r.duplicateVersions).toEqual([]);
    expect(r.divergentContent).toEqual([]);
    expect(r.versionCount).toBe(1);
  });

  it('flags one version carried by two filenames on different refs', () => {
    const r = analyzeIdentity([
      { ref: 'a', entries: [e('20261118000000_one.sql', 'x')] },
      { ref: 'b', entries: [e('20261118000000_two.sql', 'y')] },
    ]);
    expect(r.duplicateVersions).toEqual([
      {
        version: '20261118000000',
        filenames: ['20261118000000_one.sql', '20261118000000_two.sql'],
      },
    ]);
  });

  it('flags a pushed migration whose content differs between refs', () => {
    const r = analyzeIdentity([
      { ref: 'a', entries: [e('20261029120000_packages.sql', 'x')] },
      { ref: 'b', entries: [e('20261029120000_packages.sql', 'y')] },
    ]);
    expect(r.divergentContent).toHaveLength(1);
    expect(r.divergentContent[0]!.name).toBe('20261029120000_packages.sql');
  });
});
