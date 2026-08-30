import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { beforeEach, describe, expect, test } from "vitest";
import { clearSnapshot } from "../src/snapshot";
import {
  ProjectsResponse,
  FeaturesResponse,
  FeatureDocResponse,
  PlanBoardResponse,
  SettingsResponse,
  ApiError,
  type Project,
} from "@gootte/contract";

import {
  migratePlanDb,
  readPlacements,
  readReadMarks,
  readSteps,
  writeStep,
  deriveWatchRoots,
} from "@gootte/core-io";
import { createApp } from "../src/app";
import {
  clearDiscoverCache,
  getProjects,
  pickBySlug,
  DISCOVER_TTL_MS,
} from "../src/discover-cache";
import { updateProjectSnapshot } from "../src/snapshot";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "roots");

/**
 * 관리대상 트리 하나를 경로 → "수정 시각 + 내용" 으로 접는다.
 * 🔴 특정 파일을 지목해 확인하지 않는다 — 지목하면 **다른 파일에 쓰는 것**과
 * **새 파일을 떨구는 것**(예: `.gootte/`)을 못 잡는다. 그 둘이 INV-2 가 실제로 깨지는 모양이다.
 */
function treeSnapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out[relative(root, full)] = `${statSync(full).mtimeMs} ${readFileSync(full, "utf8")}`;
    }
  };
  walk(root);
  return out;
}
const roots = [FIXTURES];
// 격리 사본 뿌리도 주입한다 — 기계에 실제로 있는 `~/.treehouse` 를 읽으면 테스트가 기계에 종속된다.
const NO_TREEHOUSE = join(FIXTURES, "..", "no-treehouse");
// 계획 저장소도 주입한다 — features 라우트가 이제 읽음 기록을 건드리므로(unread-tickets-
// show-themselves/01), 주입하지 않으면 이 기계의 실제 `~/.gootte` 를 오염시킨다.
const DATA_DIR = mkdtempSync(join(tmpdir(), "gootte-app-data-"));
const APP = { roots, treehouse: NO_TREEHOUSE, dataDir: DATA_DIR };

/** 격리된 계획 저장소로 한 번 부른다 — 테스트마다 새 디렉토리라 읽음 기록이 섞이지 않는다. */
function withDataDir<T>(fn: (dataDir: string) => Promise<T> | T): Promise<T> | T {
  const dir = mkdtempSync(join(tmpdir(), "gootte-app-data-"));
  const done = () => rmSync(dir, { recursive: true, force: true });
  try {
    const out = fn(dir);
    return out instanceof Promise ? out.finally(done) : (done(), out);
  } catch (err) {
    done();
    throw err;
  }
}

beforeEach(() => clearDiscoverCache());

/**
 * 임시 격리 사본 뿌리 — `alpha` 의 사본 둘: 하나는 티켓 파일을 건드리고 하나는 안 건드린다.
 * 판정 자체는 core-io 가 덮는다(`treehouse.test.ts`). 여기서 보는 것은 **라우트가 그것을 싣는가**다.
 */
function makeTreehouse(): string {
  const root = mkdtempSync(join(tmpdir(), "gootte-app-th-"));
  const copy = (slot: string, branch: string, file: string): void => {
    const repo = join(root, "alpha-abc123", slot, "alpha");
    mkdirSync(repo, { recursive: true });
    const git = (...args: string[]): void => {
      execFileSync("git", ["-C", repo, ...args], { stdio: "ignore" });
    };
    execFileSync("git", ["init", "-q", repo], { stdio: "ignore" });
    git("symbolic-ref", "HEAD", "refs/heads/main");
    git("config", "user.email", "crew@example.com");
    git("config", "user.name", "crew");
    git("config", "commit.gpgsign", "false");
    writeFileSync(join(repo, "README.md"), "base\n");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    git("checkout", "-q", "-b", branch);
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), "work\n");
    git("add", "-A");
    git("commit", "-q", "-m", "work");
  };
  copy("1", "fm/screen", "docs/features/auth-login/issues/02-screen.md");
  copy("2", "fm/elsewhere", "code/web/core/src/x.ts");
  return root;
}

describe("GET /api/projects", () => {
  test("ProjectsResponse envelope 반환 + alpha 발견", async () => {
    const app = createApp(APP);
    const res = await app.request("/api/projects");
    expect(res.status).toBe(200);
    const body = ProjectsResponse.parse(await res.json()); // zod 검증 = throw 시 실패
    expect(body.projects.map((p) => p.slug)).toContain("alpha");
  });

  // 세는 규칙 자체는 core 가 덮는다(`features.test.ts`). 여기서 보는 것은 **라우트가 그것을 싣는가**다.
  // fixture alpha = auth-login(01 resolved · 02 ready · 03 알 수 없음) + doc-tree(01 ready) → 둘 다 남은 일 있음.
  test("남은 일이 있는 기능 수를 싣는다 — 요청마다 다시 센다(INV-1)", async () => {
    const app = createApp(APP);
    const body = ProjectsResponse.parse(await (await app.request("/api/projects")).json());
    expect(body.projects.find((p) => p.slug === "alpha")?.openFeatures).toBe(2);
  });
});

