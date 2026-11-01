import { expect, type Locator } from '@playwright/test';

export async function expectTooltipBesideTrigger(
  tooltip: Locator,
  trigger: Locator,
  direction: 'ltr' | 'rtl',
) {
  await expect
    .poll(async () => {
      const [tooltipBox, triggerBox, viewport] = await Promise.all([
        tooltip.boundingBox(),
        trigger.boundingBox(),
        tooltip.evaluate((element) => ({
          width: element.ownerDocument.documentElement.clientWidth,
          height: element.ownerDocument.documentElement.clientHeight,
        })),
      ]);
      if (!tooltipBox || !triggerBox) return false;

      const onScreen =
        tooltipBox.x >= 0 &&
        tooltipBox.y >= 0 &&
        tooltipBox.x + tooltipBox.width <= viewport.width &&
        tooltipBox.y + tooltipBox.height <= viewport.height;
      const beside =
        direction === 'rtl'
          ? tooltipBox.x + tooltipBox.width <= triggerBox.x + 2
          : tooltipBox.x >= triggerBox.x + triggerBox.width - 2;
      return onScreen && beside;
    })
    .toBe(true);
}
