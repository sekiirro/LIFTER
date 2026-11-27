import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Page from '../../app/(app)/payroll/page';
import { PayrollManager } from '../../components/payroll/PayrollManager';
import { ToastProvider } from '../../components/ui/Toast';
import { en } from '../../lib/i18n/messages/en';
import { ar } from '../../lib/i18n/messages/ar';

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  cookies: vi.fn(),
  getEligible: vi.fn(),
  getPayrollMonth: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/auth/actor', () => ({ requireActor: mocks.actor }));
vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('../../lib/workforce/payroll', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../lib/workforce/payroll')>();
  return {
    ...actual,
    getEligibleEmployees: mocks.getEligible,
    getPayrollMonth: mocks.getPayrollMonth,
  };
});

describe('Payroll UI: Page & Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: 'en' }),
    });
    mocks.getPayrollMonth.mockResolvedValue({
      status: 'ok',
      data: { salary: null, inputs: [], snapshot: null, approval: null },
    });
  });

  describe('Page Access Control', () => {
    it.each([['workspace_owner'], ['trainer'], ['sales']])(
      'denies access to non-PO role %s and renders denied message',
      async (role) => {
        mocks.actor.mockResolvedValue({
          userId: 'staff-user-1',
          role,
          activeWorkspaceIds: ['ws-1'],
        });

        const element = await Page();
        const html = renderToStaticMarkup(element);

        expect(html).toContain(en['workforce.payroll.review.denied']);
        expect(html).toContain('data-testid="payroll-denied"');
        expect(mocks.getEligible).not.toHaveBeenCalled();
        expect(mocks.getPayrollMonth).not.toHaveBeenCalled();
      },
    );

    it('grants access to platform_owner and renders payroll manager', async () => {
      mocks.actor.mockResolvedValue({
        userId: 'po-user-1',
        role: 'platform_owner',
        activeWorkspaceIds: [],
      });
      mocks.getEligible.mockResolvedValue({
        status: 'ok',
        employees: [
          { userId: '00000000-0000-0000-0000-000000000001', role: 'trainer' },
        ],
      });

      const element = await Page();
      const html = renderToStaticMarkup(element);

      expect(html).not.toContain('data-testid="payroll-denied"');
      expect(html).toContain('data-testid="payroll-manager"');
      expect(html).toContain(en['workforce.salary.title']);
      expect(html).toContain(en['workforce.payroll.input.title']);
      expect(html).toContain(en['workforce.payroll.review.title']);
      expect(mocks.getPayrollMonth).toHaveBeenCalledWith({
        employeeId: '00000000-0000-0000-0000-000000000001',
        effectiveMonth: expect.stringMatching(/^\d{4}-\d{2}$/),
      });
    });
  });

  describe('PayrollManager Component: Sections and i18n', () => {
    it('renders all three PO sections in English (LTR)', () => {
      const html = renderToStaticMarkup(
        <ToastProvider dismissLabel="Dismiss">
          <PayrollManager
            locale="en"
            messages={en}
            initialEmployees={[
              {
                userId: '00000000-0000-0000-0000-000000000001',
                role: 'trainer',
              },
            ]}
            initialMonth="2026-11"
            denied={false}
          />
        </ToastProvider>,
      );

      expect(html).toContain('dir="ltr"');
      expect(html).toContain(en['workforce.salary.title']);
      expect(html).toContain(en['workforce.salary.market']);
      expect(html).toContain(en['workforce.salary.market.egypt']);
      expect(html).toContain(en['workforce.salary.market.international']);
      expect(html).toContain(en['workforce.salary.currencyHint']);
      expect(html).toContain(en['workforce.payroll.employee']);
      expect(html).toContain(en['staff.clientDirectory.filters']);
      expect(html).toContain(en['workforce.payroll.input.title']);
      expect(html).toContain(en['workforce.payroll.input.category']);
      expect(html).toContain(en['workforce.payroll.input.category.incentive']);
      expect(html).toContain(en['workforce.payroll.input.category.deduction']);
      expect(html).toContain(en['workforce.payroll.input.deductionNote']);
      expect(html).toContain(en['workforce.payroll.input.category.correction']);
      expect(html).toContain(en['workforce.payroll.input.currencyLocked']);
      expect(html).toContain(en['workforce.payroll.review.title']);
      expect(html).toContain(en['workforce.payroll.review.empty']);
      expect(html).not.toContain('Client unavailable');
      expect(html).not.toContain('Invalid effective month');
      expect(html).not.toContain('Please select an employee.');
    });

    it('renders all three PO sections in Arabic (RTL) with Egyptian colloquial copy', () => {
      const html = renderToStaticMarkup(
        <ToastProvider dismissLabel="إلغاء">
          <PayrollManager
            locale="ar"
            messages={ar}
            initialEmployees={[
              {
                userId: '00000000-0000-0000-0000-000000000001',
                role: 'trainer',
              },
            ]}
            initialMonth="2026-11"
            denied={false}
          />
        </ToastProvider>,
      );

      expect(html).toContain('dir="rtl"');
      expect(html).toContain(ar['workforce.salary.title']); // المرتب الأساسي
      expect(html).toContain(ar['workforce.salary.market']); // السوق
      expect(html).toContain(ar['workforce.salary.market.egypt']); // مصر
      expect(html).toContain(ar['workforce.salary.market.international']); // دولي
      expect(html).toContain(ar['workforce.salary.currencyHint']); // مصر: EGP. دولي: EGP أو USD أو SAR.
      expect(html).toContain(ar['workforce.payroll.employee']); // الموظف
      expect(html).toContain(ar['staff.clientDirectory.filters']); // فلترة
      expect(html).toContain(ar['workforce.payroll.input.title']); // إضافة يدوية على المرتب
      expect(html).toContain(ar['workforce.payroll.input.category']); // نوع التعديل
      expect(html).toContain(ar['workforce.payroll.input.category.incentive']); // حافز
      expect(html).toContain(ar['workforce.payroll.input.category.deduction']); // خصم
      expect(html).toContain(ar['workforce.payroll.input.category.correction']); // تصحيح
      expect(html).toContain(ar['workforce.payroll.input.currencyLocked']); // العملة (عملة المرتب)
      expect(html).toContain(ar['workforce.payroll.review.title']); // ملخص مرتب الشهر
      expect(html).toContain(ar['workforce.payroll.review.empty']); // مفيش ملخص رواتب متاح للشهر ده.
    });

    it('renders denied state when denied prop is true', () => {
      const html = renderToStaticMarkup(
        <ToastProvider dismissLabel="إلغاء">
          <PayrollManager
            locale="ar"
            messages={ar}
            initialEmployees={[]}
            initialMonth="2026-11"
            denied={true}
          />
        </ToastProvider>,
      );

      expect(html).toContain(ar['workforce.payroll.review.denied']); // مش مسموح لك تشوف المرتبات.
      expect(html).toContain('data-testid="payroll-denied"');
      expect(html).not.toContain(ar['workforce.salary.title']);
    });
  });
});
