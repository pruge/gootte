import { useCallback } from "react";
import { flushSync } from "react-dom";
import { QueryClient, useMutation, useQuery, useQueryClient, dehydrate, hydrate } from "@tanstack/react-query";
import type { PlanBoardResponse, PlanMoveRequest, StepMoveRequest } from "@gootte/contract";
import { applyMoveToBoard } from "../components/plan/areas";
import {
  fetchProjects,
  fetchFeatures,
  fetchFeatureDoc,
  fetchPlanBoard,
  recordTime,
  fetchSettings,
  fetchStorage,
  clearStorage,
  movePlanCards,
  moveStep,
  saveSettings,
  fetchMemos,
  createMemo,
  updateMemo,
  deleteMemo,
} from "./api";
import { useToast } from "./toast";

const PERSIST_KEY = "gootte-query-cache-v1";
// 메모리 보관 기한 — 이 안에서는 GC 되지 않는다. 24h 였으나 켜둔 탭의 상주 증가(memory-diet
// T03)라 10분으로 줄인다. 최신값 공급은 WS invalidate 가 맡으니 stale 걱정은 없다(INV-3).
const GC_TIME = 1000 * 60 * 10; // 10m
// 영속 저장본에 싣는 신선도 상한 — 1시간 넘게 안 읽은 쿼리는 저장하지 않는다. 켜둘수록 쌓이는
// 낡은 프로젝트 캐시가 localStorage 와 다음 기동 힙을 함께 불리는 것을 막는다.
const PERSIST_FRESH_MS = 1000 * 60 * 60; // 1h

/** 서버상태 SoT = TanStack Query 캐시(INV-1 — 별 스토어 복제 X). 2b WS 가 invalidate 로 확장. */
export function makeQueryClient(): QueryClient {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 5_000, gcTime: GC_TIME, retry: 1, refetchOnWindowFocus: false },
    },
  });
  // 🔴 동기 hydrate — 첫 렌더 전에 영속본을 캐시에 앉혀 딱 한 프레임도 빈 화면이 안 뜬다(T07).
  hydrateFromStorage(qc);
  attachSaver(qc);
  return qc;
}

/**
 * 영속 캐시(T07) — 앱을 새로 시작해도 "이미 읽은" 내용을 바로 그린다. 변경분은 WS(`project`)
 * 방송이 걸러 낸 invalidate 로 갱신되니, 여기선 **저장만** 한다. 🔴 featureDoc(문서 본문)은
 * 큼직해 영속에서 뺀다 — 본문은 열 때마다 요청받으면 그만이다.
 */
function hydrateFromStorage(qc: QueryClient): void {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return;
    const dehydrated = JSON.parse(raw) as { queries?: Array<{ queryKey?: unknown[] }> };
    const queries = (dehydrated.queries ?? []).filter((q) => q.queryKey?.[0] !== "featureDoc");
    if (queries.length === 0) return;
    hydrate(qc, { ...dehydrated, queries });
  } catch {
    // 깨진 영속본은 무시 — 다음 fetch 가 채운다(치명하지 않다)
  }
}

/**
 * 영속 저장(query-persist-on-hide) — dirty 표시 + 닫힘 flush.
 *
 * 옛 구조(캐시 변경마다 디바운스 전량 저장)는 localStorage SQLite WAL 을 104MB 까지
 * 불렸다(실측 2026-09-11) — 메가바이트급 직렬화가 수초마다 돌아 GC 압박이 됐다.
 * 이제 저장은 세 길로만 나간다: 탭 숨김·페이지 닫힘·60초 안전망(dirty 일 때만).
 * 저장 실패(quota 등)는 치명하지 않다 — 다음 fetch 가 메운다(D4).
 * cleanup 을 반환한다 — 앱 본체는 수명과 같이 가므로 안 쓰지만 테스트가 쓴다.
 * 테스트 갈고리로 내보낸다(`folderCacheSize` 와 같은 규율).
 */
