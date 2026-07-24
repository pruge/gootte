import matter from "gray-matter";

/** 순수 — 문자열 in, 파싱 out. fs 접근 없음(INV-1/INV-2). */
export interface Doc {
  data: Record<string, unknown>;
  body: string;
}

export function frontmatter(content: string): Doc {
  const parsed = matter(content);
  return { data: parsed.data as Record<string, unknown>, body: parsed.content };
}

export function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** YAML 이 날짜를 Date 로 파싱해도 원본 YYYY-MM-DD 유지. */
export function dstr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v == null ? "" : String(v);
}

export function arr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}
