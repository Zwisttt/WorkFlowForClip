import { describe, expect, it } from 'vitest';
import { normalizeRiskTags } from '@electron/platform/base/RiskControl';

describe('normalizeRiskTags', () => {
  it('removes undefined pollution before kuaishou topic input', () => {
    expect(normalizeRiskTags([
      'undefined 看见孩子',
      '#undefined 好书推荐',
      '#undefined 好书',
      'undefined 大育儿准则',
    ], 4)).toEqual([
      '看见孩子',
      '好书推荐',
      '好书',
      '大育儿准则',
    ]);
  });

  it('normalizes hashes, empty values, and object tags', () => {
    expect(normalizeRiskTags([
      ' #亲子教育 ',
      undefined,
      null,
      'undefined',
      { name: '#好书' },
      { label: ' null 育儿' },
    ], 10)).toEqual(['亲子教育', '好书', '育儿']);
  });
});