export function attachSaver(qc: QueryClient): () => void {
  let dirty = false;
  const save = (): void => {
    if (!dirty) return;
    dirty = false;
    try {
      const cutoff = Date.now() - PERSIST_FRESH_MS;
      const dehydrated = dehydrate(qc, {
        shouldDehydrateQuery: (q) =>
          q.queryKey[0] !== "featureDoc" &&
          q.state.status === "success" &&
          q.state.data !== undefined &&
          (q.state.dataUpdatedAt ?? 0) >= cutoff,
      });
      localStorage.setItem(PERSIST_KEY, JSON.stringify(dehydrated));
    } catch {
      // quota 초과 등 — 영속 실패는 치명하지 않다(다음 fetches 가 메운다)
    }
  };
  const unsubscribe = qc.getQueryCache().subscribe(() => {
    dirty = true;
  });
  const onHidden = (): void => {
    if (document.visibilityState === "hidden") save();
  };
  document.addEventListener("visibilitychange", onHidden);
  window.addEventListener("pagehide", save);
  const timer = setInterval(save, 60_000);
  return () => {
    unsubscribe();
    document.removeEventListener("visibilitychange", onHidden);
    window.removeEventListener("pagehide", save);
    clearInterval(timer);
  };
}

export const qk = {
  projects: ["projects"] as const,
  features: (slug: string) => ["features", slug] as const,
  settings: ["settings"] as const,
  storage: ["storage"] as const,
  memos: (slug: string) => ["memos", slug] as const,
  /**
   * 🔴 자리 둘을 동시에 만족해야 하는 열쇠다(`lib/live.ts`): 맨 앞이 `"plan"` 이라 계획 DB 변경
   * (`kind:"plan"`)에 걸리고, slug 를 담고 있어 그 프로젝트 문서 변경(`kind:"project"`)에도 걸린다.
   * 문서를 새로 써도 새로고침 없이 판이 다시 그려지는 것이 두 번째 덕분이다.
   */
  plan: (slug: string) => ["plan", slug] as const,
  featureDoc: (project: string, feature: string, path: string) =>
    ["featureDoc", project, feature, path] as const,
};

export function useProjects() {
  return useQuery({ queryKey: qk.projects, queryFn: fetchProjects });
}

/**
 * 넓은 무효화의 한 자리(memory-diet T04) — "전부 다시 읽기" 가 필요할 때(WS 재연결 흡수·
 * 설정 저장) 이 함수를 쓴다. 인자 없는 `invalidateQueries()` 대신 키 지정으로 좁힌다.
 *
 * 닫힌 드로어의 `featureDoc`(보고 있지 않은 문서 본문)은 빼고, **열린 드로어(active)** 의
 * 문서는 포함한다 — 닫힌 문서는 다음에 열 때 staleTime 으로 다시 읽으므로 stale 이 남지 않고
 * (INV-3), 큰 본문을 매번 다시 파싱하는 refetch 폭풍만 걷힌다.
 */
export function invalidateLiveQueries(qc: QueryClient): Promise<void> {
  return qc.invalidateQueries({
    predicate: (q) => q.queryKey[0] !== "featureDoc" || q.isActive(),
  });
}

/** 저장소 사용량(settings-storage-meter) — 설정 화면이 열 때마다 새로 잰다(INV-5 저장 없음). */
export function useStorage() {
  return useQuery({ queryKey: qk.storage, queryFn: fetchStorage });
}

/**
 * 앱 내 캐시 비우기 — 서버 파생 캐시를 먼저 비우고, 본체는 호출자가 `localStorage.clear()`·
 * `qc.clear()`·`location.reload()` 로 마무리한다(순서가 핵심: 서버를 먼저 비워야 새로고침
 * 직후 재계산이 깨끗하다). WAL 파일 잔량은 다음 앱 종료 때 정리된다.
 */
export function useClearStorage() {
  return useMutation({
    mutationFn: clearStorage,
  });
}

/** 설정(tauri-desktop-app T02) — 감시 루트·firstmate 홈. */
export function useSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: fetchSettings });
}

/**
 * 설정 저장 — 성공하면 프로젝트 목록을 무효화한다. 감시 루트가 바뀌면 발견되는 프로젝트
 * 자체가 달라지므로(INV-3), 화면이 낡은 목록을 그리게 두지 않는다. 나머지 쿼리도 루트에
 * 종속되지만 프로젝트 선택이 유지되는 동안엔 다음 조회에서 자연히 새 값이 온다.
 */
