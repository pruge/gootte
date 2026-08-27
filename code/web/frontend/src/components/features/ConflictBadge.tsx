import { IconGitPullRequestConflict } from "@tabler/icons-react";
import type { FeatureConflict } from "@gootte/contract";

/**
 * T03 — 갈라짐 표시. 조상 관계가 없는 두 사본에 같은 파일이 다르게 있어 어느 쪽도 나중 판이라고
 * 말할 수 없을 때(T02 §Decisions 4단계 마지막 갈래, ADR-0001) 조용히 한쪽을 고르지 않고
 * **화면이 말한다.** `UnresolvedWork`(FeaturesView)와 같은 화법 — 감추지 않고, 어느 파일이
 * 어느 사본들 사이에서 갈라졌는지 title 로 verbatim 릴레이한다(INV-4). 색은 "알 수 없는 상태"
 * 배지와 같은 `text-drop` — 정답을 말하는 배지가 아니라는 뜻을 같은 색으로 잇는다.
 *
 * `conflicts` 가 비면 아무것도 그리지 않는다(모르면 배지를 안 띄운다, `deriveHeaderBadge` 와
 * 같은 규율).
 */
export function ConflictBadge({ conflicts }: { conflicts: readonly FeatureConflict[] }) {
  if (conflicts.length === 0) return null;
  const title = conflicts.map((c) => `${c.path} — ${c.copies.join(", ")}`).join("\n");
  const label = conflicts.length === 1 ? "갈라짐" : `갈라짐 ${conflicts.length}`;
  return (
    <span
      role="status"
      className="mono flex shrink-0 items-center gap-1 rounded bg-drop/15 px-1.5 py-0.5 text-sm font-medium text-drop"
      title={title}
    >
      <IconGitPullRequestConflict size={13} />
      {label}
    </span>
  );
}
