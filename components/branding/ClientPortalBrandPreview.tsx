import { Bidi } from '../ui/Bidi';
import { BrandScope } from '../ui/BrandScope';
import { Card } from '../ui/Card';
import type { PortalBrandContract } from '../../lib/branding/portal-contract';
import type { Locale } from '../../lib/design/preferences';
import type { Messages } from '../../lib/i18n';
import styles from './client-portal-brand-preview.module.css';

export function ClientPortalBrandPreview({
  locale,
  messages,
  contract,
}: {
  locale: Locale;
  messages: Messages;
  contract: PortalBrandContract | null;
}) {
  return (
    <BrandScope
      color={contract?.color}
      className={styles.scope}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <Card
        as="section"
        className={styles.preview}
        aria-labelledby="client-portal-preview-title"
        data-client-portal-preview=""
      >
        <h2 id="client-portal-preview-title">
          {messages['branding.portalSurface']}
        </h2>
        <p className={styles.notice}>
          {messages['branding.portalPreviewNotice']}
        </p>
        {contract && (
          <p className={styles.identity}>
            <span aria-hidden="true" className={styles.swatch} />
            <Bidi>{contract.workspaceName}</Bidi>
          </p>
        )}
      </Card>
    </BrandScope>
  );
}
