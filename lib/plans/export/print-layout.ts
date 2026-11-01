// F17 export print layout (T010).
// Shared, dependency-free descriptor for RTL/LTR print rendering.

export type PrintLocale = 'ar' | 'en';
export type PrintDirection = 'rtl' | 'ltr';
export type PrintTextAlign = 'start';

export type PrintLayout = Readonly<{
  lang: PrintLocale;
  dir: PrintDirection;
  textAlign: PrintTextAlign;
  documentClass: string;
}>;

export class PrintLayoutError extends Error {
  readonly code = 'invalid_print_locale';

  constructor(message: string) {
    super(message);
    this.name = 'PrintLayoutError';
  }
}

const PRINT_LAYOUTS = {
  ar: Object.freeze({
    lang: 'ar',
    dir: 'rtl',
    textAlign: 'start',
    documentClass: 'print-document print-document-ar',
  }),
  en: Object.freeze({
    lang: 'en',
    dir: 'ltr',
    textAlign: 'start',
    documentClass: 'print-document print-document-en',
  }),
} satisfies Record<PrintLocale, PrintLayout>;

export function resolvePrintLayout(locale: string): PrintLayout {
  if (locale === 'ar') return PRINT_LAYOUTS.ar;
  if (locale === 'en') return PRINT_LAYOUTS.en;
  throw new PrintLayoutError(
    `Unsupported print locale: ${locale === '' ? '(empty)' : locale}`,
  );
}
