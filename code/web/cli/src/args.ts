/** CLI 인자 파싱 — `--flag value` / `--flag`(불리언) / 위치 인자. 순수 배선. */

export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

/** `<기능>/<번호>` 를 가른다 — 마지막 `/` 기준(기능 slug 에 `/` 가 없으므로 안전). */
export function parseTicketRef(ref: string): { feature: string; ticket: string } | null {
  const idx = ref.lastIndexOf("/");
  if (idx <= 0 || idx === ref.length - 1) return null;
  return { feature: ref.slice(0, idx), ticket: ref.slice(idx + 1) };
}

/** CLI 사용자 오류 — main.ts 가 usage 로 잡아 exit 1. 시스템 예외와 구분한다. */
export class CliError extends Error {}
