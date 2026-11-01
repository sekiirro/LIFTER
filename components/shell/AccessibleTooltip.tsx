'use client';

import {
  cloneElement,
  useEffect,
  useId,
  useMemo,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
} from 'react';
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
  children: ReactElement<TooltipTriggerProps>;
};

/** Adds an accessible, non-layout tooltip to one focusable trigger. */
export function AccessibleTooltip({
  label,
  tooltipClassName,
  tooltipTestId,
  children,
}: AccessibleTooltipProps) {
  const tooltipId = `accessible-tooltip-${useId()}`;
  const [visible, setVisible] = useState(false);
  const controller = useMemo(() => createTooltipController(setVisible), []);

  useEffect(() => () => controller.dispose(), [controller]);

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

  return (
    <span
      className={styles.trigger}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      {cloneElement(children, ariaProps)}
      <span
        id={tooltipId}
        role="tooltip"
        aria-hidden={!visible}
        data-visible={visible ? 'true' : 'false'}
        data-testid={tooltipTestId}
        className={[styles.tooltip, tooltipClassName].filter(Boolean).join(' ')}
      >
        {label}
      </span>
    </span>
  );
}
