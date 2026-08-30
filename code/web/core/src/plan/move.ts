import type { Feature, Placement, PlanArea, PlanMoveRequest } from "@gootte/contract";
import { allTickets } from "../project/features";
import { assignSteps } from "./auto-step";
import { compareBySeq } from "./board";
import { ticketBoxState } from "./close";

/**
 * "아직 순서를 안 정했다" 가 붙는 단계(steps-start-from-dependencies/T02).
 * 등록 시 의존에서 계산한 단계가 심어지고, 계산할 수 없는 티켓(순환 · 존재하지 않는
 * 번호 · 해소되지 않는 산문)만 이 값으로 남아 눈에 띈다.
 *
 * 🔴 **이 숫자는 여기 한 곳에서만 나온다** — 화면이나 저장소가 따로 9999 를 알면 그 순간
 * "아직 순서를 안 정했다" 를 뜻하는 표현이 둘이 된다.
 */
export const UNRANKED_STEP = 9999;

/** `step` 표 한 줄. */
export interface StepRow {
  feature: string;
  ticket: string;
  step: number;
}

/**
 * 한 번의 이동이 계획 DB 에 남길 것 전부 — **덮어쓰기뿐이다.**
 * 🔴 이동 이력을 남기지 않는다(티켓 03 §이 티켓이 하지 않는다). 옛 `history.md` 는 01 이 걷어냈고
 * 되살리지 않는다 — 아무도 읽지 않는 기록은 낡기만 한다.
 */
export interface PlanWritePlan {
  /** 자리 행 덮어쓰기 — 목적지 칸의 카드 **전부**(끼워 넣느라 seq 를 다시 매겼다). */
  upsert: Placement[];
  /** 자리 행 삭제 — 대기로 간 기능(대기는 행이 없다는 것 그 자체다, INV-B1). */
  remove: string[];
  /** 단계 행을 통째로 지울 기능 — 작업 대상을 떠났다(spec §단계는 잠시 붙었다 사라지는 것이다). */
  clearSteps: string[];
  /** 붙일 단계 행 — 작업 대상으로 올라온 기능의 남은(open) 티켓, 의존에서 계산한 값. */
  setSteps: StepRow[];
}

const EMPTY: PlanWritePlan = { upsert: [], remove: [], clearSteps: [], setSteps: [] };

/**
 * 완료 칸의 닫힌 시각 — **들어가는 순간에만 찍힌다.**
 * 이미 완료 칸에 있던 카드는 옆 카드가 끼어들어 seq 가 밀려도 제 시각을 그대로 지킨다.
 * 완료를 떠나면 null 이다 — 닫히지 않은 카드가 닫힌 시각을 이고 있으면 그것이 곧 거짓말이다.
 */
function closedAtFor(area: PlanArea, prev: Placement | undefined, now: string): string | null {
  if (area !== "done") return null;
  return prev?.area === "done" ? prev.closedAt : now;
}

/**
 * 캡틴이 카드를 놓았다 → 계획 DB 에 무엇을 쓸 것인가. **판정하는 자리는 여기 하나뿐이다** —
 * 끌어 놓기도, 카드 머리의 이동 대화상자도, 여러 장을 한 번에 옮기는 것도 전부 이 함수를 지난다
 * (spec §판정 자리는 하나뿐).
 *
 * 🔴 **놓을 수 있는지 검사하지 않는다**(INV-B3). 거절도 경고도 없다 — 캡틴이 놓은 자리가 곧 정답이다.
 * 남은 티켓을 안은 채 완료로 가는 것도 여기서는 그냥 이동이고, 이유를 묻지 않는다(캡틴 결정).
 *
 * 🔴 **문서가 없는 슬러그는 떨어진다** — 자리 행 하나로 카드를 지어내지 않는다
 * (`splitIntoAreas` 와 같은 규율). 요청에 그런 이름이 섞여 있으면 경계(backend)가 먼저 거절한다.
 *
 * 🔴 **옛 단계 숫자를 되살리지 않는다.** 되올린 카드도 지금 문서의 의존에서 새로 계산한다 —
 * 살려 두면 아무도 아직 맞는지 확인하지 않은 낡은 계획이 새 계획인 척한다(티켓 03 §만드는 것).
 *
 * @param now 완료 칸에 들어가는 카드에 찍을 시각. 호출자가 준다 — 계산을 시계에서 떼어 놓는다.
 */
