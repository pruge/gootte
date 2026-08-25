import type { FeatureTicket } from "@gootte/contract";

/** 백로그 다섯 값 → 배지 문구(T04) — 화면 어휘는 issues 관례와 같게 맞춘다. `features` 탭
 * `TicketRow`와 `plan` 탭 `CardDialog` 둘 다 이 표 하나를 쓴다(같은 배지, 다른 판정 자리 X). */
export const BACKLOG_STATUS_LABEL: Partial<Record<FeatureTicket["status"], string>> = {
  pending: "queued",
  in_progress: "in flight",
  done: "done",
  dropped: "dropped",
};
