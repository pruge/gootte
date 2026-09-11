/** 바이트 수 → 사람 단위(settings-storage-meter). null(잴 수 없음)은 "확인 불가". */
export function formatBytes(totalBytes: number | null | undefined): string {
  if (totalBytes === null || totalBytes === undefined) return "확인 불가";
  if (totalBytes < 1024) return `${totalBytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = totalBytes;
  let unit = "B";
  for (const u of units) {
    value /= 1024;
    unit = u;
    if (value < 1024) break;
  }
  return `${value >= 100 ? Math.round(value) : Math.round(value * 10) / 10} ${unit}`;
}
