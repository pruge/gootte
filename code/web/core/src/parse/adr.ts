/** ADR `.md` (body 필드 Status/Date) → 파싱. superseded-by 체인 추출. */
export interface AdrInfo {
  id: string;
  title: string;
  status: string;
  supersededBy: string | null;
  date: string;
}

export function parseAdr(content: string): AdrInfo {
  const idMatch = content.match(/#\s*ADR-(\d+)\s*:?\s*(.*)/);
  const statusRaw = content.match(/^Status:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const date = content.match(/^Date:\s*(\d{4}-\d{2}-\d{2})/m)?.[1] ?? "";
  const supersededBy = statusRaw.match(/superseded by\s+(ADR-\d+)/i)?.[1] ?? null;
  const status = supersededBy
    ? "superseded"
    : ((statusRaw.split("#")[0] ?? statusRaw).trim() || "unknown");
  return {
    id: idMatch?.[1] ? `ADR-${idMatch[1]}` : "",
    title: idMatch?.[2]?.trim() ?? "",
    status,
    supersededBy,
    date,
  };
}
