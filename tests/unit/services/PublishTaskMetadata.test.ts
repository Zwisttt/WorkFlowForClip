import { describe, expect, it } from 'vitest';
import { resolvePublishTaskTitle } from '../../../electron/services/publish-task-metadata';

describe('resolvePublishTaskTitle', () => {
  it('保留自动化任务有意设置的空标题', () => {
    expect(resolvePublishTaskTitle('', '/Users/mac/Movies/video.mov')).toBe('');
  });

  it('仅在标题字段不存在时生成兼容旧任务的兜底标题', () => {
    expect(resolvePublishTaskTitle(undefined, 'content-123456')).toBe('video_content-');
  });
});
