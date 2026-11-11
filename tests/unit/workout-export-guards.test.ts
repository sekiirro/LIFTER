import { describe, expect, it } from 'vitest';
import {
  EXPORT_FIELDS,
  isExportField,
  toSafeCell,
} from '../../lib/workout-planner/export-guards';

// T007-note: FR-017/FR-018 export field coverage + formula guard (SC-008).
// RED first. Mutation target: removing one leading-character check must fail.

describe('F17 export field coverage (FR-018, SC-008)', () => {
  it('covers the full FR-018 field list including document-level notes', () => {
    const required = [
      'documentNotes',
      'dayTitles',
      'restDays',
      'exerciseNames',
      'setOrder',
      'setTypes',
      'reps',
      'load',
      'loadUnits',
      'loadModes',
      'rest',
      'rir',
      'planNotes',
      'dayNotes',
      'exerciseNotes',
      'alternatives',
      'videoLinks',
    ];
    for (const field of required) {
      expect(isExportField(field)).toBe(true);
      expect(EXPORT_FIELDS).toContain(field);
    }
  });

  it('keeps ordinary coach-authored cells unchanged as strings', () => {
    for (const plain of ['Bench Press', '90 s', '8-12', 'coach note', '']) {
      expect(toSafeCell(plain)).toBe(plain);
    }
    expect(typeof toSafeCell('notes')).toBe('string');
  });

  it('neutralises formula injection including leading-space variants', () => {
    const attacks = [
      '=1+1',
      '+1',
      '-1',
      '@SUM(A1)',
      '  =cmd',
      '\t@x',
      ' \u200B+evil',
    ];
    for (const attack of attacks) {
      const cell = toSafeCell(attack);
      expect(typeof cell).toBe('string');
      expect(cell).not.toBe(attack);
      // The neutralised cell must not start with an executable character.
      expect(/^[\s\u200B]*[=+\-@]/.test(cell)).toBe(false);
      // Content is preserved after the text marker.
      expect(cell.slice(1)).toBe(attack);
    }
  });
});
