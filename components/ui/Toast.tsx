'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icon } from '../icons/Icon';
import { Button } from './Button';
import styles from './Toast.module.css';

type ToastApi = { success: (message: string) => void };
const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({
  children,
  dismissLabel,
}: {
  children: ReactNode;
  dismissLabel: string;
}) {
  const [toast, setToast] = useState<{ id: number; message: string } | null>(
    null,
  );
  const nextId = useRef(0);
  const timing = useRef({ id: 0, remaining: 5000 });
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const success = useCallback((message: string) => {
    setToast({ id: ++nextId.current, message });
  }, []);
  useEffect(() => {
    if (!toast || paused) return;
    if (timing.current.id !== toast.id)
      timing.current = { id: toast.id, remaining: 5000 };
    const started = Date.now();
    const timeout = window.setTimeout(
      () => setToast(null),
      timing.current.remaining,
    );
    return () => {
      window.clearTimeout(timeout);
      timing.current.remaining = Math.max(
        0,
        timing.current.remaining - (Date.now() - started),
      );
    };
  }, [toast, paused]);
  return (
    <ToastContext.Provider value={{ success }}>
      {children}
      <div
        className={[styles.container, toast && styles.visible]
          .filter(Boolean)
          .join(' ')}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setFocused(false);
        }}
      >
        {toast && <Icon name="check" />}
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid="toast-region"
        >
          {toast && <span key={toast.id}>{toast.message}</span>}
        </div>
        {toast && (
          <Button
            variant="secondary"
            aria-label={dismissLabel}
            data-testid="toast-dismiss"
            onClick={() => {
              setToast(null);
              setHovered(false);
              setFocused(false);
            }}
          >
            <Icon name="x" />
          </Button>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast requires ToastProvider');
  return api;
}
