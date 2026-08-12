import { watchProjects, watchPlanDb, type Change } from "@gootte/core-io";
import type { ChangeEvent } from "@gootte/contract";

export interface Watchers {
  close(): Promise<void>;
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

  const projectsWatcher = watchProjectsImpl(roots, (c: Change) => {
    if (c.kind === "projects") onProjectsChange?.();
    onChange(c);
  });
  const planWatcher = watchPlanDbImpl(dataDir, () => onChange({ kind: "plan" }));

  return {
    async close() {
      await Promise.all([projectsWatcher.close(), planWatcher.close()]);
    },
  };
}
