import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockExistsSync = vi.fn();
const mockCookieExists = vi.fn();
const mockGetCookiePath = vi.fn(() => '/tmp/generated/channels-account.json');

vi.mock('fs', () => ({
  default: {
    existsSync: mockExistsSync,
  },
  existsSync: mockExistsSync,
}));

vi.mock('@electron/platform/channels/cookie', () => ({
  getCookiePath: mockGetCookiePath,
  cookieExists: mockCookieExists,
}));

vi.mock('patchright', () => ({
  chromium: {
    launch: vi.fn(),
  },
}));

vi.mock('@electron/platform/base/DebugRecorder', () => ({
  getDebugRecorder: () => ({
    setSessionId: vi.fn(),
    recordStep: vi.fn((_name: string, fn: () => unknown) => fn()),
  }),
}));

describe('channels/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockCookieExists.mockReturnValue(false);
  });

  it('uses cookiePath from upload context before falling back to generated path', async () => {
    const { uploadVideo } = await import('@electron/platform/channels/upload');

    const result = await uploadVideo({
      accountId: 'channels_account',
      videoPath: '/tmp/video.mp4',
      title: '测试视频',
      cookiePath: '/tmp/db/channels_account.json',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('/tmp/db/channels_account.json');
    expect(mockCookieExists).toHaveBeenCalledWith('/tmp/db/channels_account.json');
    expect(mockGetCookiePath).not.toHaveBeenCalled();
  });

  it('builds the embedded video description without the internal task title', async () => {
    const { buildEmbeddedDescriptionText } = await import('@electron/platform/channels/upload');

    const result = buildEmbeddedDescriptionText({
      accountId: 'channels_account',
      videoPath: '/tmp/video.mp4',
      title: '父母的觉醒好书推荐',
      description: '孩子不需要我们的主张和期望',
      tags: ['好书推荐', '父母的觉醒'],
    });

    expect(result.text).toBe('孩子不需要我们的主张和期望');
    expect(result.text).not.toContain('父母的觉醒好书推荐');
    expect(result.tagCount).toBe(2);
  });

  it('does not fall back to the internal task title when the video description is empty', async () => {
    const { buildEmbeddedDescriptionText } = await import('@electron/platform/channels/upload');

    const result = buildEmbeddedDescriptionText({
      accountId: 'channels_account',
      videoPath: '/tmp/video.mp4',
      title: '父母的觉醒好书推荐',
    });

    expect(result.text).toBe('');
  });

  it('builds the embedded short title from the internal task title', async () => {
    const { buildEmbeddedShortTitle } = await import('@electron/platform/channels/upload');

    expect(buildEmbeddedShortTitle({
      accountId: 'channels_account',
      videoPath: '/tmp/video.mp4',
      title: '父母的觉醒好书推荐',
      description: '孩子不需要我们的主张和期望',
    })).toBe('父母的觉醒好书推荐');
  });

  it('clicks the location row right edge and selects hide-location from a portal root', async () => {
    vi.useFakeTimers();
    const executeJavaScript = vi.fn()
      .mockResolvedValueOnce({ clicked: true, text: '选择位置', method: 'right-edge' })
      .mockImplementationOnce(async (script: string) => {
        expect(() => new Function(`return ${script}`)).not.toThrow();
        return { picked: false, debug: [], rootsContainingTarget: 1 };
      })
      .mockResolvedValueOnce({ picked: true, text: '不显示位置', tag: 'DIV' });

    try {
      const { applyEmbeddedLocation } = await import('@electron/platform/channels/upload');
      const promise = applyEmbeddedLocation({ executeJavaScript } as never, '');
      await vi.runAllTimersAsync();

      await expect(promise).resolves.toBe(true);
      expect(executeJavaScript.mock.calls[0][0]).toContain('elementFromPoint');
      expect(executeJavaScript.mock.calls[1][0]).toContain('const roots = collectRoots()');
      expect(executeJavaScript.mock.calls[1][0]).toContain("querySelectorAll('*')");
      expect(executeJavaScript.mock.calls[1][0]).toContain('不显示位置');
      expect(executeJavaScript).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the embedded browser open when a sequential field step fails', async () => {
    const { shouldKeepBrowserOnPublishFailure } = await import('@electron/platform/channels/upload');

    expect(shouldKeepBrowserOnPublishFailure('视频号位置设置失败，未能选择“不显示位置”')).toBe(true);
    expect(shouldKeepBrowserOnPublishFailure('视频号定时发表设置失败')).toBe(true);
    expect(shouldKeepBrowserOnPublishFailure('视频号原创声明未完成')).toBe(true);
    expect(shouldKeepBrowserOnPublishFailure('视频上传超时或失败')).toBe(false);
  });

  it('only applies the channels original statement when declaration is original', async () => {
    const { shouldApplyOriginalStatement } = await import('@electron/platform/channels/upload');
    const baseContext = {
      accountId: 'channels_account',
      videoPath: '/tmp/video.mp4',
      title: '原创视频测试',
    };

    expect(shouldApplyOriginalStatement({
      ...baseContext,
      declaration: 'original',
    })).toBe(true);
    expect(shouldApplyOriginalStatement({
      ...baseContext,
      declaration: '',
    })).toBe(false);
  });

  it('applies the embedded original declaration in three verified steps', async () => {
    vi.useFakeTimers();
    const executeJavaScript = vi.fn()
      .mockImplementationOnce(async (script: string) => {
        expect(() => new Function(`return ${script}`)).not.toThrow();
        expect(script).toContain("text === '声明原创'");
        return {
          found: true,
          clicked: true,
          alreadyChecked: true,
          method: 'native-checkbox',
        };
      })
      .mockImplementationOnce(async (script: string) => {
        expect(() => new Function(`return ${script}`)).not.toThrow();
        expect(script).toContain("normalized.includes('我已阅读并同意')");
        expect(script).toContain("normalized.includes('原创声明须知')");
        expect(script).toContain("normalized.includes('使用条款')");
        return {
          found: true,
          acted: true,
          accepted: true,
          method: 'native-checkbox',
          debug: null,
        };
      })
      .mockImplementationOnce(async (script: string) => {
        expect(() => new Function(`return ${script}`)).not.toThrow();
        expect(script).toContain("=== '声明原创'");
        return { found: true, clicked: true, text: '声明原创' };
      })
      .mockImplementationOnce(async (script: string) => {
        expect(() => new Function(`return ${script}`)).not.toThrow();
        return true;
      });

    try {
      const { applyEmbeddedOriginalStatement } = await import('@electron/platform/channels/upload');
      const resultPromise = applyEmbeddedOriginalStatement({
        executeJavaScript,
      } as never, {
        accountId: 'channels_account',
        videoPath: '/tmp/video.mp4',
        title: '原创视频测试',
        declaration: 'original',
      });
      await vi.runAllTimersAsync();

      await expect(resultPromise).resolves.toBe(true);
      expect(executeJavaScript).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for an asynchronously updated custom original checkbox instead of failing immediately', async () => {
    vi.useFakeTimers();
    const executeJavaScript = vi.fn()
      .mockResolvedValueOnce({
        found: true,
        clicked: true,
        alreadyChecked: false,
        method: 'custom-checkbox',
      })
      .mockResolvedValueOnce({
        found: true,
        acted: true,
        accepted: false,
        reason: 'waiting-for-checked-state',
        debug: null,
      })
      .mockResolvedValueOnce({
        found: true,
        acted: false,
        accepted: true,
        method: 'declare-button-enabled',
        debug: null,
      })
      .mockResolvedValueOnce({
        found: true,
        clicked: true,
        disabled: false,
        text: '声明原创',
      })
      .mockResolvedValueOnce(true);

    try {
      const { applyEmbeddedOriginalStatement } = await import('@electron/platform/channels/upload');
      const resultPromise = applyEmbeddedOriginalStatement({
        executeJavaScript,
      } as never, {
        accountId: 'channels_account',
        videoPath: '/tmp/video.mp4',
        title: '原创视频测试',
        declaration: 'original',
      });
      await vi.runAllTimersAsync();

      await expect(resultPromise).resolves.toBe(true);
      expect(executeJavaScript).toHaveBeenCalledTimes(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it('continues an existing original dialog when retrying with the main checkbox already checked', async () => {
    vi.useFakeTimers();
    const executeJavaScript = vi.fn()
      .mockResolvedValueOnce({
        found: true,
        clicked: false,
        alreadyChecked: true,
        method: 'native-already-checked',
      })
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({
        found: true,
        acted: false,
        accepted: true,
        method: 'native-checked',
        debug: null,
      })
      .mockResolvedValueOnce({
        found: true,
        clicked: true,
        disabled: false,
        text: '声明原创',
      })
      .mockResolvedValueOnce(true);

    try {
      const { applyEmbeddedOriginalStatement } = await import('@electron/platform/channels/upload');
      const resultPromise = applyEmbeddedOriginalStatement({
        executeJavaScript,
      } as never, {
        accountId: 'channels_account',
        videoPath: '/tmp/video.mp4',
        title: '原创视频测试',
        declaration: 'original',
      });
      await vi.runAllTimersAsync();

      await expect(resultPromise).resolves.toBe(true);
      expect(executeJavaScript).toHaveBeenCalledTimes(5);
    } finally {
      vi.useRealTimers();
    }
  });
});
