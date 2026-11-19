/** @vitest-environment happy-dom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PackagesManager } from '../../app/(app)/packages/PackagesManager';
import { getMessages } from '../../lib/i18n';
import type { PackageReadResult } from '../../lib/packages/read';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  createCategory: vi.fn(),
  initializeCategories: vi.fn(),
  publishVersion: vi.fn(),
  toggleAvailable: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock('../../app/(app)/packages/actions', () => ({
  createPackageCategory: mocks.createCategory,
  initializePackageCategories: mocks.initializeCategories,
  publishPackageVersion: mocks.publishVersion,
  setPackageOfferAvailable: mocks.toggleAvailable,
}));

const wsA = '00000000-0000-0000-0000-000000000001';
const wsB = '00000000-0000-0000-0000-000000000002';
const pkgEgyptId = '00000000-0000-0000-0000-000000000011';
const pkgIntlId = '00000000-0000-0000-0000-000000000012';

const workspaces = [
  { id: wsA, name: 'Workspace A' },
  { id: wsB, name: 'Workspace B' },
];

const emptyData: Extract<PackageReadResult, { status: 'ok' }> = {
  status: 'ok',
  packages: [],
  offers: [],
  versions: [],
};

const populatedData: Extract<PackageReadResult, { status: 'ok' }> = {
  status: 'ok',
  packages: [
    {
      id: pkgEgyptId,
      workspace_id: wsA,
      market: 'Egypt',
      type: 'Year-round',
      code: null,
      created_at: '2026-11-18T00:00:00Z',
      created_by: 'po',
    },
    {
      id: pkgIntlId,
      workspace_id: wsA,
      market: 'International',
      type: 'Promotional',
      code: null,
      created_at: '2026-11-18T00:00:00Z',
      created_by: 'po',
    },
  ],
  offers: [
    {
      id: 'offer-egp',
      workspace_id: wsA,
      package_id: pkgEgyptId,
      tier_rank: 1,
      duration_days: 90,
      duration_months: 3,
      available: false,
      current_version_id: 'ver-egp',
    },
    {
      id: 'offer-usd',
      workspace_id: wsA,
      package_id: pkgIntlId,
      tier_rank: 2,
      duration_days: 61,
      duration_months: null,
      available: true,
      current_version_id: 'ver-usd',
    },
  ],
  versions: [
    {
      workspace_id: wsA,
      id: 'ver-egp',
      offer_id: 'offer-egp',
      version: 1,
      market: 'Egypt',
      type: 'Year-round',
      name_ar: 'باقة مصر',
      name_en: 'Egypt Plan',
      price_minor: '9007199254740993',
      currency: 'EGP',
      duration_days: 90,
      duration_months: 3,
      published_at: '2026-11-18T00:00:00Z',
      published_by: 'po',
      commission_rate_bp: 500,
    },
    {
      workspace_id: wsA,
      id: 'ver-usd',
      offer_id: 'offer-usd',
      version: 1,
      market: 'International',
      type: 'Promotional',
      name_ar: 'باقة دولي',
      name_en: 'Intl Promo',
      price_minor: '15000',
      currency: 'USD',
      duration_days: 61,
      duration_months: null,
      published_at: '2026-11-18T00:00:00Z',
      published_by: 'po',
      commission_rate_bp: 1000,
    },
  ],
};

const fullCategoriesData: Extract<PackageReadResult, { status: 'ok' }> = {
  status: 'ok',
  packages: [
    {
      id: pkgEgyptId,
      workspace_id: wsA,
      market: 'Egypt',
      type: 'Year-round',
      code: null,
      created_at: '2026-11-18T00:00:00Z',
      created_by: 'po',
    },
    {
      id: 'pkg-eg-promo',
      workspace_id: wsA,
      market: 'Egypt',
      type: 'Promotional',
      code: null,
      created_at: '2026-11-18T00:00:00Z',
      created_by: 'po',
    },
    {
      id: 'pkg-intl-yr',
      workspace_id: wsA,
      market: 'International',
      type: 'Year-round',
      code: null,
      created_at: '2026-11-18T00:00:00Z',
      created_by: 'po',
    },
    {
      id: pkgIntlId,
      workspace_id: wsA,
      market: 'International',
      type: 'Promotional',
      code: null,
      created_at: '2026-11-18T00:00:00Z',
      created_by: 'po',
    },
  ],
  offers: [],
  versions: [],
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.resetAllMocks();
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open');
    };
  }
  mocks.createCategory.mockResolvedValue({
    status: 'ok',
    packageId: pkgEgyptId,
  });
  mocks.initializeCategories.mockResolvedValue({
    status: 'ok',
    categories: [],
  });
  mocks.publishVersion.mockResolvedValue({
    status: 'ok',
    versionId: 'ver-new',
  });
  mocks.toggleAvailable.mockResolvedValue({
    status: 'ok',
    offerId: 'offer-egp',
  });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
});

function renderManager(
  locale: 'ar' | 'en',
  data: Extract<PackageReadResult, { status: 'ok' }> = emptyData,
) {
  act(() => {
    root.render(
      createElement(PackagesManager, {
        locale,
        workspaceId: wsA,
        workspaces,
        data,
      }),
    );
  });
}

describe('PackagesManager market/type UI (T045)', () => {
  it.each([
    ['en', ['Egypt', 'International', 'Year-Round', 'Promotional']],
    ['ar', ['مصر', 'دولي', 'طول السنـة', 'وقت العـروض']],
  ] as const)(
    'renders exact S34-PO-2 approved labels in %s and no legacy code input',
    (locale, expectedLabels) => {
      renderManager(locale, emptyData);
      expect(host.querySelector('input[name="code"]')).toBeNull();
      for (const label of expectedLabels) {
        const matches = [...host.querySelectorAll('span, label')].filter(
          (el) => el.textContent?.trim() === label,
        );
        expect(matches.length).toBeGreaterThanOrEqual(1);
      }
    },
  );

  it('creates a category using canonical Egypt/International and Year-round/Promotional literals', async () => {
    renderManager('en', emptyData);
    const egyptRadio = host.querySelector(
      'input[name="market"][value="Egypt"]',
    ) as HTMLInputElement;
    const promoRadio = host.querySelector(
      'input[name="type"][value="Promotional"]',
    ) as HTMLInputElement;
    await act(async () => {
      egyptRadio.click();
      promoRadio.click();
    });
    const createForm = egyptRadio.closest('form')!;
    await act(async () => {
      createForm.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(mocks.createCategory).toHaveBeenCalledWith({
      workspaceId: wsA,
      market: 'Egypt',
      type: 'Promotional',
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('rejects prohibited USD currency on an Egypt category before server submission', async () => {
    renderManager('en', populatedData);
    const m = getMessages('en');
    const select = host.querySelector(
      'select[name="packageId"]',
    ) as HTMLSelectElement;
    const silver = host.querySelector(
      'input[name="tierRank"][value="1"]',
    ) as HTMLInputElement;
    const threeMonths = [...host.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === `3 ${m['packages.months']}`,
    )!;
    const nameAr = host.querySelector(
      'input[name="nameAr"]',
    ) as HTMLInputElement;
    const nameEn = host.querySelector(
      'input[name="nameEn"]',
    ) as HTMLInputElement;
    const priceMinor = host.querySelector(
      'input[name="priceMinor"]',
    ) as HTMLInputElement;
    const currency = host.querySelector(
      'input[name="currency"]',
    ) as HTMLInputElement;
    const rateBp = host.querySelector(
      'input[name="commissionRateBp"]',
    ) as HTMLInputElement;

    await act(async () => {
      select.value = pkgEgyptId;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      silver.click();
      threeMonths.click();
      nameAr.value = 'test-ar';
      nameEn.value = 'test-en';
      priceMinor.value = '1000';
      currency.value = 'USD';
      currency.dispatchEvent(new Event('input', { bubbles: true }));
      rateBp.value = '0';
    });

    const publishForm = select.closest('form')!;
    await act(async () => {
      publishForm.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });

    expect(mocks.publishVersion).not.toHaveBeenCalled();
    expect(currency.getAttribute('aria-invalid')).toBe('true');
    expect(host.textContent).toContain(m['packages.invalid_input']);
  });

  it('displays own-currency offers side by side without cross-currency totals', () => {
    renderManager('en', populatedData);
    const rows = [...host.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain('Egypt');
    expect(rows[0]!.textContent).toContain('Year-Round');
    expect(rows[0]!.textContent).toContain('EGP');
    expect(rows[0]!.textContent).not.toContain('USD');
    expect(rows[1]!.textContent).toContain('International');
    expect(rows[1]!.textContent).toContain('Promotional');
    expect(rows[1]!.textContent).toContain('USD');
    expect(host.querySelector('tfoot')).toBeNull();
  });

  it('keeps financial and name fields blank initially and resets on workspace switch', async () => {
    renderManager('en', populatedData);
    for (const name of [
      'nameAr',
      'nameEn',
      'priceMinor',
      'currency',
      'commissionRateBp',
    ]) {
      const input = host.querySelector(
        `input[name="${name}"]`,
      ) as HTMLInputElement;
      expect(input.value).toBe('');
    }
    const wsSelect = host.querySelector('select') as HTMLSelectElement;
    await act(async () => {
      wsSelect.value = wsB;
      wsSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(mocks.push).toHaveBeenCalledWith(
      `/packages?workspace=${encodeURIComponent(wsB)}`,
    );
  });

  it('submits International + USD and opens ConfirmDialog with category label', async () => {
    renderManager('en', populatedData);
    const m = getMessages('en');
    const select = host.querySelector(
      'select[name="packageId"]',
    ) as HTMLSelectElement;
    const gold = host.querySelector(
      'input[name="tierRank"][value="2"]',
    ) as HTMLInputElement;
    const threeMonths = [...host.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === `3 ${m['packages.months']}`,
    )!;
    const nameAr = host.querySelector(
      'input[name="nameAr"]',
    ) as HTMLInputElement;
    const nameEn = host.querySelector(
      'input[name="nameEn"]',
    ) as HTMLInputElement;
    const priceMinor = host.querySelector(
      'input[name="priceMinor"]',
    ) as HTMLInputElement;
    const currency = host.querySelector(
      'input[name="currency"]',
    ) as HTMLInputElement;
    const rateBp = host.querySelector(
      'input[name="commissionRateBp"]',
    ) as HTMLInputElement;

    const setInputValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!;
    await act(async () => {
      select.value = pkgIntlId;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      gold.click();
      threeMonths.click();
      nameAr.value = 'test-ar';
      nameEn.value = 'test-en';
      priceMinor.value = '15000';
      setInputValue.call(currency, 'USD');
      currency.dispatchEvent(new Event('input', { bubbles: true }));
      rateBp.value = '500';
    });

    const publishForm = select.closest('form')!;
    await act(async () => {
      publishForm.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(mocks.publishVersion).toHaveBeenCalledWith({
      workspaceId: wsA,
      packageId: pkgIntlId,
      tierRank: 2,
      durationMonths: 3,
      durationDays: 90,
      nameAr: 'test-ar',
      nameEn: 'test-en',
      priceMinor: '15000',
      currency: 'USD',
      commissionRateBp: '500',
    });

    const enableBtn = [...host.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === m['packages.reactivateOffer'],
    )!;
    await act(async () => {
      enableBtn.click();
    });
    const dialog = host.querySelector('[data-testid="confirm-dialog"]');
    expect(dialog?.textContent).toContain('Egypt · Year-Round');
  });

  it('discards late category create response after workspace switch', async () => {
    let resolveLate!: (value: { status: 'ok'; packageId: string }) => void;
    mocks.createCategory.mockReturnValue(
      new Promise((resolve) => {
        resolveLate = resolve;
      }),
    );
    renderManager('en', emptyData);
    const egyptRadio = host.querySelector(
      'input[name="market"][value="Egypt"]',
    ) as HTMLInputElement;
    const yearRoundRadio = host.querySelector(
      'input[name="type"][value="Year-round"]',
    ) as HTMLInputElement;
    await act(async () => {
      egyptRadio.click();
      yearRoundRadio.click();
    });
    const form = egyptRadio.closest('form')!;
    await act(async () => {
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    const wsSelect = host.querySelector('select') as HTMLSelectElement;
    await act(async () => {
      wsSelect.value = wsB;
      wsSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      resolveLate({ status: 'ok', packageId: pkgEgyptId });
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  describe('PO category initialization control (S65-PO-15/20)', () => {
    it.each(['en', 'ar'] as const)(
      'renders category initialization control when fewer than 4 categories exist in %s',
      (locale) => {
        renderManager(locale, populatedData); // 2 categories
        const m = getMessages(locale);
        const heading = [...host.querySelectorAll('h2')].find(
          (h) => h.textContent?.trim() === m['packages.initializeCategories'],
        );
        expect(heading).toBeTruthy();
        expect(host.textContent).toContain(
          m['packages.initializeCategoriesHelp'],
        );
        const initBtn = [...host.querySelectorAll('button')].find(
          (b) => b.textContent?.trim() === m['packages.initializeCategories'],
        );
        expect(initBtn).toBeTruthy();
      },
    );

    it('does NOT render category initialization control when all 4 categories exist', () => {
      renderManager('en', fullCategoriesData);
      const m = getMessages('en');
      const heading = [...host.querySelectorAll('h2')].find(
        (h) => h.textContent?.trim() === m['packages.initializeCategories'],
      );
      expect(heading).toBeUndefined();
      const initBtn = [...host.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === m['packages.initializeCategories'],
      );
      expect(initBtn).toBeUndefined();
    });

    it.each(['en', 'ar'] as const)(
      'opens ConfirmDialog with approved strings and initializes categories in %s',
      async (locale) => {
        renderManager(locale, emptyData);
        const m = getMessages(locale);
        const initBtn = [...host.querySelectorAll('button')].find(
          (b) => b.textContent?.trim() === m['packages.initializeCategories'],
        )!;
        await act(async () => {
          initBtn.click();
        });

        const dialog = [
          ...host.querySelectorAll('[data-testid="confirm-dialog"]'),
        ].find((d) =>
          d.textContent?.includes(
            m['packages.initializeCategoriesConfirmTitle'],
          ),
        )!;
        expect(dialog).toBeTruthy();
        expect(dialog.textContent).toContain(
          m['packages.initializeCategoriesConfirmTitle'],
        );
        expect(dialog.textContent).toContain(
          m['packages.initializeCategoriesConfirmBody'],
        );

        const confirmBtn = dialog.querySelector(
          '[data-testid="dialog-confirm"]',
        ) as HTMLButtonElement;
        await act(async () => {
          confirmBtn.click();
        });

        expect(mocks.initializeCategories).toHaveBeenCalledWith({
          workspaceId: wsA,
        });
        expect(mocks.refresh).toHaveBeenCalledTimes(1);
        expect(host.textContent).toContain(
          m['packages.initializeCategoriesSuccess'],
        );
      },
    );

    it('displays error alert if initializePackageCategories fails', async () => {
      mocks.initializeCategories.mockResolvedValue({ status: 'denied' });
      renderManager('en', emptyData);
      const m = getMessages('en');
      const initBtn = [...host.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === m['packages.initializeCategories'],
      )!;
      await act(async () => {
        initBtn.click();
      });
      const dialog = [
        ...host.querySelectorAll('[data-testid="confirm-dialog"]'),
      ].find((d) =>
        d.textContent?.includes(m['packages.initializeCategoriesConfirmTitle']),
      )!;
      const confirmBtn = dialog.querySelector(
        '[data-testid="dialog-confirm"]',
      ) as HTMLButtonElement;
      await act(async () => {
        confirmBtn.click();
      });
      expect(host.textContent).toContain(m['packages.denied']);
    });
  });

  describe('PO reversible offer retirement (S65-PO-15/20)', () => {
    it.each(['en', 'ar'] as const)(
      'renders retired badge and reactivate button for inactive offers, and available badge with retire button for active offers in %s',
      (locale) => {
        renderManager(locale, populatedData);
        const m = getMessages(locale);
        expect(host.textContent).toContain(m['packages.retiredBadge']);
        expect(host.textContent).toContain(m['packages.available']);
        expect(host.textContent).not.toContain(m['packages.unavailableOffer']);
        expect(host.textContent).not.toContain(m['packages.disable']);
        expect(host.textContent).not.toContain(m['packages.enable']);

        const retireBtns = [...host.querySelectorAll('button')].filter(
          (b) => b.textContent?.trim() === m['packages.retireOffer'],
        );
        const reactivateBtns = [...host.querySelectorAll('button')].filter(
          (b) => b.textContent?.trim() === m['packages.reactivateOffer'],
        );
        // populatedData has 1 available offer and 1 retired offer; both appear in mobile card and table
        expect(retireBtns.length).toBeGreaterThanOrEqual(1);
        expect(reactivateBtns.length).toBeGreaterThanOrEqual(1);
      },
    );

    it.each(['en', 'ar'] as const)(
      'retires an available offer via ConfirmDialog with approved copy in %s',
      async (locale) => {
        renderManager(locale, populatedData);
        const m = getMessages(locale);
        const retireBtn = [...host.querySelectorAll('button')].find(
          (b) => b.textContent?.trim() === m['packages.retireOffer'],
        )!;
        await act(async () => {
          retireBtn.click();
        });

        const dialog = host.querySelector('[data-testid="confirm-dialog"]')!;
        expect(dialog).toBeTruthy();
        expect(dialog.textContent).toContain(m['packages.retireConfirmTitle']);
        expect(dialog.textContent).toContain(m['packages.retireConfirmBody']);

        const confirmBtn = dialog.querySelector(
          '[data-testid="dialog-confirm"]',
        ) as HTMLButtonElement;
        await act(async () => {
          confirmBtn.click();
        });

        expect(mocks.toggleAvailable).toHaveBeenCalledWith({
          workspaceId: wsA,
          offerId: 'offer-usd',
          available: false,
        });
        expect(host.textContent).toContain(m['packages.retireSuccess']);
      },
    );

    it.each(['en', 'ar'] as const)(
      'reactivates a retired offer via ConfirmDialog with approved copy in %s',
      async (locale) => {
        renderManager(locale, populatedData);
        const m = getMessages(locale);
        const reactivateBtn = [...host.querySelectorAll('button')].find(
          (b) => b.textContent?.trim() === m['packages.reactivateOffer'],
        )!;
        await act(async () => {
          reactivateBtn.click();
        });

        const dialog = host.querySelector('[data-testid="confirm-dialog"]')!;
        expect(dialog).toBeTruthy();
        expect(dialog.textContent).toContain(
          m['packages.reactivateConfirmTitle'],
        );
        expect(dialog.textContent).toContain(
          m['packages.reactivateConfirmBody'],
        );

        const confirmBtn = dialog.querySelector(
          '[data-testid="dialog-confirm"]',
        ) as HTMLButtonElement;
        await act(async () => {
          confirmBtn.click();
        });

        expect(mocks.toggleAvailable).toHaveBeenCalledWith({
          workspaceId: wsA,
          offerId: 'offer-egp',
          available: true,
        });
        expect(host.textContent).toContain(m['packages.reactivateSuccess']);
      },
    );
  });
});
