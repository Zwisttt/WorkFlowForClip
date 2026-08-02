export function resolvePublishTaskTitle(rawTitle: unknown, contentId: string): string {
  return typeof rawTitle === 'string' ? rawTitle : `video_${contentId.slice(0, 8)}`;
}
