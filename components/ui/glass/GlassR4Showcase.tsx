'use client';

import { useState } from 'react';
import type { Locale } from '../../../lib/design/preferences';
import { GlassFab, GlassToolbarButton } from './GlassActions';
import { GlassPopoverMenu } from './GlassPopoverMenu';
import styles from './GlassR4Showcase.module.css';

export function GlassR4Showcase({ locale }: { locale: Locale }) {
  const [message, setMessage] = useState('');
  const arabic = locale === 'ar';
  const labels = arabic
    ? {
        region: 'معاينة الزجاج العائم',
        toolbar: 'إجراء ثانوي',
        fab: 'إجراء عائم ثانوي',
        menu: 'قائمة الروابط',
        newLink: 'رابط تسجيل جديد',
        recent: 'روابط التسجيل الأخيرة',
        done: 'تم تفعيل الإجراء التجريبي',
      }
    : {
        region: 'Floating glass samples',
        toolbar: 'Secondary toolbar action',
        fab: 'Secondary floating action',
        menu: 'Registration links menu',
        newLink: 'New registration link',
        recent: 'Recent registration links',
        done: 'Sample action activated',
      };

  return (
    <div className={styles.samples} role="region" aria-label={labels.region}>
      <div className={styles.toolbar}>
        <GlassToolbarButton
          aria-label={labels.toolbar}
          onClick={() => setMessage(labels.done)}
        >
          {arabic ? 'أداة' : 'Tool'}
        </GlassToolbarButton>
        <GlassPopoverMenu
          label={labels.menu}
          triggerLabel={arabic ? 'روابط' : 'Links'}
          trigger={arabic ? 'روابط' : 'Links'}
          items={[
            { label: labels.newLink, href: '#issue-heading' },
            { label: labels.recent, href: '#recent-heading' },
          ]}
        />
      </div>
      <div className={styles.fab}>
        <GlassFab
          aria-label={labels.fab}
          onClick={() => setMessage(labels.done)}
        >
          <span aria-hidden="true">+</span>
        </GlassFab>
      </div>
      <span className={styles.status} role="status" aria-live="polite">
        {message}
      </span>
    </div>
  );
}
