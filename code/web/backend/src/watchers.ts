import {
  watchBacklog,
  watchProjects,
  watchPlanDb,
  type BacklogWatcher,
  type Change,
  type ProjectWatcher,
  type PlanWatcher,
} from "@gootte/core-io";
import type { ChangeEvent } from "@gootte/contract";

export interface Watchers {
  close(): Promise<void>;
  /**
   * 문서 감시기만 새 루트로 다시 묶는다(tauri-desktop-app T02) — 설정에서 감시 루트를 바꾸면
   * 기존 감시기는 낡은 뿌리를 보고 있으니(INV-3), 닫고 같은 배선으로 새 뿌리를 세운다.
   * 계획·백로그 감시기는 루트와 무관해 그대로 둔다. 재묶음이 성공하면 폴백도 함께 해제한다 —
   * 새 감시기가 곧바로 또 실패하면 onError 가 다시 폴백을 선다.
   */
  rebind(roots: string[]): Promise<void>;
  /**
   * 백로그 감시기만 새 firstmate 홈으로 다시 묶는다(tauri-desktop-app T03) — T02 의 문서
   * 재묶음과 같은 이유다: 설정값이 바뀌었는데 감시기가 낡은 경로를 보면 live 갱신이 어긋난다(INV-3).
   */
  rebindBacklog(firstmateHome: string | null): Promise<void>;
}

export interface WatchersOptions {
  /** discover 루트 — 문서 감시기가 지켜본다. */
  roots: string[];
  /** 계획 저장소 경로 — 계획 감시기가 지켜본다(plan-board/09). */
  dataDir: string;
  /** firstmate 홈 경로 — 백로그 감시기가 지켜본다(tauri-desktop-app T03). 미설정(null)이면 감시하지 않는다. */
  firstmateHome?: string | null;
  /** 신호를 실을 곳(WS 방송). INV-4 — 신호만 넘기고 해석하지 않는다. */
  onChange: (ev: ChangeEvent) => void;
  /** `projects` 신호가 날 때 discover-cache 를 비운다(server.ts 가 하던 것, W2). */
  onProjectsChange?: () => void;
  /** 테스트 주입 — 실제 감시기(fs) 대신 가짜를 넣어 "닫으면 둘 다 닫히는가" 를 fs 없이 잰다. */
  watchProjectsImpl?: typeof watchProjects;
  /** 같은 이유로 계획 감시기도 주입 가능하게 둔다. */
  watchPlanDbImpl?: typeof watchPlanDb;
  /** 백로그 감시기도 같다(tauri-desktop-app T03). */
  watchBacklogImpl?: typeof watchBacklog;
}

/**
 * 문서 감시기와 계획 감시기를 **함께 세우고 함께 닫는다**(plan-board/09) — 문서 감시기는
 * server.ts 안에서 이미 살아 있었지만 계획 감시기는 그 옆에 선 적이 없어, 다른 곳(명령·다른
 * 창·gootte 자신)에서 계획이 바뀌어도 화면이 몰랐다(spec F2). 새 신호 종류도 새 채널도
 * 만들지 않는다 — 있던 `plan` `ChangeEvent` 를 있던 hub 로 잇는 배선 한 가닥뿐이다.
 *
 * tauri-desktop-app T03 에서 백로그 감시기가 셋째로 합류하고, **감시 불가 → 폴백 신호**가
 * 더해졌다. 어느 감시기든 못 붙거나 도중에 망가지면 `{kind:"watch-fallback", active:true}` 를
 * 한 번 방송한다 — 프론트가 주기 풀스캔으로 갈아타는 근거다(INV-3: 조용한 stale 금지).
 * 재묶음(rebind)이 성공하면 `active:false` 로 회복을 알린다.
 *
 * 서버 진입 파일(server.ts) 안에서 곧바로 실행되던 코드라 테스트가 못 닿았다 — 이 함수로
 * 꺼내 배선 자체를 테스트가 닿는 자리로 옮긴다.
 */
export function startWatchers(opts: WatchersOptions): Watchers {
  const {
    roots,
    dataDir,
    firstmateHome = null,
    onChange,
    onProjectsChange,
    watchProjectsImpl = watchProjects,
    watchPlanDbImpl = watchPlanDb,
    watchBacklogImpl = watchBacklog,
  } = opts;

  /**
   * 폴백 상태 — true 를 방송한 뒤엔 같은 소식을 되풀이하지 않는다(방송 홍수 방지).
   * 회복(active:false)은 재묶음 성공 시 한 번만 싣는다.
   */
  let fallbackActive = false;
  const enterFallback = (): void => {
    if (fallbackActive) return;
    fallbackActive = true;
    onChange({ kind: "watch-fallback", active: true });
  };
  const exitFallbackIfAny = (): void => {
    if (!fallbackActive) return;
    fallbackActive = false;
    onChange({ kind: "watch-fallback", active: false });
  };

  const planWatcher: PlanWatcher = watchPlanDbImpl(dataDir, () => onChange({ kind: "plan" }), {
    onError: enterFallback,
  });

  const startProjectsWatcher = (roots: string[]): ProjectWatcher =>
    watchProjectsImpl(
      roots,
      (c: Change) => {
        if (c.kind === "projects") onProjectsChange?.();
        onChange(c);
      },
      // 어떤 감시기 하나라도 실패하면 "이벤트가 온전하다" 는 보장이 깨진다 — 전부 폴백으로.
      { onError: enterFallback },
    );

  let projectsWatcher = startProjectsWatcher(roots);

  const backlogOnError = (): void => enterFallback();
  const startBacklogWatcher = (home: string | null): BacklogWatcher =>
    watchBacklogImpl(home, () => onChange({ kind: "backlog" }), { onError: backlogOnError });
  let backlogWatcher = startBacklogWatcher(firstmateHome);

  return {
    async rebind(nextRoots: string[]) {
      await projectsWatcher.close();
      projectsWatcher = startProjectsWatcher(nextRoots);
      exitFallbackIfAny();
    },
    async rebindBacklog(nextHome: string | null) {
      await backlogWatcher.close();
      backlogWatcher = startBacklogWatcher(nextHome);
      exitFallbackIfAny();
    },
    async close() {
      await Promise.all([projectsWatcher.close(), planWatcher.close(), backlogWatcher.close()]);
    },
  };
}
