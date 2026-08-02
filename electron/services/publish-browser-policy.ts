const CHANNELS_INTERACTIVE_FAILURES = [
  '视频号描述或短标题填写失败',
  '视频号位置设置失败',
  '视频号定时发表设置失败',
  '视频号原创声明未完成',
];

const DOUYIN_INTERACTIVE_FAILURES = [
  '抖音定时发布时间设置失败',
  '抖音定时发布时间未成功写入',
];

export function shouldPreserveStandaloneBrowserAfterFailure(
  platform: string,
  failureMessage: string,
): boolean {
  if (platform === 'channels') {
    return CHANNELS_INTERACTIVE_FAILURES.some((message) => failureMessage.includes(message));
  }
  if (platform === 'douyin') {
    return DOUYIN_INTERACTIVE_FAILURES.some((message) => failureMessage.includes(message));
  }
  return false;
}
