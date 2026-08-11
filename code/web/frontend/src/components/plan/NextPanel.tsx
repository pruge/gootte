import type { NextEmptyReason, NextResult } from "@gootte/contract";

const EMPTY_REASON_LABEL: Record<NextEmptyReason, string> = {
  all_blocked: "전부 막힘",
  all_claimed: "전부 임자 있음",
  mixed: "막힘·임자 있음이 섞임",
  no_steps: "이 트랙엔 계획된 단계가 없다",
  all_done: "이 트랙은 다 끝났다",
};

/**
 * `next` 버튼을 눌렀을 때 트랙별 요약 — 티켓은 본문 칩이 강조로 보여준다(중복 X).
 * 🔴 빈 결과일 때는 강조할 칩이 없으므로 여기서 이유를 말한다 — "할 일 없음" 과
 * "전부 막힘" 을 화면이 구분 못 하면 안 된다(spec §next 버튼).
 */
export function NextPanel({ next }: { next: NextResult }) {
  if (next.tracks.length === 0) {
    return <p className="text-sm text-muted">(계획된 트랙 없음)</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {next.tracks.map((t) => (
        <li
          key={t.track}
          className="mono flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-sm"
        >
          <span className="text-muted">{t.track}</span>
          {t.tickets.length > 0 ? (
            <span className="font-medium text-accent">지금 {t.tickets.length}개 나란히</span>
          ) : (
            <span className="text-muted">— {EMPTY_REASON_LABEL[t.emptyReason ?? "no_steps"]}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
