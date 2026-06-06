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
});
