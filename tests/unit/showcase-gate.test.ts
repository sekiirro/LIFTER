import { describe, expect, it } from 'vitest';
import { isShowcaseEnabled } from '../../lib/design/showcase';

describe('showcase gate', () => {
  it('enables only the exact flag', () => {
    expect(isShowcaseEnabled({ LIFTER_SHOWCASE: '1' })).toBe(true);
  });
  it.each([undefined, '', '0', 'true', 'yes', '01', ' 1', '1 '])(
    'disables %j',
    (value) => {
      expect(isShowcaseEnabled({ LIFTER_SHOWCASE: value })).toBe(false);
    },
  );
  it('disables when absent, irrespective of NODE_ENV', () => {
    expect(isShowcaseEnabled({})).toBe(false);
    expect(isShowcaseEnabled({ NODE_ENV: 'development' })).toBe(false);
    expect(isShowcaseEnabled({ NODE_ENV: 'production' })).toBe(false);
  });
});
