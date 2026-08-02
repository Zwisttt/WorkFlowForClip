import type { WebContents } from 'electron';

/**
 * Type through Chromium's input pipeline so controlled React/Semi Design
 * inputs update their internal state instead of only changing DOM text.
 */
export function typeEmbeddedInputValue(
  wc: WebContents,
  value: string,
  commitKey: 'Enter' | 'Tab' = 'Enter',
): void {
  const modifier = process.platform === 'darwin' ? 'meta' : 'control';
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers: [modifier] });
  wc.sendInputEvent({ type: 'keyUp', keyCode: 'A', modifiers: [modifier] });
  wc.insertText(value);
  wc.sendInputEvent({ type: 'keyDown', keyCode: commitKey });
  wc.sendInputEvent({ type: 'keyUp', keyCode: commitKey });
}

export function typeEmbeddedScheduleTime(wc: WebContents, value: string): void {
  typeEmbeddedInputValue(wc, value, 'Enter');
}