export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveSettings,
    onSuccess: () => {
      // 설정이 바뀌면 그것을 먹는 전부(프로젝트 발견·기능 목록·판)가 낡는다(INV-3) —
      // 저장 즉시 적용은 화면이 다시 물어 보는 것으로 완성된다. 닫힌 문서는 뺀다(T04).
      void invalidateLiveQueries(qc);
    },
  });
}

/**
 * 차단한 작업 가지(blockedCopies) 갱신 — 화면에서 숨길 복사본 목록. PUT 은 부분 갱신이라
 * 다른 설정(firstmateHome·watchRoots)을 건드리지 않는다. 성공하면 설정·기능 목록을 무효화해
 * 차단된 복사본이 즉시 사라지고(뒤에 있는 설정 대화상자의 목록도 갱신된다) 화면이 다시 본다(INV-3).
 */
export function useBlockedCopies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (blockedCopies: string[]) => saveSettings({ blockedCopies }),
    onSuccess: () => {
      void invalidateLiveQueries(qc);
    },
  });
}

/** 기능별 할일(docs/features/) — 서버가 매 요청 재계산(INV-3). */
export function useFeatures(slug: string | null) {
  return useQuery({
    queryKey: qk.features(slug ?? ""),
    queryFn: () => fetchFeatures(slug as string),
    enabled: slug !== null,
  });
}

/** 프로젝트 메모(memo-pad) — gootte 자기 저장소에서 읽는다. */
export function useMemos(slug: string | null) {
  return useQuery({
    queryKey: qk.memos(slug ?? ""),
    queryFn: () => fetchMemos(slug as string),
    enabled: slug !== null,
  });
}

/** 새 메모 — 성공하면 메모 목록을 무효화해 다시 읽는다(INV-3). */
export function useCreateMemo(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => createMemo(slug, content),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.memos(slug) }),
  });
}

/** 메모 고치기 — 내용을 바꾸고, `done` 이 주어지면 완료 표시(취소선)를 토글한다. */
export function useUpdateMemo(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content, done }: { id: string; content: string; done?: boolean }) =>
      updateMemo(slug, id, content, done),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.memos(slug) }),
  });
}

/** 메모 지우기. */
export function useDeleteMemo(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMemo(slug, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.memos(slug) }),
  });
}

/** 다섯 자리 판 — 서버가 매 요청 문서와 자리 행을 다시 읽어 가른다(INV-3). */
export function usePlanBoard(slug: string | null) {
  return useQuery({
    queryKey: qk.plan(slug ?? ""),
    queryFn: () => fetchPlanBoard(slug as string),
    enabled: slug !== null,
  });
}

/**
 * 카드를 옮긴다(plan-board/03) — 캡틴의 손이 계획 DB 에 닿는 유일한 길.
 *
 * 🔴 서버가 돌려준 판을 **그대로** 캐시에 앉힌다 — 화면이 옮긴 결과를 자기 손으로 조립하면
 * 그것이 곧 서버 판정의 2차 사본이다(INV-1).
 *
 * 놓는 **순간**에는 카드를 놓은 칸으로 옮겨 놓은 한 프레임을 먼저 보여준다
 * (`applyMoveToBoard`) — 손끝의 사본이 날아갈 목적지가 있어야 하기 때문이다(캡틴 지시).
 * 🔴 그 프레임은 **연출이지 판정이 아니다**: 서버의 답이 오면 통째로 덮이고, 실패하면 이전 판이
 * 그대로 되돌아온다 — 옮겨진 척한 채로 남지 않는다.
 */
