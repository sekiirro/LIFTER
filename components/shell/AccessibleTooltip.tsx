'use client';

import {
  cloneElement,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './AccessibleTooltip.module.css';

type TooltipTriggerProps = {
  'aria-label'?: string;
  'aria-describedby'?: string;
};

type TooltipAriaAttributes = {
  'aria-label': string;
  'aria-describedby'?: string;
};

/** Combines existing descriptions with the tooltip only while it is visible. */
export function getTooltipAriaAttributes(
  accessibleName: string,
  tooltipText: string,
  tooltipId: string,
  visible: boolean,
  existingDescription?: string,
  tooltipIsDistinct = tooltipText !== accessibleName,
): TooltipAriaAttributes {
  const describedBy = [
    existingDescription,
    visible && tooltipIsDistinct ? tooltipId : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    'aria-label': accessibleName,
    'aria-describedby': describedBy || undefined,
  };
}

type TimeoutHandle = ReturnType<typeof setTimeout>;

/** Small behavior controller so the interaction model can be tested without a DOM dependency. */
export function createTooltipController(
  onVisibilityChange: (visible: boolean) => void,
  schedule: typeof setTimeout = setTimeout,
  cancel: typeof clearTimeout = clearTimeout,
) {
  let hoverTimeout: TimeoutHandle | undefined;

  const cancelHover = () => {
    if (hoverTimeout !== undefined) {
      cancel(hoverTimeout);
      hoverTimeout = undefined;
    }
  };

  const hide = () => {
    cancelHover();
    onVisibilityChange(false);
  };

  return {
    pointerEnter(pointerType: string) {
      if (pointerType === 'touch') return;
      cancelHover();
      hoverTimeout = schedule(() => {
        hoverTimeout = undefined;
        onVisibilityChange(true);
      }, 300);
    },
    focusVisible() {
      cancelHover();
      onVisibilityChange(true);
    },
    pointerLeave: hide,
    blur: hide,
    escape: hide,
    dispose: cancelHover,
  };
}

export type AccessibleTooltipProps = {
  label: string;
  tooltipClassName?: string;
  tooltipTestId?: string;
  portalToBody?: boolean;
  children: ReactElement<TooltipTriggerProps>;
};

/** Adds an accessible, non-layout tooltip to one focusable trigger. */
export function AccessibleTooltip({
  label,
  tooltipClassName,
  tooltipTestId,
  portalToBody = false,
  children,
}: AccessibleTooltipProps) {
  const tooltipId = `accessible-tooltip-${useId()}`;
  const [visible, setVisible] = useState(false);
  const [portalPosition, setPortalPosition] = useState<{
    top: number;
    left: number;
    rtl: boolean;
  } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const controller = useMemo(() => createTooltipController(setVisible), []);
  const portalTarget =
    portalToBody && typeof document !== 'undefined' ? document.body : null;

  useEffect(() => () => controller.dispose(), [controller]);

  useLayoutEffect(() => {
    if (!visible || !portalToBody || !portalTarget) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const tooltip = tooltipRef.current;
      if (!trigger || !tooltip) return;
      const bounds = trigger.getBoundingClientRect();
      const rtl = getComputedStyle(trigger).direction === 'rtl';
      const gap = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--space-3',
        ),
      );
      setPortalPosition({
        top: bounds.top + bounds.height / 2,
        left: rtl ? bounds.left - (gap || 12) : bounds.right + (gap || 12),
        rtl,
      });
    };

    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [portalTarget, portalToBody, visible]);

  const childProps = children.props;
  const ariaProps = getTooltipAriaAttributes(
    childProps['aria-label'] ?? label,
    label,
    tooltipId,
    visible,
    childProps['aria-describedby'],
  );

  const handlePointerEnter = (event: PointerEvent<HTMLSpanElement>) => {
    controller.pointerEnter(event.pointerType);
  };

  const handlePointerLeave = () => controller.pointerLeave();

  const handleFocus = (event: FocusEvent<HTMLSpanElement>) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.matches(':focus-visible')) {
      controller.focusVisible();
    }
  };

  const handleBlur = () => controller.blur();

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'Escape') controller.escape();
  };

  const tooltip = (
    <span
      ref={portalToBody ? tooltipRef : undefined}
      id={tooltipId}
      role="tooltip"
      aria-hidden={!visible}
      data-visible={visible ? 'true' : 'false'}
      data-testid={tooltipTestId}
      className={[
        styles.tooltip,
        portalToBody && styles.tooltipPortal,
        portalPosition?.rtl && styles.tooltipPortalRtl,
        tooltipClassName,
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        portalToBody
          ? {
              top: portalPosition?.top ?? -10000,
              left: portalPosition?.left ?? -10000,
            }
          : undefined
      }
    >
      {label}
    </span>
  );

  return (
    <span
      ref={triggerRef}
      className={styles.trigger}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      {cloneElement(children, ariaProps)}
      {portalToBody && portalTarget
        ? createPortal(tooltip, portalTarget)
        : tooltip}
    </span>
  );
}
