'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { GlassSurface, type GlassFallback } from './GlassSurface';
import styles from './GlassPopoverMenu.module.css';

export type GlassPopoverItem = {
  label: string;
  href: string;
  current?: boolean;
};

export function getGlassMenuKeyAction(
  key: string,
  activeIndex: number,
  itemCount: number,
) {
  if (!itemCount) return null;
  if (key === 'Escape') return { type: 'restore-trigger' as const };
  if (key === 'Tab') return { type: 'close' as const };
  if (key === ' ' || key === 'Spacebar') return { type: 'activate' as const };
  if (key === 'Home') return { type: 'focus' as const, index: 0 };
  if (key === 'End') return { type: 'focus' as const, index: itemCount - 1 };
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    const step = key === 'ArrowDown' ? 1 : -1;
    return {
      type: 'focus' as const,
      index: (activeIndex + step + itemCount) % itemCount,
    };
  }
  return null;
}

export function getGlassMenuInitialFocusIndex(
  openingKey: string | null,
  itemCount: number,
) {
  if (itemCount === 0) return -1;
  return openingKey === 'ArrowUp' ? itemCount - 1 : 0;
}

export function GlassPopoverMenu({
  label,
  triggerLabel,
  trigger,
  items,
  fallback = 'auto',
}: {
  label: string;
  triggerLabel: string;
  trigger: ReactNode;
  items: readonly GlassPopoverItem[];
  fallback?: GlassFallback;
}) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<'top' | 'bottom'>('top');
  const [alignment, setAlignment] = useState<'start' | 'end'>('end');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const openingKeyRef = useRef<'ArrowDown' | 'ArrowUp' | null>(null);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const root = rootRef.current?.getBoundingClientRect();
      const menu = menuRef.current?.getBoundingClientRect();
      if (!root || !menu) return;
      const spaceAbove = root.top;
      const spaceBelow = window.innerHeight - root.bottom;
      setPlacement(
        spaceAbove < menu.height + 12 && spaceBelow > spaceAbove
          ? 'bottom'
          : 'top',
      );
      const overflowLeft = menu.left < 8;
      const overflowRight = menu.right > window.innerWidth - 8;
      const rtl = getComputedStyle(rootRef.current!).direction === 'rtl';
      if (rtl) {
        if (overflowRight) setAlignment('start');
        else setAlignment('end');
      } else if (overflowLeft) setAlignment('start');
      else setAlignment('end');
      const entries =
        menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
      const focusIndex = getGlassMenuInitialFocusIndex(
        openingKeyRef.current,
        entries?.length ?? 0,
      );
      if (focusIndex >= 0)
        entries?.[focusIndex]?.focus({ preventScroll: true });
      openingKeyRef.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnResize = () => setOpen(false);
    document.addEventListener('pointerdown', closeOutside);
    window.addEventListener('resize', closeOnResize);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('resize', closeOnResize);
    };
  }, [open]);

  const closeAndRestore = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const entries = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    const index = entries.indexOf(document.activeElement as HTMLElement);
    const action = getGlassMenuKeyAction(event.key, index, entries.length);
    if (action?.type === 'activate') {
      event.preventDefault();
      entries[index]?.click();
    } else if (action?.type === 'restore-trigger') {
      event.preventDefault();
      closeAndRestore();
    } else if (action?.type === 'focus') {
      event.preventDefault();
      entries[action.index]?.focus();
    } else if (action?.type === 'close') {
      setOpen(false);
    }
  };

  return (
    <div className={styles.root} ref={rootRef} data-glass-menu-root="">
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        onClick={() => {
          openingKeyRef.current = null;
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            openingKeyRef.current = event.key;
            setOpen(true);
          }
        }}
      >
        {trigger}
      </button>
      {open && (
        <GlassSurface
          ref={menuRef}
          role="menu"
          aria-label={label}
          className={styles.menu}
          fallback={fallback}
          data-placement={placement}
          data-alignment={alignment}
          data-glass-popover=""
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item) => (
            <a
              key={`${item.href}:${item.label}`}
              role="menuitem"
              tabIndex={-1}
              href={item.href}
              aria-current={item.current ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </a>
          ))}
        </GlassSurface>
      )}
    </div>
  );
}