export function usePlanMove(slug: string) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (request: PlanMoveRequest) => movePlanCards(slug, request),
    onSuccess: (board) => qc.setQueryData(qk.plan(slug), board),
  });

  const move = useCallback(
    (request: PlanMoveRequest) => {
      const previous = qc.getQueryData<PlanBoardResponse>(qk.plan(slug));
      // 🔴 **동기로** 앞당긴다. dnd-kit 은 놓기 콜백이 끝나자마자 목적지를 재고, 그때 카드가
      // 아직 옛 칸에 있으면 손끝의 사본이 **옛 자리로 되돌아가 붙는다** — 방금 한 일을 취소한
      // 것처럼 보인다(캡틴 지시). `onMutate` 로 하면 `await` 한 번에 마이크로태스크로 밀려
      // 그 측정보다 늦는다. `flushSync` 가 그 한 박자를 없앤다.
      if (previous) {
        flushSync(() => qc.setQueryData(qk.plan(slug), applyMoveToBoard(previous, request)));
      }
      mutation.mutate(request, {
        // 실패하면 놓기 전의 판이 그대로 돌아온다 — 옮겨진 척한 채로 남지 않는다.
        onError: () => {
          if (previous) qc.setQueryData(qk.plan(slug), previous);
        },
      });
    },
    [qc, slug, mutation],
  );

  return { move, isError: mutation.isError, error: mutation.error };
}



/**
 * 시간 기록(ADR-0002) — steps 탭 버튼으로 start/pause/resume/end 를 티켓 문서에 남긴다.
 * 성공하면 plan·features 를 무효화해 다시 읽는다(INV-3 — 낡은 걸린 시간을 안 그린다).
 */
export function useRecordTime(project: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const label: Record<"start" | "pause" | "resume" | "end", string> = {
    start: "시작",
    pause: "일시중단",
    resume: "재개",
    end: "완료",
  };
  const mutation = useMutation({
    mutationFn: (req: { feature: string; ticket: string; action: "start" | "pause" | "resume" | "end" }) =>
      recordTime(project, req.feature, req.ticket, req.action),
    onSuccess: (_data, req) => {
      void qc.invalidateQueries({ queryKey: ["plan", project] });
      void qc.invalidateQueries({ queryKey: ["features", project] });
      toast.show(`${label[req.action]} 기록됨 — ${req.feature}/${req.ticket}`);
    },
    onError: (err, req) => {
      toast.show(
        `${label[req.action]} 실패 — ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    },
  });
  return { record: mutation.mutate, isPending: mutation.isPending, isError: mutation.isError, error: mutation.error };
}

/**
 * 드로어에 연 기능 문서 본문 — 셋 다 있어야 fetch(카드 트리에서 문서를 눌렀을 때만).
 *
 * 🔴 서버가 이 요청을 받으면(티켓이면) 읽음으로 적는다(unread-tickets-show-themselves/01) —
 * 그래서 여기서 캐시를 무효화한다. 화면이 안 읽음 표시를 직접 지우지 않는다 —
 * 서버가 다시 계산한 값을 다시 받아 그리는 것으로 충분하다(INV-1).
 *
 * 🔴 **`plan` 과 `features` 를 둘 다 무효화한다.** 안 읽음 표시를 그리는 화면이 둘인데 보는
 * 캐시가 다르다 — features 탭은 `features`, **steps 탭은 `plan`**(`usePlanBoard`)이다.
 * `features` 만 무효화하던 시절엔 steps 에서 티켓을 읽어도 그 자리의 `안 읽음` 이 안 지워졌고,
 * 카드를 다른 칸으로 옮겨야(=`usePlanMove` 가 응답을 `plan` 에 앉혀야) 비로소 풀렸다
 * (캡틴 확인 2026-09-04, T04). 위 `useRecordTime` 이 둘 다 무효화하는 것과 같은 이유다.
 */
export function useFeatureDoc(
  project: string | null,
  feature: string | null,
  path: string | null,
) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.featureDoc(project ?? "", feature ?? "", path ?? ""),
    queryFn: async () => {
      const doc = await fetchFeatureDoc(project as string, feature as string, path as string);
      qc.invalidateQueries({ queryKey: qk.features(project as string) });
      qc.invalidateQueries({ queryKey: qk.plan(project as string) });
      return doc;
    },
    // 🔴 드로어를 닫으면(관찰자 0명) 즉시 버린다 — 500KB 로그 같은 큰 문서를 열어 두면
    // 렌더러 힙에 그대로 눌러앉는다(실측 2026-09-11). 다시 열면 staleTime 으로 다시 읽는다.
    gcTime: 0,
    enabled: project !== null && feature !== null && path !== null,
  });
}
