import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeStaffDisplayName } from '../../lib/staff/display-name';
import {
  canReadStaffDisplayName,
  canWriteStaffDisplayName,
} from '../../lib/staff/display-name';
import {
  STAFF_NAME_LETTER_MARK_RANGES,
  STAFF_NAME_UNICODE_VERSION,
} from '../../lib/staff/display-name-unicode-ranges';

describe('staff display-name normalization', () => {
  it('trims Unicode White_Space, normalizes to NFC and counts code points', () => {
    expect(normalizeStaffDisplayName('\u00a0Cafe\u0301 Staff\u3000')).toBe(
      'Café Staff',
    );
    expect(normalizeStaffDisplayName('A'.repeat(80))).toBe('A'.repeat(80));
    expect(normalizeStaffDisplayName(`${'A'.repeat(79)}e\u0301`)).toBe(
      `${'A'.repeat(79)}é`,
    );
    expect(normalizeStaffDisplayName(`${'A'.repeat(80)}e\u0301`)).toBeNull();
    expect(normalizeStaffDisplayName('\u00a0\u3000')).toBeNull();
  });

  it('refuses disallowed characters and interior Unicode whitespace', () => {
    for (const value of [
      'Name\tName',
      'Name\u00a0Name',
      'Name\nName',
      'Name\fName',
      'Name🙂',
      'Name_Staff',
      'Name/Staff',
    ]) {
      expect(normalizeStaffDisplayName(value)).toBeNull();
    }
    expect(normalizeStaffDisplayName('\tName\u00a0')).toBe('Name');
    expect(normalizeStaffDisplayName('مُحَمَّد')).toBe('مُحَمَّد');
  });

  it('keeps generated General_Category L and M ranges in parity with Node Unicode', () => {
    expect(process.versions.unicode).toBe(STAFF_NAME_UNICODE_VERSION);
    const lettersAndMarks = new RegExp(
      `^[${String.fromCharCode(92)}p{L}${String.fromCharCode(92)}p{M}]$`,
      'u',
    );
    const mismatches: number[] = [];
    let rangeIndex = 0;
    for (let codePoint = 0; codePoint <= 0x10ffff; codePoint += 1) {
      while (
        rangeIndex < STAFF_NAME_LETTER_MARK_RANGES.length &&
        STAFF_NAME_LETTER_MARK_RANGES[rangeIndex]![1] < codePoint
      ) {
        rangeIndex += 1;
      }
      const inGeneratedRange =
        rangeIndex < STAFF_NAME_LETTER_MARK_RANGES.length &&
        STAFF_NAME_LETTER_MARK_RANGES[rangeIndex]![0] <= codePoint;
      if (
        inGeneratedRange !==
        lettersAndMarks.test(String.fromCodePoint(codePoint))
      ) {
        mismatches.push(codePoint);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('embeds the same generated allowlist in the database validation function', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20261114130000_staff_display_names.sql',
      ),
      'utf8',
    );
    const sqlRanges = `{${STAFF_NAME_LETTER_MARK_RANGES.map(
      ([first, last]) => `[${first},${last + 1})`,
    ).join(',')}}`;
    expect(migration).toContain(sqlRanges);
  });
});

describe('staff display-name authorization', () => {
  const actor = (
    role: 'platform_owner' | 'workspace_owner' | 'trainer' | 'sales' | null,
    activeWorkspaceIds: string[],
  ) => ({
    userId: 'actor',
    role,
    activeWorkspaceIds,
  });

  it('matches same-workspace active staff and Platform Owner read access', () => {
    expect(canReadStaffDisplayName(actor('trainer', ['a']), ['a'])).toBe(true);
    expect(
      canReadStaffDisplayName(actor('workspace_owner', ['a']), ['a']),
    ).toBe(true);
    expect(canReadStaffDisplayName(actor('platform_owner', []), ['b'])).toBe(
      true,
    );
    expect(canReadStaffDisplayName(actor('trainer', ['a']), ['b'])).toBe(false);
    expect(canReadStaffDisplayName(actor('sales', ['a']), ['a'])).toBe(false);
    expect(canReadStaffDisplayName(actor('trainer', ['a']), [])).toBe(false);
    expect(canReadStaffDisplayName(actor(null, ['a']), ['a'])).toBe(false);
  });

  it('requires every active target membership to belong to a Workspace Owner', () => {
    expect(
      canWriteStaffDisplayName(actor('workspace_owner', ['a', 'b']), ['a']),
    ).toBe(true);
    expect(
      canWriteStaffDisplayName(actor('workspace_owner', ['a']), ['a', 'b']),
    ).toBe(false);
    expect(canWriteStaffDisplayName(actor('workspace_owner', ['a']), [])).toBe(
      false,
    );
    expect(
      canWriteStaffDisplayName(actor('platform_owner', []), ['x', 'y']),
    ).toBe(true);
    expect(canWriteStaffDisplayName(actor('trainer', ['a']), ['a'])).toBe(
      false,
    );
    expect(canWriteStaffDisplayName(actor('sales', ['a']), ['a'])).toBe(false);
    expect(canWriteStaffDisplayName(actor(null, ['a']), ['a'])).toBe(false);
  });
});
