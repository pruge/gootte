import {
  watchProjects,
  watchPlanDb,
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
   * 계획 감시기는 루트와 무관해 그대로 둔다. 재묶음이 성공하면 그 소스의 실패를 풀고,
   * 전 소스가 회복됐을 때만 폴백 해제를 방송한다.
   */
  rebind(roots: string[]): Promise<void>;
}

export interface WatchersOptions {
  /** discover 루트 — 문서 감시기가 지켜본다. */
  roots: string[];
  /** 계획 저장소 경로 — 계획 감시기가 지켜본다(plan-board/09). */
  dataDir: string;
  /** 신호를 실을 곳(WS 방송). INV-4 — 신호만 넘기고 해석하지 않는다. */
  onChange: (ev: ChangeEvent) => void;
  /** `projects` 신호가 날 때 discover-cache 를 비운다(server.ts 가 하던 것, W2). */
  onProjectsChange?: () => void;
  /** 테스트 주입 — 실제 감시기(fs) 대신 가짜를 넣어 "닫으면 둘 다 닫히는가" 를 fs 없이 잰다. */
  watchProjectsImpl?: typeof watchProjects;
  /** 같은 이유로 계획 감시기도 주입 가능하게 둔다. */
  watchPlanDbImpl?: typeof watchPlanDb;
}

/**
 * 문서 감시기와 계획 감시기를 **함께 세우고 함께 닫는다**(plan-board/09) — 문서 감시기는
 * server.ts 안에서 이미 살아 있었지만 계획 감시기는 그 옆에 선 적이 없어, 다른 곳(명령·다른
 * 창·gootte 자신)에서 계획이 바뀌어도 화면이 몰랐다(spec F2). 새 신호 종류도 새 채널도
 * 만들지 않는다 — 있던 `plan` `ChangeEvent` 를 있던 hub 로 잇는 배선 한 가닥뿐이다.
 *
 * 감시가 못 붙거나 도중에 망가지면 `{kind:"watch-fallback", active:true}` 를
 * 한 번 방송한다 — 프론트가 주기 풀스캔으로 갈아타는 근거다(INV-3: 조용한 stale 금지).
 * 실패는 소스별로 기억하고, 망가진 소스의 재묶음이 성공해 **전부 회복됐을 때만** `active:false`
 * 를 알린다 — 다른 소스의 재묶음이 남은 고장을 덮지 않게.
 *
 * 서버 진입 파일(server.ts) 안에서 곧바로 실행되던 코드라 테스트가 못 닿았다 — 이 함수로
 * 꺼내 배선 자체를 테스트가 닿는 자리로 옮긴다.
 */
export function startWatchers(opts: WatchersOptions): Watchers {
  const {
    roots,
    dataDir,
    onChange,
    onProjectsChange,
    watchProjectsImpl = watchProjects,
    watchPlanDbImpl = watchPlanDb,
  } = opts;

  /**
   * 폴백 상태 — 소스별로 실패를 기억하고 **전부 회복됐을 때만** active:false 를 싣는다.
   * 한 소스의 재묶음이 다른 소스의 고장을 덮으면 프론트가 폴러를 내린 뒤에도 그 소스는
   * 계속 못 보는 조용한 stale(INV-3)이 되므로, 회복 판정은 전체 집합으로 한다.
   * active:true 는 첫 실패 때 한 번(방송 홍수 방지), 회복은 마지막 실패 해제 때 한 번만.
   */
  const failures = { projects: false, plan: false };
  let fallbackActive = false;
  const syncFallback = (): void => {
    const any = failures.projects || failures.plan;
    if (any && !fallbackActive) {
      fallbackActive = true;
      onChange({ kind: "watch-fallback", active: true });
    } else if (!any && fallbackActive) {
      fallbackActive = false;
      onChange({ kind: "watch-fallback", active: false });
    }
  };
  const onErrorFor = (source: keyof typeof failures) => (): void => {
    failures[source] = true;
    syncFallback();
  };

  const planWatcher: PlanWatcher = watchPlanDbImpl(dataDir, () => onChange({ kind: "plan" }), {
    onError: onErrorFor("plan"),
  });

  const startProjectsWatcher = (roots: string[]): ProjectWatcher =>
    watchProjectsImpl(
      roots,
      (c: Change) => {
        if (c.kind === "projects") onProjectsChange?.();
        onChange(c);
      },
      // 어떤 감시기 하나라도 실패하면 "이벤트가 온전하다" 는 보장이 깨진다 — 전부 폴백으로.
      { onError: onErrorFor("projects") },
    );

  let projectsWatcher = startProjectsWatcher(roots);

  return {
    async rebind(nextRoots: string[]) {
      const prev = projectsWatcher;
      // 이 소스의 실패는 새 묶음을 세우기 **전에** 푼다 — 시작이 동기로 실패하면 onError 가
      // 도로 표시하고, 아래 sync 가 최종 상태를 방송한다. 다른 소스의 실패는 그대로 남는다.
      failures.projects = false;
      projectsWatcher = startProjectsWatcher(nextRoots);
      await prev.close();
      syncFallback();
    },
    async close() {
      await Promise.all([projectsWatcher.close(), planWatcher.close()]);
    },
  };
}