// T01 — 같은 slug 의 사본을 하나로 묶는다. discover 가 묶어 내므로 /api/projects 목록에 같은
// 이름이 두 번 안 뜬다. 픽스처는 실물과 같은 배치(<홈>/projects/<프로젝트>/{AGENTS.md,docs/features}).
describe("GET /api/projects — T01 사본 묶기", () => {
  const makeProject = (root: string, slug: string): string => {
    const dir = join(root, slug);
    mkdirSync(join(dir, "docs", "features"), { recursive: true });
    writeFileSync(join(dir, "AGENTS.md"), "# AGENTS\n");
    return dir;
  };

  test("같은 slug 사본이 둘 있으면 목록에 1개, copies 는 2개, path 는 뿌리 순서 첫 사본", async () => {
    clearDiscoverCache();
    const rootA = mkdtempSync(join(tmpdir(), "gootte-api-copy-a-"));
    const rootB = mkdtempSync(join(tmpdir(), "gootte-api-copy-b-"));
    const first = makeProject(rootA, "dup");
    const second = makeProject(rootB, "dup");
    try {
      const app = createApp({ roots: [rootA, rootB], treehouse: NO_TREEHOUSE, dataDir: DATA_DIR });
      const body = ProjectsResponse.parse(await (await app.request("/api/projects")).json());
      // 🔴 같은 이름이 두 번 안 뜬다.
      expect(body.projects.filter((p) => p.slug === "dup")).toHaveLength(1);
      const dup = body.projects.find((p) => p.slug === "dup")!;
      expect(dup.copies).toEqual([first, second]); // 뿌리 순서 그대로
      expect(dup.path).toBe(first); // 대표 = 첫 사본 — 기존 소비처 호환 칸
    } finally {
      rmSync(rootA, { recursive: true, force: true });
      rmSync(rootB, { recursive: true, force: true });
    }
  });

  test("사본이 하나뿐이면 copies=[path] 이고 기존 모양과 같다(수용 기준 3)", async () => {
    clearDiscoverCache();
    const root = mkdtempSync(join(tmpdir(), "gootte-api-copy-solo-"));
    const only = makeProject(root, "solo");
    try {
      const app = createApp({ roots: [root], treehouse: NO_TREEHOUSE, dataDir: DATA_DIR });
      const body = ProjectsResponse.parse(await (await app.request("/api/projects")).json());
      const solo = body.projects.find((p) => p.slug === "solo")!;
      expect(solo.path).toBe(only);
      expect(solo.copies).toEqual([only]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// fixture alpha 의 docs/features/auth-login — 01 resolved · 02 blocked by 01 · 03 알 수 없는 상태
describe("GET /api/features/:slug", () => {
  test("FeaturesResponse envelope — 기능별 티켓 + 계산된 막힘 해제", async () => {
    const app = createApp(APP);
    const res = await app.request("/api/features/alpha");
    expect(res.status).toBe(200);
    const body = FeaturesResponse.parse(await res.json());
    expect(body.project).toBe("alpha");
    const f = body.features.find((x) => x.slug === "auth-login");
    expect(f?.title).toBe("auth-login — 로그인");
    expect(f?.tickets.map((t) => t.num)).toEqual(["01", "02", "03"]);
    // 01 완료 → 02 착수 가능(계산). 02 미완 → 03 은 02 를 기다린다.
    expect(f?.tickets[0]?.completedAt).toBe("2026-08-08");
    expect(f?.tickets[1]?.startable).toBe(true);
    expect(f?.tickets[2]?.startable).toBe(false);
    expect(f?.tickets[2]?.waitingOn).toEqual(["02"]);
  });

  test("🔴 알 수 없는 상태의 티켓도 응답에 남고 원문이 실려 나온다", async () => {
    const app = createApp(APP);
    const body = FeaturesResponse.parse(await (await app.request("/api/features/alpha")).json());
    const t = body.features.find((f) => f.slug === "auth-login")?.tickets[2];
    expect(t?.statusKnown).toBe(false);
    expect(t?.sourceStatus).toBe("진행중");
    expect(t?.status).toBe("pending");
  });

  test("🔴 문서만으로는 in_progress 가 나오지 않는다 — 처리중은 관측의 몫", async () => {
    const app = createApp(APP);
    const body = FeaturesResponse.parse(await (await app.request("/api/features/alpha")).json());
    for (const f of body.features)
      for (const t of f.tickets) {
        expect(t.status).not.toBe("in_progress");
        expect(t.workedBy).toEqual([]);
      }
  });

  test("격리 사본 뿌리가 없어도 응답은 산다 — 빈 관측이지 오류가 아니다", async () => {
    const app = createApp(APP);
    const body = FeaturesResponse.parse(await (await app.request("/api/features/alpha")).json());
    expect(body.inProgress).toMatchObject({
      root: NO_TREEHOUSE,
      rootExists: false,
      copies: 0,
      working: 0,
      tickets: 0,
    });
    expect(body.inProgress.unknown).toEqual([]);
    expect(body.inProgress.unreadable).toEqual([]);
  });

  test("작업중 사본이 있으면 처리중이 실리고, 못 이은 작업은 unknown 으로 실린다", async () =>
    withDataDir(async (dataDir) => {
      // dataDir 를 안 주입하면 이 기계의 실제 ~/.gootte 를 읽는다(파일 상단 주석과 같은 근거) —
      // 이 테스트만 빠져 있었다(2026-08-25 발견, 실제 host 상태에 따라 죽는 test 오염).
      const th = makeTreehouse();
      try {
        const body = FeaturesResponse.parse(
          await (
            await createApp({ roots, treehouse: th, dataDir }).request("/api/features/alpha")
          ).json(),
        );
        const t = body.features
          .find((f) => f.slug === "auth-login")
          ?.tickets.find((x) => x.slug === "02-screen");
        expect(t?.status).toBe("in_progress");
        expect(t?.workedBy).toEqual(["fm/screen"]);
        expect(body.inProgress).toMatchObject({ rootExists: true, working: 2, tickets: 1 });
        // 🔴 이어지지 않은 작업이 응답에서 사라지지 않는다.
        expect(body.inProgress.unknown.map((u) => u.branch)).toEqual(["fm/elsewhere"]);
      } finally {
        rmSync(th, { recursive: true, force: true });
      }
    }));

  test("차단 목록에 든 작업 가지는 화면에 실리지 않는다(read-time 필터, INV-2 관측만)", async () =>
    withDataDir(async (dataDir) => {
      const th = makeTreehouse();
      try {
        const app = createApp({ roots, treehouse: th, dataDir });
        const before = FeaturesResponse.parse(
          await (await app.request("/api/features/alpha")).json(),
        );
        const blockedSlug = before.inProgress.unknown[0]?.slug;
        expect(blockedSlug).toBeTruthy();
        // 차단 목록에 넣는다 — gootte 자기 저장소의 사용자 결정(INV-5).
        const put = await app.request("/api/settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ blockedCopies: [blockedSlug] }),
        });
        expect(put.status).toBe(200);
        expect(SettingsResponse.parse(await put.json()).blockedCopies).toEqual([blockedSlug]);
        const after = FeaturesResponse.parse(
          await (await app.request("/api/features/alpha")).json(),
        );
        // 🔴 숨긴 복사본은 unknown 에도, working 카운트에도 없다 — 실제 worktree 는 그대로(inProgressFor 필터).
        expect(after.inProgress.unknown.map((u) => u.slug)).not.toContain(blockedSlug);
        expect(after.inProgress.working).toBe(before.inProgress.working - 1);
      } finally {
        rmSync(th, { recursive: true, force: true });
      }
    }));

  test("미해소 slug → 404 ApiError", async () => {
    const app = createApp(APP);
    const res = await app.request("/api/features/does-not-exist");
    expect(res.status).toBe(404);
    expect(ApiError.parse(await res.json()).error).toContain("does-not-exist");
  });

  // fixture alpha 의 docs/features/doc-tree — spec.md + architecture.md + adr/0001-x.md + issues/
  test("기능 응답에 문서 트리가 실린다 — adr 있으면 뜨고, issues/ 도 실제 파일 목록으로 뜬다(캡틴 피드백)", async () => {
    const app = createApp(APP);
    const body = FeaturesResponse.parse(await (await app.request("/api/features/alpha")).json());
    const f = body.features.find((x) => x.slug === "doc-tree");
    expect(f?.docs).toEqual([
      {
        kind: "dir",
        name: "adr",
        path: "adr",
        children: [{ kind: "file", name: "0001-x.md", path: "adr/0001-x.md" }],
      },
      { kind: "file", name: "architecture.md", path: "architecture.md" },
      {
        kind: "dir",
        name: "issues",
        path: "issues",
        children: [{ kind: "file", name: "01-a.md", path: "issues/01-a.md" }],
      },
      { kind: "file", name: "spec.md", path: "spec.md" },
    ]);
    // auth-login 픽스처엔 adr/ 가 없다 — 빈 칸으로도 뜨지 않는다(INV-4)
    const auth = body.features.find((x) => x.slug === "auth-login");
    expect(auth?.docs.map((d) => d.name)).toEqual(["issues", "spec.md"]);
  });
});

/**
 * T04 — `tickets/T<NN>.md` 신관례 + firstmate 홈 백로그 조인. 파서·조인 자체는 core/core-io 가
 * 이미 잰다(`backlog.test.ts`·`backlog-join.test.ts`·`features.test.ts`). 여기서 보는 것은
 * **라우트가 설정된 firstmateHome 을 실제로 읽어 잇는가**다.
 */
describe("GET /api/features/:slug — T04 신관례 백로그 조인", () => {
  // T05 — firstmateHome 은 이제 감시 뿌리도 함께 파생하므로(discover → `<홈>/projects`), 백로그
  // 조인만 확인하려는 이 그룹의 픽스처도 프로젝트를 그 홈의 `projects/` 아래에 둔다 — 그래야
  // 홈을 설정한 뒤에도 discover 가 여전히 이 프로젝트를 찾는다(실물 배치와 같은 모양).
  function makeProjectRoot(ticketFile = "T04.md", ticketBody = "# T04 — 신관례 문서 표시\n"): string {
    const parent = mkdtempSync(join(tmpdir(), "gootte-app-t04-"));
    const featDir = join(parent, "widget", "docs", "features", "tauri-desktop-app");
    mkdirSync(join(featDir, "tickets"), { recursive: true });
    writeFileSync(join(parent, "widget", "AGENTS.md"), "# widget\n"); // discoverProjects 판정(F3)
    writeFileSync(join(featDir, "spec.md"), "# 데스크톱 앱\n");
    writeFileSync(join(featDir, "tickets", ticketFile), ticketBody);
    return parent;
  }

  function makeFirstmateHome(backlog: string): string {
    const home = mkdtempSync(join(tmpdir(), "gootte-app-fmhome-"));
    mkdirSync(join(home, "data"), { recursive: true });
    writeFileSync(join(home, "data", "backlog.md"), backlog);
    return home;
  }

  /**
   * 프로젝트를 홈의 `projects/` 아래로 옮겨 심는다 — firstmateHome 을 설정한 뒤에도
   * discover 가 `<홈>/projects` 에서 이 프로젝트를 계속 찾도록(T05). `makeProjectRoot` 가
   * 만든 `<parent>/widget` 을 `<home>/projects/widget` 으로 복사하고, 원래 parent 는 지운다.
   */
  function relocateUnderHomeProjects(projectRoot: string, home: string): void {
    const dest = join(home, "projects", "widget");
    cpSync(join(projectRoot, "widget"), dest, { recursive: true });
    rmSync(projectRoot, { recursive: true, force: true });
  }

  const BACKLOG = [
    "# Backlog",
    "",
    "## In flight",
    "- [ ] widget-tauri-t04 - New-convention docs tree (repo: widget) (kind: ship) (since 2026-08-25)",
    "- [ ] widget-tauri - Tauri desktop app (repo: widget) (kind: ship) (since 2026-08-25)",
    "  Artifacts: projects/widget/docs/features/tauri-desktop-app/. Decisions D1-D5 in grill.md.",
    "",
  ].join("\n");

  // 백로그에서 이미 끝난 모양 — done 절의 `- [x]`. 사이드바(openFeatures) 회귀 시험이 쓴다.
  // 조인은 <parent>-t<NN> 자식에 부모 메모의 Artifacts 경로를 쓰므로 부모 항목도 함께 둔다.
  const DONE_BACKLOG = [
    "# Backlog",
    "",
    "## Done",
    "- [x] widget-tauri-t04 - New-convention docs tree (repo: widget) (kind: ship) (done: 2026-08-25)",
    "- [x] widget-tauri - Tauri desktop app (repo: widget) (kind: ship) (done: 2026-08-25)",
    "  Artifacts: projects/widget/docs/features/tauri-desktop-app/. Decisions D1-D5 in grill.md.",
    "",
  ].join("\n");

  /**
   * 🔴 사이드바(`GET /api/projects` 의 `openFeatures`)도 **조인 뒤에 세야 한다** — 신관례
   * 티켓은 파일에 상태가 없어 조인 없이는 전부 pending 이고, 백로그에서 다 끝난 기능까지
   * "남은 일 있음" 으로 셰진다(실제 결함, 2026-08-25 실측: firstmate 2 → 실제 0).
   */
  test("사이드바 카운트(openFeatures)는 백로그 조인 뒤에 센다 — 다 끝난 신관례 기능은 세지 않는다", async () =>
    withDataDir(async (dataDir) => {
      const projectRoot = makeProjectRoot();
      const home = makeFirstmateHome(DONE_BACKLOG);
      try {
        const app = createApp({ roots: [projectRoot], treehouse: NO_TREEHOUSE, dataDir });
        const count = async () =>
          ProjectsResponse.parse(
            await (await app.request("/api/projects")).json(),
          ).projects.find((p) => p.slug === "widget")?.openFeatures;

        // 조인 전(홈 미설정 = 백로그 없음): 티켓 상태를 모르니 pending — 남은 일 있는 기능 1개.
        expect(await count()).toBe(1);

        // T05 — 홈을 설정하면 감시 뿌리도 그 홈의 projects/ 로 갈아탄다(discover 입력이 바뀐다).
        // 같은 프로젝트를 계속 찾게 하려면 그 아래로 옮겨 심어야 한다(실물 배치와 같은 모양).
        relocateUnderHomeProjects(projectRoot, home);

        // 홈을 설정해 조인하면: 그 티켓은 done — 더 이상 남은 일이 아니다.
        // 🔴 T04 — done 출처는 티켓 문서의 finishedAt 이다. 티켓 문서에 Time: 줄을 넣어 done 으로 만든다.
        // 🔴 relocateUnderHomeProjects 가 프로젝트를 home/projects/widget 로 옮겼으므로 그곳에 쓴다.
        writeFileSync(
          join(home, "projects", "widget", "docs", "features", "tauri-desktop-app", "tickets", "T04.md"),
          "# T04 — 신관례 문서 표시\n\n**Time:** started=2026-08-25T12:00:00+09:00 finished=2026-08-25T13:00:00+09:00\n",
        );
        await app.request("/api/settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ firstmateHome: home }),
        });
        clearSnapshot();
        expect(await count()).toBe(0);
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    }));

  test("부모 메모 + <parent>-t<NN> 로 조인되면 티켓에 백로그 상태가 실린다", async () =>
    withDataDir(async (dataDir) => {
      const projectRoot = makeProjectRoot();
      const home = makeFirstmateHome(BACKLOG);
      try {
        relocateUnderHomeProjects(projectRoot, home);
        const app = createApp({ roots: [projectRoot], treehouse: NO_TREEHOUSE, dataDir });
        await app.request("/api/settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ firstmateHome: home }),
        });
        const body = FeaturesResponse.parse(await (await app.request("/api/features/widget")).json());
        const f = body.features.find((x) => x.slug === "tauri-desktop-app");
        expect(f?.newTickets?.[0]).toMatchObject({
          num: "04",
          docConvention: "tickets",
          status: "in_progress",
          joinFailed: false,
        });
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    }));

  // T01 — 신관례 티켓의 `## Depends on` 도 API 응답에 실린다. 백로그엔 t03 이 없어
  // 상태를 모르므로(pending) 의존 03 은 계속 대기다 — 응답 모양이 기대와 같은지가 관건.
  test("신관례 티켓의 Depends on 이 blockedBy·waitingOn·startable 로 응답에 실린다", async () =>
    withDataDir(async (dataDir) => {
      const projectRoot = makeProjectRoot("T04.md", "# T04 — 신관례 문서 표시\n\n## Depends on\n- T03 (먼저 끝내기)\n");
      try {
        const app = createApp({ roots: [projectRoot], treehouse: NO_TREEHOUSE, dataDir });
        const body = FeaturesResponse.parse(await (await app.request("/api/features/widget")).json());
        const f = body.features.find((x) => x.slug === "tauri-desktop-app");
        expect(f?.newTickets?.[0]).toMatchObject({
          num: "04",
          blockedBy: ["03"],
          waitingOn: ["03"],
          startable: false,
        });
      } finally {
        rmSync(projectRoot, { recursive: true, force: true });
      }
    }));

  test("조인 실패(미매칭)여도 문서만으로 상태를 아는 신관례 티켓은 뜬다 — 막히지 않았으면 착수 가능", async () =>
    withDataDir(async (dataDir) => {
      const projectRoot = makeProjectRoot("T09.md"); // 백로그엔 t04 만 있다
      const home = makeFirstmateHome(BACKLOG);
      try {
        relocateUnderHomeProjects(projectRoot, home);
        const app = createApp({ roots: [projectRoot], treehouse: NO_TREEHOUSE, dataDir });
        await app.request("/api/settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ firstmateHome: home }),
        });
        const res = await app.request("/api/features/widget");
        expect(res.status).toBe(200);
        const body = FeaturesResponse.parse(await res.json());
        const f = body.features.find((x) => x.slug === "tauri-desktop-app");
        expect(f?.newTickets?.[0]?.joinFailed).toBe(false); // 신관례 자급 — 미매칭이어도 착수 가능
        expect(f?.newTickets?.[0]?.status).toBe("pending");
        expect(f?.newTickets?.[0]?.startable).toBe(true);
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    }));

  test("firstmate 홈 미설정이면 신관례 티켓은 그대로 뜨되 문서만으로 착수 가능으로 본다", async () =>
    withDataDir(async (dataDir) => {
      const projectRoot = makeProjectRoot();
      try {
        const app = createApp({ roots: [projectRoot], treehouse: NO_TREEHOUSE, dataDir });
        const body = FeaturesResponse.parse(await (await app.request("/api/features/widget")).json());
        const f = body.features.find((x) => x.slug === "tauri-desktop-app");
        expect(f?.newTickets?.[0]?.num).toBe("04");
        expect(f?.newTickets?.[0]?.joinFailed).toBe(false);
        expect(f?.newTickets?.[0]?.status).toBe("pending");
        expect(f?.newTickets?.[0]?.startable).toBe(true);
      } finally {
        rmSync(projectRoot, { recursive: true, force: true });
      }
    }));

  // 🔴 회귀 — 백로그 조인은 features 탭에만 걸려 있었고 plan/process 탭(GET /api/plan/:slug)에는
  // 안 걸려 있어서, 그 탭의 신관례 티켓은 영원히 "상태 줄 없음" 으로만 보였다(캡틴 지시, 2026-08-25).
  test("GET /api/plan/:slug 도 같은 백로그 조인을 받는다 — features 탭과 다른 말을 하지 않는다", async () =>
    withDataDir(async (dataDir) => {
      const projectRoot = makeProjectRoot();
      const home = makeFirstmateHome(BACKLOG);
      try {
        relocateUnderHomeProjects(projectRoot, home);
        const app = createApp({ roots: [projectRoot], treehouse: NO_TREEHOUSE, dataDir });
        await app.request("/api/settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ firstmateHome: home }),
        });
        const body = PlanBoardResponse.parse(await (await app.request("/api/plan/widget")).json());
        const card = body.waiting.find((c) => c.feature.slug === "tauri-desktop-app");
        expect(card?.feature.newTickets?.[0]).toMatchObject({
          num: "04",
          docConvention: "tickets",
          status: "in_progress",
          joinFailed: false,
        });
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    }));
});

/**
 * 안 읽은 티켓(unread-tickets-show-themselves/01) — 판정 자체는 core(`applyReadState`)와
 * core-io(`plan-store.test.ts`)가 이미 잰다. 여기서 보는 것은 **라우트가 그 둘을 잇는가**다.
 */
describe("GET /api/features/:slug — 읽음 기록", () => {
  test("🔴 처음 여는 프로젝트는 그때 있던 티켓을 전부 읽음으로 깔아 초록이 하나도 없다", () =>
    withDataDir(async (dataDir) => {
      const body = FeaturesResponse.parse(
        await (await createApp({ ...APP, dataDir }).request("/api/features/alpha")).json(),
      );
      for (const f of body.features) {
        expect(f.hasUnreadTicket).toBe(false);
        for (const t of f.tickets) expect(t.unread).toBe(false);
      }
    }));

  test("🔴 깔기는 한 번만 선다 — 서버를 다시 띄운 뒤(같은 dataDir 재사용) 생긴 티켓은 안 읽음으로 남는다", () =>
    withDataDir(async (dataDir) => {
      // 문서 트리를 손댈 수 있게 픽스처를 통째로 복사한다 — 원본 fixture 는 건드리지 않는다.
      const projectRoot = mkdtempSync(join(tmpdir(), "gootte-app-root-"));
      cpSync(FIXTURES, projectRoot, { recursive: true });
      const requestFeatures = async () =>
        FeaturesResponse.parse(
          await (
            await createApp({ roots: [projectRoot], treehouse: NO_TREEHOUSE, dataDir }).request(
              "/api/features/alpha",
            )
          ).json(),
        );

      try {
        // 첫 요청 — "서버가 처음 뜬 순간" 지금 있는 티켓이 전부 읽음으로 깔린다.
        const first = await requestFeatures();
        for (const f of first.features) for (const t of f.tickets) expect(t.unread).toBe(false);

        // 깔기와 다음 요청 사이에 새 티켓이 생긴다.
        writeFileSync(
          join(projectRoot, "alpha", "docs/features/auth-login/issues/09-new.md"),
          "# 09 — 새 티켓\n\nStatus: ready-for-agent\n",
        );
        // "서버 재기동" 흉내 — 메모리 캐시 비움(디스크 스냅샷은 남는다, T07). 재기동 직후에는
        // 저장된 스냅샷이 그대로 서빙되고(stale), 새 티켓은 감시 신호가 만드는 갱신(`updateProjectSnapshot`
        // — 실제론 감시기가 하는 일) 뒤에야 보인다. 그래서 갱신을 직접 트리거해 swap 을 확인한다.
        clearDiscoverCache();
        updateProjectSnapshot(dataDir, "alpha", [projectRoot]);

        // "서버 재기동 + 갱신" 흉내 — 같은 dataDir 로 새 `createApp` · 새 요청.
        const second = await requestFeatures();
        const auth = second.features.find((f) => f.slug === "auth-login")!;
        // 그 뒤에 생긴 09 만 안 읽음이고, 첫 깔기 때 있던 나머지는 그대로 읽음이다.
        expect(auth.tickets.find((t) => t.num === "09")?.unread).toBe(true);
        for (const t of auth.tickets.filter((t) => t.num !== "09")) expect(t.unread).toBe(false);
      } finally {
        rmSync(projectRoot, { recursive: true, force: true });
      }
    }));

  test("🔴 읽음 기록을 못 읽었으면 조용한 쪽으로 기운다 — 거짓 초록을 켜지 않는다(INV-U1)", () =>
    withDataDir(async (dataDir) => {
      // `plan.db` 자리에 파일이 아니라 디렉토리를 놓아 여는 것 자체가 실패하게 만든다.
      mkdirSync(join(dataDir, "plan.db"));
      const body = FeaturesResponse.parse(
        await (await createApp({ ...APP, dataDir }).request("/api/features/alpha")).json(),
      );
      for (const f of body.features) {
        expect(f.hasUnreadTicket).toBe(false);
        for (const t of f.tickets) expect(t.unread).toBe(false);
      }
    }));
});

describe("GET /api/features/:slug/:feature/doc — 문서 본문(read-only, INV-2)", () => {
  test("기능 폴더 안의 문서를 내준다", async () => {
    const app = createApp(APP);
    const res = await app.request("/api/features/alpha/doc-tree/doc?path=spec.md");
    expect(res.status).toBe(200);
    const body = FeatureDocResponse.parse(await res.json());
    expect(body.path).toBe("spec.md");
    expect(body.content).toContain("# doc-tree — 문서 트리 픽스처");
  });

  test("하위 경로(adr/*.md)도 내준다", async () => {
    const app = createApp(APP);
    const res = await app.request("/api/features/alpha/doc-tree/doc?path=adr/0001-x.md");
    expect(res.status).toBe(200);
    expect(FeatureDocResponse.parse(await res.json()).content).toContain("ADR 0001");
  });

  test("이슈 파일 원문도 내준다(캡틴 피드백 — issues 도 읽을 수 있어야 한다)", async () => {
    const app = createApp(APP);
    const res = await app.request("/api/features/alpha/doc-tree/doc?path=issues/01-a.md");
    expect(res.status).toBe(200);
    expect(FeatureDocResponse.parse(await res.json()).content).toContain("01 — 예시 티켓");
  });

  test("🔴 기능 폴더 밖으로 나가는 경로는 거절한다 — 형제 기능 폴더도 내주지 않는다", async () => {
    const app = createApp(APP);
    const res = await app.request(
      `/api/features/alpha/doc-tree/doc?path=${encodeURIComponent("../auth-login/spec.md")}`,
    );
    expect(res.status).toBe(400);
    expect(ApiError.parse(await res.json()).error).toContain("기능 폴더 밖");
  });

  test("🔴 저장소 밖 상위 경로 탈출도 거절한다", async () => {
    const app = createApp(APP);
    const res = await app.request(
      `/api/features/alpha/doc-tree/doc?path=${encodeURIComponent("../../../../../../etc/passwd")}`,
    );
    expect(res.status).toBe(400);
  });

  test("없는 문서는 404 — 무엇을 못 읽었는지 말한다", async () => {
    const app = createApp(APP);
    const res = await app.request("/api/features/alpha/doc-tree/doc?path=nope.md");
    expect(res.status).toBe(404);
    expect(ApiError.parse(await res.json()).error).toContain("nope.md");
  });

  test("미해소 프로젝트 slug → 404 ApiError", async () => {
    const app = createApp(APP);
    const res = await app.request("/api/features/does-not-exist/doc-tree/doc?path=spec.md");
    expect(res.status).toBe(404);
  });

  /** 티켓 원문을 열면 읽음이 된다(unread-tickets-show-themselves/01) — 세 탭이 공유하는 이 자리 하나. */
  describe("읽음 기록", () => {
    test("🔴 티켓 문서(issues/)를 열면 읽음이 된다", () =>
      withDataDir(async (dataDir) => {
        const res = await createApp({ ...APP, dataDir }).request(
          "/api/features/alpha/doc-tree/doc?path=issues/01-a.md",
        );
        expect(res.status).toBe(200);
        expect(readReadMarks(dataDir, "alpha")).toEqual(new Set(["doc-tree/issues/01-a.md"]));
      }));

    test("명세·결정 기록을 열어도 읽음 기록이 남지 않는다(캡틴 결정 ② — 표시는 티켓뿐)", () =>
      withDataDir(async (dataDir) => {
        await createApp({ ...APP, dataDir }).request("/api/features/alpha/doc-tree/doc?path=spec.md");
        await createApp({ ...APP, dataDir }).request(
          "/api/features/alpha/doc-tree/doc?path=adr/0001-x.md",
        );
        expect(readReadMarks(dataDir, "alpha")).toEqual(new Set());
      }));

    test("같은 티켓을 두 번 열어도 한 번과 같다(멱등)", () =>
      withDataDir(async (dataDir) => {
        const app = createApp({ ...APP, dataDir });
        await app.request("/api/features/alpha/doc-tree/doc?path=issues/01-a.md");
        await app.request("/api/features/alpha/doc-tree/doc?path=issues/01-a.md");
        expect(readReadMarks(dataDir, "alpha")).toEqual(new Set(["doc-tree/issues/01-a.md"]));
      }));

    /** 신관례 전용 기능을 픽스처 사본에 심는 도우미 — 원본 fixture 는 건드리지 않는다. */
    const withNewConvFeature = async (
      dataDir: string,
      fn: (app: ReturnType<typeof createApp>, projectRoot: string) => Promise<void> | void,
    ): Promise<void> => {
      const projectRoot = mkdtempSync(join(tmpdir(), "gootte-app-root-"));
      cpSync(FIXTURES, projectRoot, { recursive: true });
      mkdirSync(join(projectRoot, "alpha/docs/features/new-conv/tickets"), { recursive: true });
      writeFileSync(
        join(projectRoot, "alpha/docs/features/new-conv/tickets/T01.md"),
        "# T01 — 신관례 샘플\n\n## Depends on\n- nothing\n",
      );
      try {
        await fn(createApp({ roots: [projectRoot], treehouse: NO_TREEHOUSE, dataDir }), projectRoot);
      } finally {
        rmSync(projectRoot, { recursive: true, force: true });
      }
    };

    test("🔴 신관례 티켓(tickets/T<NN>.md)을 열어도 읽음이 된다(실제 결함, 2026-08-26 캡틴 보고)", () =>
      withDataDir((dataDir) =>
        withNewConvFeature(dataDir, async (app) => {
          const res = await app.request("/api/features/alpha/new-conv/doc?path=tickets/T01.md");
          expect(res.status).toBe(200);
          expect(readReadMarks(dataDir, "alpha")).toEqual(new Set(["new-conv/tickets/T01.md"]));
        }),
      ));

    test("tickets/ 안의 비티켓 파일을 열어도 기록이 남지 않는다 — 티켓 모양은 T<NN>.md 뿐이다", () =>
      withDataDir((dataDir) =>
        withNewConvFeature(dataDir, async (app, projectRoot) => {
          writeFileSync(join(projectRoot, "alpha/docs/features/new-conv/tickets/README.md"), "# 안내\n");
          const res = await app.request("/api/features/alpha/new-conv/doc?path=tickets/README.md");
          expect(res.status).toBe(200);
          expect(readReadMarks(dataDir, "alpha")).toEqual(new Set());
        }),
      ));

    test("신관례 티켓도 두 번 열면 한 번과 같다(멱등)", () =>
      withDataDir((dataDir) =>
        withNewConvFeature(dataDir, async (app) => {
          await app.request("/api/features/alpha/new-conv/doc?path=tickets/T01.md");
          await app.request("/api/features/alpha/new-conv/doc?path=tickets/T01.md");
          expect(readReadMarks(dataDir, "alpha")).toEqual(new Set(["new-conv/tickets/T01.md"]));
        }),
      ));

    test("🔴 신관례 전용 기능에서 티켓을 다 읽으면 초록이 풀린다(hasUnreadTicket === false)", () =>
      withDataDir((dataDir) =>
        withNewConvFeature(dataDir, async (app, projectRoot) => {
          // 첫 요청 — 첫 깔기 때 있던 T01 은 읽음으로 깔린다.
          const first = FeaturesResponse.parse(
            await (await app.request("/api/features/alpha")).json(),
          );
          expect(first.features.find((f) => f.slug === "new-conv")?.hasUnreadTicket).toBe(false);

          // 깔기 뒤에 생긴 T02 만 안 읽음이다.
          writeFileSync(
            join(projectRoot, "alpha/docs/features/new-conv/tickets/T02.md"),
            "# T02 — 나중에 생긴 티켓\n\n## Depends on\n- nothing\n",
          );
          // 재기동 흉내(메모리 비움) + 감시 갱신 트리거(T07 — 디스크 스냅샷은 남고, swap 은 갱신 뒤).
          clearDiscoverCache();
          updateProjectSnapshot(dataDir, "alpha", [projectRoot]);
          const second = FeaturesResponse.parse(
            await (await app.request("/api/features/alpha")).json(),
          );
          expect(second.features.find((f) => f.slug === "new-conv")?.hasUnreadTicket).toBe(true);

          // T02 원문을 열면 → 기록이 남고 → 초록이 풀린다.
          const doc = await app.request("/api/features/alpha/new-conv/doc?path=tickets/T02.md");
          expect(doc.status).toBe(200);
          const third = FeaturesResponse.parse(
            await (await app.request("/api/features/alpha")).json(),
          );
          expect(third.features.find((f) => f.slug === "new-conv")?.hasUnreadTicket).toBe(false);
        }),
      ));
  });
});

/**
 * `plan` 탭 — 다섯 자리 판(plan-board/02). 자리를 가르는 규칙 자체는 core 가 덮는다
 * (`core/src/plan/board.test.ts`). 여기서 보는 것은 **라우트가 문서와 자리 행을 이어 싣는가**다.
 */
describe("GET /api/plan/:slug — 다섯 자리 판", () => {
  type DatabaseSyncCtor = new (path: string) => DatabaseSyncType;
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as {
    DatabaseSync: DatabaseSyncCtor;
  };

  const withDataDir = <T>(fn: (dataDir: string) => Promise<T> | T): Promise<T> | T => {
    const dir = mkdtempSync(join(tmpdir(), "gootte-app-plan-"));
    const done = () => rmSync(dir, { recursive: true, force: true });
    try {
      const out = fn(dir);
      return out instanceof Promise ? out.finally(done) : (done(), out);
    } catch (err) {
      done();
      throw err;
    }
  };

  const place = (dataDir: string, feature: string, area: string, seq: number): void => {
    migratePlanDb(dataDir);
    const db = new DatabaseSync(join(dataDir, "plan.db"));
    try {
      db.prepare(
        `INSERT INTO placement (project, feature, area, seq, closed_at) VALUES (?, ?, ?, ?, NULL)`,
      ).run("alpha", feature, area, seq);
    } finally {
      db.close();
    }
  };

  test("🔴 자리 행이 하나도 없으면 기능 문서 전부가 대기 칸에 뜬다 — 등록 절차가 없다(INV-B1)", () =>
    withDataDir(async (dataDir) => {
      const res = await createApp({ ...APP, dataDir }).request("/api/plan/alpha");
      expect(res.status).toBe(200);
      const body = PlanBoardResponse.parse(await res.json());
      expect(body.project).toBe("alpha");
      expect(body.waiting.map((c) => c.feature.slug)).toEqual(["auth-login", "doc-tree"]);
      expect([body.active, body.reserved, body.discarded, body.done]).toEqual([[], [], [], []]);
    }));

  test("카드는 문서에서 온 제목과 티켓 줄을 싣는다 — 저장된 사본이 아니다(INV-5)", () =>
    withDataDir(async (dataDir) => {
      const body = PlanBoardResponse.parse(
        await (await createApp({ ...APP, dataDir }).request("/api/plan/alpha")).json(),
      );
      const card = body.waiting.find((c) => c.feature.slug === "auth-login");
      expect(card?.feature.title).toBe("auth-login — 로그인");
      expect(card?.feature.tickets.map((t) => t.num)).toEqual(["01", "02", "03"]);
      // 대기 카드는 저장된 것이 하나도 없다.
      expect(card).toMatchObject({ seq: null, closedAt: null });
    }));

  test("🔴 작업중 사본이 있으면 계획 판 티켓도 처리중을 말한다(status-colors-tell-apart/02, spec H6)", () =>
    withDataDir(async (dataDir) => {
      const th = makeTreehouse();
      try {
        const body = PlanBoardResponse.parse(
          await (await createApp({ roots, treehouse: th, dataDir }).request("/api/plan/alpha")).json(),
        );
        const card = body.waiting.find((c) => c.feature.slug === "auth-login");
        const t = card?.feature.tickets.find((x) => x.slug === "02-screen");
        expect(t?.status).toBe("in_progress");
        expect(t?.workedBy).toEqual(["fm/screen"]);
      } finally {
        rmSync(th, { recursive: true, force: true });
      }
    }));

  test("자리 행이 있으면 그 칸에 실린다 — 나머지는 그대로 대기", () =>
    withDataDir(async (dataDir) => {
      place(dataDir, "auth-login", "active", 0);
      const body = PlanBoardResponse.parse(
        await (await createApp({ ...APP, dataDir }).request("/api/plan/alpha")).json(),
      );
      expect(body.active.map((c) => c.feature.slug)).toEqual(["auth-login"]);
      expect(body.active[0]?.seq).toBe(0);
      expect(body.waiting.map((c) => c.feature.slug)).toEqual(["doc-tree"]);
    }));

  test("작업 대상 카드는 티켓별 표시 단계를 싣는다(plan-board/05) — 판정은 core 함수 하나뿐", () =>
    withDataDir(async (dataDir) => {
      place(dataDir, "auth-login", "active", 0);
      writeStep(dataDir, "alpha", "auth-login", "02-screen", 1);
      writeStep(dataDir, "alpha", "auth-login", "03-social", 9999);
      const body = PlanBoardResponse.parse(
        await (await createApp({ ...APP, dataDir }).request("/api/plan/alpha")).json(),
      );
      const card = body.active.find((c) => c.feature.slug === "auth-login");
      expect(card?.steps).toEqual({ "02-screen": 1, "03-social": 9999 });
    }));

  test("작업 대상 밖 카드는 단계가 실리지 않는다 — 단계는 작업 대상에 있는 동안만 존재한다", () =>
    withDataDir(async (dataDir) => {
      const body = PlanBoardResponse.parse(
        await (await createApp({ ...APP, dataDir }).request("/api/plan/alpha")).json(),
      );
      expect(body.waiting.find((c) => c.feature.slug === "auth-login")?.steps).toBeUndefined();
    }));

  test("🔴 판을 읽어도 관리대상에는 한 글자도 쓰지 않는다(INV-2)", () =>
    withDataDir(async (dataDir) => {
      const before = treeSnapshot(FIXTURES);
      await createApp({ ...APP, dataDir }).request("/api/plan/alpha");
      expect(treeSnapshot(FIXTURES)).toEqual(before);
    }));

  test("미해소 slug → 404 ApiError", () =>
    withDataDir(async (dataDir) => {
      const res = await createApp({ ...APP, dataDir }).request("/api/plan/does-not-exist");
      expect(res.status).toBe(404);
      expect(ApiError.parse(await res.json()).error).toContain("does-not-exist");
    }));

  /**
   * 안 읽음 표시(unread-tickets-show-themselves/02) — `features` 탭과 **같은 판정 자리**
   * (`applyReadState`)를 이 라우트도 탄다. 판정 자체는 core 가 잰다 — 여기서 보는 것은
   * **라우트가 그 판정을 잇는가**와 **두 탭이 같은 값을 보는가**뿐이다.
   */
  test("🔴 카드의 티켓도 안 읽음이 실린다 — features 탭과 같은 값(같은 dataDir)", () =>
    withDataDir(async (dataDir) => {
      const app = createApp({ ...APP, dataDir });
      const featuresBody = FeaturesResponse.parse(
        await (await app.request("/api/features/alpha")).json(),
      );
      const planBody = PlanBoardResponse.parse(await (await app.request("/api/plan/alpha")).json());

      const featuresAuth = featuresBody.features.find((f) => f.slug === "auth-login")!;
      const planAuth = planBody.waiting.find((c) => c.feature.slug === "auth-login")!.feature;
      expect(planAuth.hasUnreadTicket).toBe(featuresAuth.hasUnreadTicket);
      expect(planAuth.tickets.map((t) => [t.num, t.unread])).toEqual(
        featuresAuth.tickets.map((t) => [t.num, t.unread]),
      );
    }));

  /**
   * 카드를 옮긴다(plan-board/03) — **계획 DB 에 쓰는 유일한 입구**.
   * 무엇을 쓸지 정하는 규칙은 `core/src/plan/move.test.ts` 가, 실제 표에 앉는지는
   * `core-io/src/plan-store.test.ts` 가 덮는다. 여기서 보는 것은 **라우트가 그 둘을 잇고 새 판을
   * 다시 읽어 돌려주는가**, 그리고 **관리대상에 아무것도 쓰지 않는가**다.
   */
  describe("POST /api/plan/:slug/move — 캡틴이 옮긴다", () => {
    const NOW = "2026-08-12 17:40";
    const app = (dataDir: string) => createApp({ ...APP, dataDir, now: () => NOW });
    const post = (dataDir: string, body: unknown, slug = "alpha") =>
      app(dataDir).request(`/api/plan/${slug}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const board = async (res: Response) => PlanBoardResponse.parse(await res.json());

    test("대기 카드를 작업 대상으로 올리면 옮긴 판이 그대로 돌아온다", () =>
      withDataDir(async (dataDir) => {
        const res = await post(dataDir, { features: ["auth-login"], area: "active", index: 0 });
        expect(res.status).toBe(200);
        const body = await board(res);
        expect(body.active.map((c) => c.feature.slug)).toEqual(["auth-login"]);
        expect(body.waiting.map((c) => c.feature.slug)).toEqual(["doc-tree"]);
      }));

    test("새로 고쳐도 그대로다 — GET 이 같은 판을 말한다", () =>
      withDataDir(async (dataDir) => {
        await post(dataDir, { features: ["auth-login", "doc-tree"], area: "active", index: 0 });
        const body = PlanBoardResponse.parse(
          await (await app(dataDir).request("/api/plan/alpha")).json(),
        );
        expect(body.active.map((c) => c.feature.slug)).toEqual(["auth-login", "doc-tree"]);
        expect(body.waiting).toEqual([]);
      }));

    test("🔴 작업 대상으로 올라오면 의존에서 단계를 계산해 심는다 — 끝난 티켓에는 행이 없다(T02/D2)", () =>
      withDataDir(async (dataDir) => {
        await post(dataDir, { features: ["auth-login"], area: "active", index: 0 });
        // fixture: 01(resolved) → 02 → 03. 끝난 01 에는 행이 없고(D2), 남은 02 는
        // 완료된 선행(01)이 풀려 1단계가 된다. 03 은 02 다음인 2단계.
        expect(readSteps(dataDir, "alpha")).toEqual([
          { feature: "auth-login", ticket: "02-screen", step: 1 },
          { feature: "auth-login", ticket: "03-social", step: 2 },
        ]);
      }));

    test("🔴 작업 대상을 떠나면 그 단계 행이 사라진다", () =>
      withDataDir(async (dataDir) => {
        await post(dataDir, { features: ["auth-login"], area: "active", index: 0 });
        await post(dataDir, { features: ["auth-login"], area: "reserved", index: 0 });
        expect(readSteps(dataDir, "alpha")).toEqual([]);
      }));

    test("🔴 남은 티켓이 있어도 완료로 간다 — 이유를 묻지 않고 닫힌 시각이 찍힌다(캡틴 결정)", () =>
      withDataDir(async (dataDir) => {
        const body = await board(
          await post(dataDir, { features: ["auth-login"], area: "done", index: 0 }),
        );
        expect(body.done.map((c) => c.feature.slug)).toEqual(["auth-login"]);
        expect(body.done[0]?.closedAt).toBe(NOW);
        // 남은 티켓은 완료로 위장되지 않는다(INV-B4) — 문서에서 온 상태 그대로다.
        expect(body.done[0]?.feature.tickets.some((t) => t.status !== "done")).toBe(true);
      }));

    test("대기로 돌려보내면 자리 행이 사라진다 — 대기 칸에서 다시 보인다", () =>
      withDataDir(async (dataDir) => {
        await post(dataDir, { features: ["auth-login"], area: "active", index: 0 });
        const body = await board(await post(dataDir, { features: ["auth-login"], area: null }));
        expect(body.waiting.map((c) => c.feature.slug)).toEqual(["auth-login", "doc-tree"]);
        expect(body.active).toEqual([]);
      }));

    test("작업 대상 안에서 순서를 바꾼다", () =>
      withDataDir(async (dataDir) => {
        await post(dataDir, { features: ["auth-login", "doc-tree"], area: "active", index: 0 });
        const body = await board(
          await post(dataDir, { features: ["doc-tree"], area: "active", index: 0 }),
        );
        expect(body.active.map((c) => c.feature.slug)).toEqual(["doc-tree", "auth-login"]);
      }));

    test("🔴 옮겨도 관리대상에는 한 글자도 쓰지 않는다(INV-2)", () =>
      withDataDir(async (dataDir) => {
        const before = treeSnapshot(FIXTURES);
        await post(dataDir, { features: ["auth-login"], area: "done", index: 0 });
        expect(treeSnapshot(FIXTURES)).toEqual(before);
      }));

    test("문서가 없는 기능 이름은 400 — 조용히 버리면 화면이 옮겨진 척한다", () =>
      withDataDir(async (dataDir) => {
        const res = await post(dataDir, { features: ["ghost"], area: "active", index: 0 });
        expect(res.status).toBe(400);
        expect(ApiError.parse(await res.json()).error).toContain("ghost");
        expect(readPlacements(dataDir, "alpha")).toEqual([]);
      }));

    test("옮길 기능이 하나도 없는 요청은 계약이 거절한다", () =>
      withDataDir(async (dataDir) => {
        expect((await post(dataDir, { features: [], area: "active" })).status).toBe(400);
      }));

    test("정규 자리가 아닌 값은 계약이 거절한다 — '대기' 라는 값은 없다(INV-B1)", () =>
      withDataDir(async (dataDir) => {
        expect((await post(dataDir, { features: ["auth-login"], area: "waiting" })).status).toBe(400);
      }));

    test("미해소 slug → 404 ApiError", () =>
      withDataDir(async (dataDir) => {
        const res = await post(dataDir, { features: ["auth-login"], area: "active" }, "nope");
        expect(res.status).toBe(404);
      }));
  });

  /**
   * 캡틴이 `process` 탭에서 티켓을 끌어 단계를 정한다(plan-board/08).
   * 놓은 자리 → 저장 숫자 계산 자체는 `core/src/plan/step.test.ts` 가 덮는다. 여기서 보는 것은
   * **라우트가 그 함수와 `writeStep`(cli 와 같은 쓰기 자리)을 잇고, 새 판을 다시 읽어 돌려주는가**다.
   */
  describe("POST /api/plan/:slug/step — 캡틴이 끌어 단계를 정한다", () => {
    const app = (dataDir: string) => createApp({ ...APP, dataDir });
    const post = (dataDir: string, body: unknown, slug = "alpha") =>
      app(dataDir).request(`/api/plan/${slug}/step`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const board = async (res: Response) => PlanBoardResponse.parse(await res.json());

    // 🔴 auth-login 01-session 은 fixture 상 `resolved` — 완료 티켓이라 표시 계산에서 걷힌다.
    // 그래서 이동 시나리오는 02-screen · 03-social(auth-login) · 01-a(doc-tree) 셋을 쓴다.

    test("이미 있는 단계 위에 놓으면 그 단계의 저장 숫자를 그대로 받는다", () =>
      withDataDir(async (dataDir) => {
        place(dataDir, "auth-login", "active", 0);
        place(dataDir, "doc-tree", "active", 1);
        writeStep(dataDir, "alpha", "auth-login", "02-screen", 1);
        writeStep(dataDir, "alpha", "auth-login", "03-social", 2);
        const res = await post(dataDir, {
          feature: "doc-tree",
          ticket: "01-a",
          target: { kind: "onStep", displayStep: 2 },
        });
        expect(res.status).toBe(200);
        expect(readSteps(dataDir, "alpha")).toEqual(
          expect.arrayContaining([{ feature: "doc-tree", ticket: "01-a", step: 2 }]),
        );
      }));

    test("단계와 단계 사이에 놓으면 새 단계가 생기고, 다른 티켓의 저장 숫자는 바뀌지 않는다", () =>
      withDataDir(async (dataDir) => {
        place(dataDir, "auth-login", "active", 0);
        place(dataDir, "doc-tree", "active", 1);
        writeStep(dataDir, "alpha", "auth-login", "02-screen", 1);
        writeStep(dataDir, "alpha", "auth-login", "03-social", 2);
        const before = readSteps(dataDir, "alpha");
        const res = await post(dataDir, {
          feature: "doc-tree",
          ticket: "01-a",
          target: { kind: "gap", index: 1 },
        });
        const body = await board(res);
        const auth = body.active.find((c) => c.feature.slug === "auth-login");
        const doc = body.active.find((c) => c.feature.slug === "doc-tree");
        expect(auth?.steps).toEqual({ "02-screen": 1, "03-social": 3 });
        expect(doc?.steps).toEqual({ "01-a": 2 });
        // 사이에 끼워 넣어도 원래 있던 행 둘은 저장 숫자가 그대로다.
        expect(readSteps(dataDir, "alpha")).toEqual(
          expect.arrayContaining(before.map((s) => expect.objectContaining(s))),
        );
      }));

    test("9999 무더기 위로 되돌릴 수 있다", () =>
      withDataDir(async (dataDir) => {
        place(dataDir, "auth-login", "active", 0);
        writeStep(dataDir, "alpha", "auth-login", "02-screen", 1);
        const res = await post(dataDir, {
          feature: "auth-login",
          ticket: "02-screen",
          target: { kind: "unranked" },
        });
        expect(res.status).toBe(200);
        expect(readSteps(dataDir, "alpha")).toEqual([
          { feature: "auth-login", ticket: "02-screen", step: 9999 },
        ]);
      }));

    test("🔴 옮겨도 관리대상에는 한 글자도 쓰지 않는다(INV-2)", () =>
      withDataDir(async (dataDir) => {
        place(dataDir, "auth-login", "active", 0);
        const before = treeSnapshot(FIXTURES);
        await post(dataDir, {
          feature: "auth-login",
          ticket: "02-screen",
          target: { kind: "gap", index: 0 },
        });
        expect(treeSnapshot(FIXTURES)).toEqual(before);
      }));

    test("문서가 없는 기능 이름은 400", () =>
      withDataDir(async (dataDir) => {
        const res = await post(dataDir, {
          feature: "ghost",
          ticket: "01-x",
          target: { kind: "unranked" },
        });
        expect(res.status).toBe(400);
        expect(ApiError.parse(await res.json()).error).toContain("ghost");
      }));

    test("문서가 없는 티켓 이름은 400", () =>
      withDataDir(async (dataDir) => {
        place(dataDir, "auth-login", "active", 0);
        const res = await post(dataDir, {
          feature: "auth-login",
          ticket: "99-ghost",
          target: { kind: "unranked" },
        });
        expect(res.status).toBe(400);
        expect(ApiError.parse(await res.json()).error).toContain("99-ghost");
      }));

    test("🔴 신관례(tickets/) 티켓을 끌어도 400 이 아니다 — 존재 판정이 두 관례를 합쳐 본다(실제 결함)", () =>
      withDataDir(async (dataDir) => {
        // 픽스처를 통째로 복사해 신관례 전용 기능을 심는다 — 원본 fixture 는 건드리지 않는다.
        const projectRoot = mkdtempSync(join(tmpdir(), "gootte-app-root-"));
        cpSync(FIXTURES, projectRoot, { recursive: true });
        mkdirSync(join(projectRoot, "alpha/docs/features/new-conv/tickets"), { recursive: true });
        writeFileSync(
          join(projectRoot, "alpha/docs/features/new-conv/tickets/T01.md"),
          "# T01 — 신관례 샘플\n\n## Depends on\n- nothing\n",
        );
        try {
          const app = createApp({ roots: [projectRoot], treehouse: NO_TREEHOUSE, dataDir });
          place(dataDir, "new-conv", "active", 0);
          const res = await app.request("/api/plan/alpha/step", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              feature: "new-conv",
              ticket: "T01",
              target: { kind: "unranked" },
            }),
          });
          expect(res.status).toBe(200);
          expect(readSteps(dataDir, "alpha")).toEqual([
            { feature: "new-conv", ticket: "T01", step: 9999 },
          ]);
        } finally {
          rmSync(projectRoot, { recursive: true, force: true });
        }
      }));

    test("작업 대상 밖의 기능은 400", () =>
      withDataDir(async (dataDir) => {
        const res = await post(dataDir, {
          feature: "auth-login",
          ticket: "01-session",
          target: { kind: "unranked" },
        });
        expect(res.status).toBe(400);
        expect(ApiError.parse(await res.json()).error).toContain("auth-login");
      }));

    test("미해소 slug → 404 ApiError", () =>
      withDataDir(async (dataDir) => {
        const res = await post(
          dataDir,
          { feature: "auth-login", ticket: "01-session", target: { kind: "unranked" } },
          "nope",
        );
        expect(res.status).toBe(404);
      }));
  });
});

describe("discover 캐시 (W2)", () => {
  test("TTL 내 재사용, TTL 경과 후 재스캔", () => {
    clearDiscoverCache();
    const a = getProjects(roots, 1_000);
    const b = getProjects(roots, 1_000 + DISCOVER_TTL_MS - 1); // TTL 내 = 같은 인스턴스
    expect(b).toBe(a);
    const c = getProjects(roots, 1_000 + DISCOVER_TTL_MS + 1); // TTL 경과 = 재스캔
    expect(c).not.toBe(a);
  });
});

describe("slug 해소 (W1 — T01 묶기 이후)", () => {
  // discover 가 같은 slug 의 사본을 하나의 Project(copies 배열)로 묶어 내므로 여기엔 slug 당
  // 하나만 온다. 중복은 이제 정상 상태 — ambiguous 플래그·stderr 경고는 없다.
  test("같은 slug 의 사본은 discover 가 하나로 묶는다 — pickBySlug 는 묶인 프로젝트를 그대로 준다", () => {
    const projects: Project[] = [
      { slug: "dup", path: "/home/a/dup", copies: ["/home/a/dup", "/work/b/dup"] },
      { slug: "solo", path: "/x/solo", copies: ["/x/solo"] },
    ];
    const dup = pickBySlug(projects, "dup");
    expect(dup?.path).toBe("/home/a/dup"); // 대표 = 첫 사본
    expect(dup?.copies).toEqual(["/home/a/dup", "/work/b/dup"]); // 뿌리 순서 그대로

    const solo = pickBySlug(projects, "solo");
    expect(solo?.path).toBe("/x/solo");
    expect(solo?.copies).toEqual(["/x/solo"]);

    expect(pickBySlug(projects, "none")).toBeNull();
  });
});

/**
 * 티켓이 스스로 체크되고, 다 되면 카드가 닫힌다(plan-board/04).
 *
 * 🔴 여기서 재는 것은 **라우트가 그 판정을 실제로 계획 DB 에 적는가**다 — 무엇이 닫히는지의
 * 규칙은 `core/src/plan/close.test.ts` 가 덮는다. 문서는 임시 디렉토리에 합성한다(이 저장소의
 * `docs/` 를 픽스처로 쓰지 않는다). 공용 픽스처(`alpha`)에 기능을 더하면 다른 테스트의 칸 목록이
 * 흔들리므로 이 절만의 뿌리를 따로 세운다.
 */
describe("자동 닫힘 — 상자가 전부 채워지면 카드가 완료 칸으로 간다(plan-board/04)", () => {
  const NOW = "2026-08-12 17:40";

  /** 티켓 파일 한 장 — 상단 두 줄이 서식의 전부다(관리대상 `docs/agents/triage-labels.md`). */
  const ticket = (num: string, status: string): string =>
    [`# ${num} — 티켓 ${num}`, "", "**Blocked by:** 없음 — 즉시 착수 가능", `**Status:** ${status}`, ""].join("\n");

  /** 관리대상 하나를 임시 디렉토리에 합성한다 — 뿌리 `AGENTS.md` + `docs/features/`(discover 조건). */
  const withProject = <T>(
    features: Record<string, Record<string, string>>,
    fn: (ctx: { roots: string[]; dataDir: string; projectRoot: string }) => Promise<T> | T,
  ): Promise<T> | T => {
    const root = mkdtempSync(join(tmpdir(), "gootte-app-close-"));
    const projectRoot = join(root, "beta");
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(join(projectRoot, "AGENTS.md"), "# beta\n");
    for (const [feature, tickets] of Object.entries(features)) {
      const dir = join(projectRoot, "docs", "features", feature);
      mkdirSync(join(dir, "issues"), { recursive: true });
      writeFileSync(join(dir, "spec.md"), `# ${feature} — 제목\n`);
      for (const [file, body] of Object.entries(tickets)) writeFileSync(join(dir, "issues", file), body);
    }
    const dataDir = mkdtempSync(join(tmpdir(), "gootte-app-close-db-"));
    const done = () => {
      rmSync(root, { recursive: true, force: true });
      rmSync(dataDir, { recursive: true, force: true });
      clearDiscoverCache();
    };
    clearDiscoverCache();
    try {
      const out = fn({ roots: [root], dataDir, projectRoot });
      return out instanceof Promise ? out.finally(done) : (done(), out);
    } catch (err) {
      done();
      throw err;
    }
  };

  const ALL_DONE = { "01-a.md": ticket("01", "resolved (2026-08-08)"), "02-b.md": ticket("02", "resolved (2026-08-09)") };
  const HALF = { "01-a.md": ticket("01", "resolved (2026-08-08)"), "02-b.md": ticket("02", "ready-for-agent") };

  const get = async (ctx: { roots: string[]; dataDir: string }, now = NOW) =>
    PlanBoardResponse.parse(
      await (
        await createApp({ ...ctx, treehouse: NO_TREEHOUSE, now: () => now }).request("/api/plan/beta")
      ).json(),
    );
  const post = (ctx: { roots: string[]; dataDir: string }, body: unknown) =>
    createApp({ ...ctx, treehouse: NO_TREEHOUSE, now: () => NOW }).request("/api/plan/beta/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  test("🔴 상자가 전부 채워진 기능은 처음 본 순간 완료 칸으로 간다 — 아무도 gootte 에 알리지 않았다", () =>
    withProject({ shipped: ALL_DONE }, async (ctx) => {
      const body = await get(ctx);
      expect(body.done.map((c) => c.feature.slug)).toEqual(["shipped"]);
      expect(body.waiting).toEqual([]);
      // 🔴 06 — 저절로 닫을 때는 closed_at 을 찍지 않는다. 화면이 보여줄 시각은 문서에서 온다.
      expect(body.done[0]?.closedAt).toBeNull();
    }));

  test("일부만 완료면 그대로 대기에 남는다 — 빈 상자가 하나라도 있으면 닫히지 않는다", () =>
    withProject({ half: HALF }, async (ctx) => {
      const body = await get(ctx);
      expect(body.waiting.map((c) => c.feature.slug)).toEqual(["half"]);
      expect(body.done).toEqual([]);
      expect(readPlacements(ctx.dataDir, "beta")).toEqual([]);
    }));

  test("🔴 티켓이 0장인 기능은 닫히지 않는다 — 끝났다는 증거가 없다", () =>
    withProject({ empty: {} }, async (ctx) => {
      expect((await get(ctx)).waiting.map((c) => c.feature.slug)).toEqual(["empty"]);
      expect(readPlacements(ctx.dataDir, "beta")).toEqual([]);
    }));

  test("🔴 폐기와 완료가 섞인 기능도 닫힌다 — 뒤집힘(plan-board/12, 캡틴 결정 2026-08-14)", () =>
    withProject(
      { mixed: { "01-a.md": ticket("01", "resolved (2026-08-08)"), "02-b.md": ticket("02", "wontfix") } },
      async (ctx) => {
        const body = await get(ctx);
        expect(body.done.map((c) => c.feature.slug)).toEqual(["mixed"]);
        expect(body.waiting).toEqual([]);
      },
    ));

  test("🔴 폐기뿐인 기능도 닫힌다", () =>
    withProject({ wontfix: { "01-a.md": ticket("01", "wontfix") } }, async (ctx) => {
      const body = await get(ctx);
      expect(body.done.map((c) => c.feature.slug)).toEqual(["wontfix"]);
      // 🔴 전부 폐기로 닫힌 카드는 닫힌 날짜가 없다 — 지어내지 않는다.
      expect(body.done[0]?.closedAt).toBeNull();
    }));

  test("🔴 저절로 닫힌 카드는 다시 봐도 closed_at 이 없다 — 볼 때마다 다시 쓰지 않는다", () =>
    withProject({ shipped: ALL_DONE }, async (ctx) => {
      await get(ctx);
      const again = await get(ctx, "2026-08-13 09:00");
      expect(again.done[0]?.closedAt).toBeNull();
    }));

  test("🔴 캡틴이 손으로 정한 자리(예약·폐기)는 덮지 않는다 — 기계가 몰래 옮기지 않는다", () =>
    withProject({ shipped: ALL_DONE }, async (ctx) => {
      await post(ctx, { features: ["shipped"], area: "reserved", index: 0 });
      const body = await get(ctx);
      expect(body.reserved.map((c) => c.feature.slug)).toEqual(["shipped"]);
      expect(body.done).toEqual([]);
    }));

  test("작업 대상에 올린 완료 기능은 그 자리에서 닫히고 단계 행이 남지 않는다(INV-B6)", () =>
    withProject({ shipped: ALL_DONE }, async (ctx) => {
      const body = PlanBoardResponse.parse(
        await (await post(ctx, { features: ["shipped"], area: "active", index: 0 })).json(),
      );
      expect(body.active).toEqual([]);
      expect(body.done.map((c) => c.feature.slug)).toEqual(["shipped"]);
      expect(readSteps(ctx.dataDir, "beta")).toEqual([]);
    }));

  test("🔴 계획 DB 에 쓰는 것은 자리뿐 — 체크 상태도 닫은 시각도 저장되지 않는다(INV-5, 06)", () =>
    withProject({ shipped: ALL_DONE }, async (ctx) => {
      await get(ctx);
      expect(readPlacements(ctx.dataDir, "beta")).toEqual([
        { feature: "shipped", area: "done", seq: 0, closedAt: null },
      ]);
    }));

  test("🔴 저절로 닫아도 관리대상에는 한 글자도 쓰지 않는다(INV-2)", () =>
    withProject({ shipped: ALL_DONE }, async (ctx) => {
      const before = treeSnapshot(ctx.projectRoot);
      await get(ctx);
      expect(treeSnapshot(ctx.projectRoot)).toEqual(before);
    }));

  test("🔴 저절로 닫힌 기능에 안 읽은 티켓이 더 붙으면 대기로 돌아온다(plan-board/11, INV-B8)", () =>
    withProject({ shipped: ALL_DONE }, async (ctx) => {
      await get(ctx); // 있던 티켓을 읽음으로 깐다(첫 화면, spec §첫 화면이 통째로 초록이면 안 된다).
      // 규율을 어겨 안 읽은 티켓 한 장이 더 붙었다(spec §닫힌 기능에는 티켓을 더하지 않는다) — 그래도 할 일이다.
      writeFileSync(
        join(ctx.projectRoot, "docs", "features", "shipped", "issues", "03-late.md"),
        ticket("03", "ready-for-agent"),
      );
      // 🔴 문서를 직접 고쳤다 = T05 감시 신호가 날려 스냅샷을 갱신한다. 테스트는 감시기를 안 돌리니
      // 그 갱신을 여기서 흉내낸다(T07 — plan 보드는 스냅샷에서 서빙하므로).
      updateProjectSnapshot(ctx.dataDir, "beta", [ctx.projectRoot]);
      const body = await get(ctx, "2026-08-13 09:00");
      expect(body.done).toEqual([]);
      expect(body.waiting.map((c) => c.feature.slug)).toEqual(["shipped"]);
      expect(body.waiting[0]?.feature.tickets.map((t) => t.status)).toEqual(["done", "done", "pending"]);
      // 자리 행 자체가 사라졌다 — 대기는 저장되는 값이 아니다(INV-B1).
      expect(readPlacements(ctx.dataDir, "beta")).toEqual([]);
    }));

  test("🔴 캡틴이 손으로 완료에 내려둔 카드도 안 읽은 티켓이 붙으면 대기로 올라온다 — 10 의 반대, 캡틴 결정(plan-board/11)", () =>
    withProject({ shipped: ALL_DONE }, async (ctx) => {
      await get(ctx); // 있던 티켓을 읽음으로 깐다.
      // 캡틴이 손으로 옮긴다 — 완료가 아닌 자리를 거쳐야 closed_at 이 찍힌다(closedAtFor).
      await post(ctx, { features: ["shipped"], area: "reserved", index: 0 });
      await post(ctx, { features: ["shipped"], area: "done", index: 0 });
      // 규율을 어겨 안 읽은 티켓 한 장이 더 붙었다 — 손으로 닫았어도 이제는 대기로 올라온다.
      writeFileSync(
        join(ctx.projectRoot, "docs", "features", "shipped", "issues", "03-late.md"),
        ticket("03", "ready-for-agent"),
      );
      // 🔴 문서를 직접 고쳤다 = T05 감시 신호가 날려 스냅샷을 갱신한다. 테스트는 감시기를 안 돌리니
      // 그 갱신을 여기서 흉내낸다(T07 — plan 보드는 스냅샷에서 서빙하므로).
      updateProjectSnapshot(ctx.dataDir, "beta", [ctx.projectRoot]);
      const body = await get(ctx, "2026-08-13 09:00");
      expect(body.done).toEqual([]);
      expect(body.waiting.map((c) => c.feature.slug)).toEqual(["shipped"]);
    }));

  test("🔴 다 읽은 카드는 안 끝난 티켓을 안고 있어도 그 자리에 그대로다 — 예약·폐기 칸이 비워지지 않는다(plan-board/11)", () =>
    withProject({ half: HALF }, async (ctx) => {
      // 캡틴이 옮긴다 — 이 read 가 지금 있는 티켓(하나는 done, 하나는 미완)을 읽음으로 깐다.
      await post(ctx, { features: ["half"], area: "reserved", index: 0 });
      const body = await get(ctx);
      expect(body.reserved.map((c) => c.feature.slug)).toEqual(["half"]);
      expect(body.waiting).toEqual([]);
    }));

  test("🔴 폐기 티켓만 새로 붙으면 완료 칸에 그대로 머문다 — 폐기는 할 일이 아니다", () =>
    withProject({ shipped: ALL_DONE }, async (ctx) => {
      await get(ctx);
      writeFileSync(
        join(ctx.projectRoot, "docs", "features", "shipped", "issues", "03-late.md"),
        ticket("03", "wontfix"),
      );
      const body = await get(ctx, "2026-08-13 09:00");
      expect(body.done.map((c) => c.feature.slug)).toEqual(["shipped"]);
      expect(body.waiting).toEqual([]);
    }));
});

// ── 설정 (tauri-desktop-app T02·T03, one-setting-finds-every-copy T05 로 한 칸화) ──────
// 설정 저장소도 주입한다 — 이 기계의 실제 `~/.gootte` 를 읽거나 쓰면 테스트가 기계에 종속되고
// 캡틴의 실제 설정을 오염시킨다(2026-08-14 사고와 같은 그릇).
describe("설정 GET/PUT /api/settings", () => {
  const withSettingsDataDir = async (run: (dataDir: string) => Promise<void>) => {
    const dataDir = mkdtempSync(join(tmpdir(), "gootte-app-settings-"));
    try {
      await run(dataDir);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  };

  test("미설정이면 null + 존재 false — 소비처는 기본값으로 떨어진다", async () =>
    withSettingsDataDir(async (dataDir) => {
      const app = createApp({
        roots,
        treehouse: NO_TREEHOUSE,
        dataDir,
        firstmateHomeSuggestionCandidates: [],
      });
      const res = await app.request("/api/settings");
      expect(res.status).toBe(200);
      expect(SettingsResponse.parse(await res.json())).toEqual({
        firstmateHome: null,
        firstmateHomeExists: false,
        firstmateHomeSuggestion: null,
        watchRoots: [],
        blockedCopies: [],
        effectiveWatchRoots: roots,
      });
    }));

  test("저장하면 정규화되어 실리고, 존재 여부는 응답 때 다시 본다(INV-3)", async () =>
    withSettingsDataDir(async (dataDir) => {
      const app = createApp({
        roots,
        treehouse: NO_TREEHOUSE,
        dataDir,
        firstmateHomeSuggestionCandidates: [],
      });
      const res = await app.request("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ firstmateHome: FIXTURES }),
      });
      expect(res.status).toBe(200);
      // FIXTURES 는 절대 경로라 정규화해도 자기 자신 — 존재 true.
      expect(SettingsResponse.parse(await res.json())).toEqual({
        firstmateHome: FIXTURES,
        firstmateHomeExists: true,
        firstmateHomeSuggestion: null,
        watchRoots: [],
        blockedCopies: [],
        effectiveWatchRoots: deriveWatchRoots(FIXTURES),
      });
    }));

  test("firstmateHomeSuggestion — 후보가 실제로 있으면 응답에 싣고, 없으면 null(placeholder 생략)", async () =>
    withSettingsDataDir(async (dataDir) => {
      const candidateDir = mkdtempSync(join(tmpdir(), "gootte-app-fm-home-candidate-"));
      try {
        const appWithCandidate = createApp({
          roots,
          treehouse: NO_TREEHOUSE,
          dataDir,
          firstmateHomeSuggestionCandidates: [candidateDir],
        });
        const withBody = SettingsResponse.parse(
          await (await appWithCandidate.request("/api/settings")).json(),
        );
        expect(withBody.firstmateHomeSuggestion).toBe(candidateDir);

        const appNoCandidate = createApp({
          roots,
          treehouse: NO_TREEHOUSE,
          dataDir,
          firstmateHomeSuggestionCandidates: [join(candidateDir, "없음")],
        });
        const withoutBody = SettingsResponse.parse(
          await (await appNoCandidate.request("/api/settings")).json(),
        );
        expect(withoutBody.firstmateHomeSuggestion).toBeNull();
      } finally {
        rmSync(candidateDir, { recursive: true, force: true });
      }
    }));

  test("~ 로 입력한 경로는 홈으로 전개되어 저장된다", async () =>
    withSettingsDataDir(async (dataDir) => {
      const app = createApp({ roots, treehouse: NO_TREEHOUSE, dataDir });
      const body = SettingsResponse.parse(
        await (
          await app.request("/api/settings", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ firstmateHome: "~/firstmate2" }),
          })
        ).json(),
      );
      expect(body.firstmateHome).toBe(join(homedir(), "firstmate2"));
    }));

  test("상대 경로는 400 으로 거절한다 — 조용히 CWD 에 붙이지 않는다", async () =>
    withSettingsDataDir(async (dataDir) => {
      const app = createApp({ roots, treehouse: NO_TREEHOUSE, dataDir });
      const res = await app.request("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ firstmateHome: "relative/path" }),
      });
      expect(res.status).toBe(400);
      expect(ApiError.parse(await res.json()).error).toContain("절대 경로");
    }));

  test("저장한 값은 재시작(새 앱 인스턴스) 후에도 산다 — 같은 저장소를 다시 읽으면 같은 값", async () =>
    withSettingsDataDir(async (dataDir) => {
      const opts = { roots, treehouse: NO_TREEHOUSE, dataDir };
      await createApp(opts).request("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ firstmateHome: FIXTURES }),
      });
      const body = SettingsResponse.parse(
        await (await createApp(opts).request("/api/settings")).json(),
      );
      expect(body.firstmateHome).toBe(FIXTURES);
    }));

  // T05 — firstmate 홈을 바꾸면 다음 요청부터 그 홈의 `<홈>/projects` 에서 프로젝트가 발견된다.
  test("firstmate 홈을 바꾸면 다음 요청부터 <홈>/projects 의 프로젝트가 발견된다 — 재시작 없이", async () =>
    withSettingsDataDir(async (dataDir) => {
      // 기본 루트(FIXTURES=alpha) 말고 새 임시 홈의 projects/ 아래에 프로젝트 하나를 심는다.
      const newHome = mkdtempSync(join(tmpdir(), "gootte-app-fmhome-root-"));
      mkdirSync(join(newHome, "projects", "beta", "docs", "features"), { recursive: true });
      writeFileSync(join(newHome, "projects", "beta", "AGENTS.md"), "# beta");
      try {
        const app = createApp({ roots, treehouse: NO_TREEHOUSE, dataDir });
        const slugsOf = async () =>
          ProjectsResponse.parse(await (await app.request("/api/projects")).json()).projects.map(
            (p) => p.slug,
          );
        expect((await slugsOf())).toContain("alpha");
        await app.request("/api/settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ firstmateHome: newHome }),
        });
        clearDiscoverCache();
        const slugs = await slugsOf();
        expect(slugs).toContain("beta");
        expect(slugs).not.toContain("alpha");
      } finally {
        rmSync(newHome, { recursive: true, force: true });
      }
    }));

  test("null 로 지우면 기본 루트로 되돌아온다", async () =>
    withSettingsDataDir(async (dataDir) => {
      const app = createApp({ roots, treehouse: NO_TREEHOUSE, dataDir });
      const otherHome = mkdtempSync(join(tmpdir(), "gootte-app-clear-"));
      try {
        await app.request("/api/settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ firstmateHome: otherHome }),
        });
        clearDiscoverCache();
        expect(
          ProjectsResponse.parse(await (await app.request("/api/projects")).json()).projects.map(
            (p) => p.slug,
          ),
        ).not.toContain("alpha");
        await app.request("/api/settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ firstmateHome: null }),
        });
        clearDiscoverCache();
        expect(
          ProjectsResponse.parse(await (await app.request("/api/projects")).json()).projects.map(
            (p) => p.slug,
          ),
        ).toContain("alpha");
      } finally {
        rmSync(otherHome, { recursive: true, force: true });
      }
    }));

  // T05 수용 기준 6 — 저장 파일에 남은 옛 watchRoot 값이 있어도 무시되고 오류가 없다.
  test("저장 파일에 남은 옛 watchRoot 값은 무시된다 — GET 이 오류 없이 firstmateHome 만 답한다", async () =>
    withSettingsDataDir(async (dataDir) => {
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(
        join(dataDir, "settings.json"),
        `${JSON.stringify({ watchRoot: "/옛/감시루트", firstmateHome: FIXTURES }, null, 2)}\n`,
      );
      const app = createApp({
        roots,
        treehouse: NO_TREEHOUSE,
        dataDir,
        firstmateHomeSuggestionCandidates: [],
      });
      const res = await app.request("/api/settings");
      expect(res.status).toBe(200);
      expect(SettingsResponse.parse(await res.json())).toEqual({
        firstmateHome: FIXTURES,
        firstmateHomeExists: true,
        firstmateHomeSuggestion: null,
        watchRoots: [],
        blockedCopies: [],
        effectiveWatchRoots: deriveWatchRoots(FIXTURES),
      });
    }));
});

// review F3, T05 로 확장 — PUT 이 firstmate 홈을 바꾸면 감시기 재바인딩 통보가 간다
// (값은 저장 뒤 다시 읽은 것). 하나의 통보가 문서 감시기와 백로그 감시기 둘 다를 재묶는 배선은
// server.ts 몫이라 여기서는 통보 자체가 나가는지만 본다.
describe("설정 PUT → onFirstmateHomeChange", () => {
  test("firstmateHome 교체와 지움(null) 모두 새 값을 통보한다, 값이 그대로면 부르지 않는다", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "gootte-app-rebind-"));
    try {
      const seen: (string | null)[] = [];
      const app = createApp({
        roots,
        treehouse: NO_TREEHOUSE,
        dataDir,
        onFirstmateHomeChange: (h) => seen.push(h),
      });
      const put = (body: object) =>
        app.request("/api/settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      await put({}); // 키 없음 → 통보 없음
      await put({ firstmateHome: FIXTURES }); // 교체
      await put({ firstmateHome: null }); // 지움
      expect(seen).toEqual([FIXTURES, null]);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
