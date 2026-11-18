import { describe, expect, it } from 'vitest';
import { normalizeBrandDraft } from '../../lib/branding/validation';
import {
  fromPersistedBrandingFields,
  toPersistedBrandingFields,
} from '../../lib/branding/rpc-contract';

describe('persisted branding RPC contract', () => {
  it('maps TypeScript name/alt keys to canonical SQL keys and back', () => {
    const domain = normalizeBrandDraft({
      names: { ar: 'الاسم', en: 'Name' },
      bannerAltText: { ar: 'وصف', en: 'Description' },
      color: '#2563eb',
    });
    const persisted = toPersistedBrandingFields(domain);
    expect(Object.keys(persisted).sort()).toEqual([
      'bannerAlt',
      'color',
      'name',
    ]);
    expect(persisted).toEqual({
      name: { ar: 'الاسم', en: 'Name' },
      bannerAlt: { ar: 'وصف', en: 'Description' },
      color: '#2563EB',
    });
    expect(fromPersistedBrandingFields(persisted)).toEqual(domain);
  });

  it('rejects SQL key drift in either direction', () => {
    expect(() =>
      fromPersistedBrandingFields({
        names: { ar: 'x', en: 'x' },
        bannerAltText: { ar: 'x', en: 'x' },
        color: '#123456',
      }),
    ).toThrow(/contract/i);
    expect(() =>
      toPersistedBrandingFields({
        names: { ar: 'x', en: 'x' },
        bannerAltText: { ar: 'x', en: 'x' },
        color: '#123456',
        unexpected: 'drift',
      } as never),
    ).toThrow(/contract/i);
  });

  it('maps the persisted empty banner-alt pair to the optional domain field', () => {
    expect(
      fromPersistedBrandingFields({
        name: { ar: 'Brand', en: 'Workspace' },
        bannerAlt: { ar: '', en: '' },
        color: '#2563EB',
      }),
    ).toEqual({
      names: { ar: 'Brand', en: 'Workspace' },
      color: '#2563EB',
    });
  });

  it('accepts an explicitly cleared banner-alt pair for persistence', () => {
    const domain = normalizeBrandDraft({
      names: { ar: 'الاسم', en: 'Name' },
      bannerAltText: { ar: '', en: '' },
      color: '#2563eb',
    });

    expect(toPersistedBrandingFields(domain)).toEqual({
      name: { ar: 'الاسم', en: 'Name' },
      bannerAlt: { ar: '', en: '' },
      color: '#2563EB',
    });
  });
});