export function planMove(
  features: readonly Feature[],
  placements: readonly Placement[],
  move: PlanMoveRequest,
  now: string,
): PlanWritePlan {
  const featureOf = new Map(features.map((f) => [f.slug, f]));
  const rowOf = new Map(placements.map((p) => [p.feature, p]));

  // 캡틴이 집은 순서 그대로, 같은 것은 한 번만.
  const moved = [...new Set(move.features)].filter((slug) => featureOf.has(slug));
  if (moved.length === 0) return EMPTY;

  const wasActive = (slug: string): boolean => rowOf.get(slug)?.area === "active";
  const toActive = move.area === "active";

  const plan: PlanWritePlan = {
    upsert: [],
    remove: move.area === null ? moved : [],
    // 떠나면 지운다 — 작업 대상 안에서 순서만 바꾼 카드는 떠난 것이 아니라 그대로 둔다.
    clearSteps: toActive ? [] : moved.filter(wasActive),
    // 올라오면 붙인다 — 이미 작업 대상에 있던 카드의 단계는 건드리지 않는다(D1: 자동 배정은
    // 등록 시 1회뿐이라 wasActive 필터가 그것을 보장한다). 심는 값은 의존 위상에서 계산한다(T02).
    setSteps: toActive
      ? moved
          .filter((slug) => !wasActive(slug))
          .flatMap((slug) => {
            const f = featureOf.get(slug);
            const all = f ? allTickets(f) : [];
            // 🔴 완료/폐기 티켓은 레벨 계산에서 완전히 제외 — 끝난 일은 남은 일에 선행으로
            // 남지 않으므로(선행이 "끝나서 풀렸다" = 더 이상 block 안 함).
            const openTickets = all.filter((t) => ticketBoxState(t) === "open");
            // 완료/폐기 티켓 번호 집합을 assignSteps 에 전달 — 의존이 이 번호면 "이미 끝남"으로 간주
            const doneNums = new Set(
              all.filter((t) => ticketBoxState(t) !== "open")
                .map((t) => Number.parseInt(t.num, 10))
                .filter((n) => !Number.isNaN(n))
            );
            const steps = assignSteps(openTickets, doneNums);
            return openTickets.map((t) => ({
              feature: slug,
              ticket: t.slug,
              step: steps.get(t.slug) ?? UNRANKED_STEP,
            }));
          })
      : [],
  };

  // 대기로 가는 길은 행을 지우는 것뿐이다 — 끼워 넣을 자리도, 매길 순서도 없다.
  if (move.area === null) return plan;
  const area = move.area;

  const movedSet = new Set(moved);
  // 🔴 자리는 **캡틴이 화면에서 본 카드들** 기준으로 센다 — 문서가 지워져 화면에 없는 행
  // (`splitIntoAreas` 가 감추는 것)이 끼면 캡틴이 센 자리와 서버가 센 자리가 어긋난다.
  const staying = placements
    .filter((p) => p.area === area && !movedSet.has(p.feature) && featureOf.has(p.feature))
    .sort((a, b) => compareBySeq({ seq: a.seq, slug: a.feature }, { seq: b.seq, slug: b.feature }))
    .map((p) => p.feature);

  const at = Math.min(Math.max(move.index, 0), staying.length);
  const order = [...staying.slice(0, at), ...moved, ...staying.slice(at)];

  plan.upsert = order.map((slug, seq) => ({
    feature: slug,
    area,
    seq,
    closedAt: closedAtFor(area, rowOf.get(slug), now),
  }));
  return plan;
}
