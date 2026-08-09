import type { Feature, FeatureDocNode, FeatureTicket } from "@gootte/contract";
import type { FeatureSpecDoc, TicketDoc } from "../parse/feature";

/**
 * 기능 폴더 하나에서 읽어온 문서들 — core-io 가 read 하고 core 파서가 구조로 만든 결과.
 * `spec` 이 없는 폴더도 온다(티켓만 있는 폴더). 그때 표제는 폴더명이다.
 * `tree` 는 폴더에 실제로 있는 것의 목록(issues 제외) — core-io 가 readdir 로 만든 그대로
 * 통과시킨다(계산 없음, 티켓 01 §설계 3).
 */
export interface FeatureDocs {
  slug: string;
  spec: FeatureSpecDoc | null;
  tickets: TicketDoc[];
  tree: FeatureDocNode[];
}

/**
 * "01" 과 "1" 은 같은 티켓이다 — 비교는 숫자로. 번호가 아니면 null.
 * 🔴 느슨한 parseInt 를 쓰지 않는다 — "03번 이후" 같은 산문을 3번 티켓으로 읽으면 INV-4 위반이다.
 */
function numKey(num: string): number | null {
  return /^\d{1,3}$/.test(num) ? Number.parseInt(num, 10) : null;
}

/** 번호 오름차순, 번호 없는 파일은 뒤로(그다음 slug). */
function byNum(a: TicketDoc, b: TicketDoc): number {
  const [x, y] = [numKey(a.num), numKey(b.num)];
  if (x === null && y === null) return a.slug.localeCompare(b.slug);
  if (x === null) return 1;
  if (y === null) return -1;
  return x === y ? a.slug.localeCompare(b.slug) : x - y;
}

/**
 * 막힘 해제 계산 — `Blocked by:` 에 나열된 번호가 **전부 완료(resolved)** 면 착수 가능(F5).
 * 파일 어디에도 그렇게 적혀 있지 않다. 볼 때마다 다시 계산하고 어디에도 저장하지 않는다(INV-1).
 *
 * - `wontfix` 선행은 해제하지 않는다 — 관례가 "전부 `resolved`" 라고 못박는다(issue-tracker §Blocked by).
 * - 존재하지 않는 번호를 가리키면 해제하지 않는다 — 완료를 증명할 수 없으므로 계속 기다린다(INV-4).
 *   그 번호는 `waitingOn` 에 그대로 남아 화면에서 보인다.
 * - 번호가 아닌 산문 선행(다른 기능의 티켓을 가리키는 문구)도 해제하지 않고 문구 그대로 남긴다 —
 *   이 기능의 같은 숫자에 갖다 붙이는 추정이 INV-4 위반이다. 사람이 읽어 판단하도록 드러낸다.
 */
function waitingOn(ticket: TicketDoc, doneNums: ReadonlySet<number>): string[] {
  return ticket.blockedBy.filter((b) => {
    const n = numKey(b);
    return n === null || !doneNums.has(n);
  });
}

function toTicket(doc: TicketDoc, doneNums: ReadonlySet<number>): FeatureTicket {
  const waiting = waitingOn(doc, doneNums);
  return {
    num: doc.num,
    slug: doc.slug,
    title: doc.title,
    status: doc.status,
    sourceStatus: doc.sourceStatus,
    statusKnown: doc.statusKnown,
    ...(doc.completedAt ? { completedAt: doc.completedAt } : {}),
    blockedBy: doc.blockedBy,
    waitingOn: waiting,
    startable: waiting.length === 0,
    // 문서만으로는 언제나 빈 값 — 처리중은 격리 사본 관측이 얹는다(`applyInProgress`).
    workedBy: [],
  };
}

/** 기능 폴더 하나 → 계약 형태. 티켓은 번호순. */
export function buildFeature(docs: FeatureDocs): Feature {
  const doneNums = new Set<number>();
  for (const t of docs.tickets) {
    const n = numKey(t.num);
    if (n !== null && t.status === "done") doneNums.add(n);
  }
  return {
    slug: docs.slug,
    title: docs.spec?.title ?? docs.slug,
    status: docs.spec?.status ?? "pending",
    sourceStatus: docs.spec?.sourceStatus ?? null,
    statusKnown: docs.spec?.statusKnown ?? false,
    tickets: [...docs.tickets].sort(byNum).map((t) => toTicket(t, doneNums)),
    docs: docs.tree,
  };
}

/** 기능 목록 → 계약 형태. 폴더명 순(화면 그룹 순서). */
export function buildFeatures(docs: FeatureDocs[]): Feature[] {
  return [...docs].sort((a, b) => a.slug.localeCompare(b.slug)).map(buildFeature);
}
