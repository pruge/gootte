import type { TicketTimeRecord, Feature } from "@gootte/contract";

/** 티켓 참조 — feature + ticket 식별자 */
export interface TicketRef {
  feature: string;
  ticket: string;
}

/** 해결된 티켓 키 — package 내부에서 사용하는 절대 경로 형태 */
export interface ResolvedTicketKey {
  feature: string;
  ticket: string;
  path: string;
}

/** 레코드 연산 결과 래퍼 */
export type LedgerResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: LedgerConflict };

/** 레코드 충돌 — 명시적 실패 코드 */
export interface LedgerConflict {
  ok: false;
  code: LedgerConflictCode;
  message: string;
  detail?: string;
}

export type LedgerConflictCode =
  | "not-found"
  | "different-repo"
  | "hash-mismatch"
  | "corrupt"
  | "locked"
  | "conflict";

/** TimedTicketRecord는 contract의 TicketTimeRecord와 동일한 모양(alias) */
export type TimedTicketRecord = TicketTimeRecord;

/** importLegacy 결과 요약 */
export interface ImportSummary {
  imported: number;
  skipped: number;
  conflicts: number;
}
