import { describe, expect, it } from 'vitest';
import {
  calendarNavigationDirection,
  parseSemiCalendarMonthLabel,
} from '../../../../electron/platform/douyin/schedule-calendar';

describe('Semi DatePicker calendar helpers', () => {
  it('解析中文和英文月份标题', () => {
    expect(parseSemiCalendarMonthLabel('2026年 8月')).toEqual({ year: 2026, month: 8 });
    expect(parseSemiCalendarMonthLabel('August 2026')).toEqual({ year: 2026, month: 8 });
  });

  it('判断月份导航方向', () => {
    expect(calendarNavigationDirection({ year: 2026, month: 7 }, { year: 2026, month: 8 })).toBe('next');
    expect(calendarNavigationDirection({ year: 2026, month: 9 }, { year: 2026, month: 8 })).toBe('previous');
    expect(calendarNavigationDirection({ year: 2026, month: 8 }, { year: 2026, month: 8 })).toBe('done');
  });
});
