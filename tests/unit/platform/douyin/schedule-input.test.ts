import { describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import {
  typeEmbeddedInputValue,
  typeEmbeddedScheduleTime,
} from '../../../../electron/platform/douyin/schedule-input';

describe('typeEmbeddedScheduleTime', () => {
  it('用真实键盘事件全选、输入并确认定时时间', () => {
    const sendInputEvent = vi.fn();
    const insertText = vi.fn();
    const wc = { sendInputEvent, insertText } as unknown as WebContents;

    typeEmbeddedScheduleTime(wc, '2026-08-03 17:32');

    const modifier = process.platform === 'darwin' ? 'meta' : 'control';
    expect(sendInputEvent.mock.calls).toEqual([
      [{ type: 'keyDown', keyCode: 'A', modifiers: [modifier] }],
      [{ type: 'keyUp', keyCode: 'A', modifiers: [modifier] }],
      [{ type: 'keyDown', keyCode: 'Enter' }],
      [{ type: 'keyUp', keyCode: 'Enter' }],
    ]);
    expect(insertText).toHaveBeenCalledWith('2026-08-03 17:32');
  });

  it('可用 Tab 提交日期部分并继续填写时间', () => {
    const sendInputEvent = vi.fn();
    const insertText = vi.fn();
    const wc = { sendInputEvent, insertText } as unknown as WebContents;

    typeEmbeddedInputValue(wc, '2026-08-03', 'Tab');

    expect(sendInputEvent.mock.calls.at(-2)).toEqual([{ type: 'keyDown', keyCode: 'Tab' }]);
    expect(sendInputEvent.mock.calls.at(-1)).toEqual([{ type: 'keyUp', keyCode: 'Tab' }]);
    expect(insertText).toHaveBeenCalledWith('2026-08-03');
  });
});
