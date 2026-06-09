/**
 * 定时发布日期格式化工具
 *
 * 参考竞品 social-auto-upload 实践：
 * - 抖音 Semi Design DatePicker：使用 `click → Ctrl+A → keyboard.type → Enter` 方式输入，
 *   格式为 YYYY-MM-DD HH:mm（见 uploader/douyin_uploader/main.py:280-291）
 * - 快手 Ant Design DatePicker：同样使用 `Ctrl+A → type → Enter`，
 *   格式为 YYYY-MM-DD HH:mm:ss（见 uploader/ks_uploader/main.py:311-321）
 *
 * 注意：不要用 humanType（慢速逐字符键入），因为 Semi/Ant Design 的 DatePicker
 * 会实时解析部分输入，导致日期选择异常。
 */

/**
 * 格式化定时发布时间字符串
 * @param value Date 对象、字符串或 null
 * @param options.withSeconds 是否包含秒数（默认 false，快手需要 true）
 * @returns 格式化后的时间字符串，如 "2026-06-09 14:30" 或 "2026-06-09 14:30:00"
 */
export function formatScheduleDateTime(
  value?: string | Date | null,
  options: { withSeconds?: boolean } = {},
): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const pad = (n: number) => String(n).padStart(2, '0');
  const base = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (options.withSeconds) {
    return `${base}:${pad(date.getSeconds())}`;
  }
  return base;
}
