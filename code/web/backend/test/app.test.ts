import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { beforeEach, describe, expect, test } from "vitest";
import {
  ProjectsResponse,
  FeaturesResponse,
  FeatureDocResponse,
  PlanBoardResponse,
  ApiError,
  type Project,
} from "@gootte/contract";
import { migratePlanDb, readPlacements, readSteps } from "@gootte/core-io";
import { createApp } from "../src/app";
import {
  clearDiscoverCache,
  getProjects,
  pickBySlug,
  DISCOVER_TTL_MS,
} from "../src/discover-cache";

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
const APP = { roots, treehouse: NO_TREEHOUSE };

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

  test("작업중 사본이 있으면 처리중이 실리고, 못 이은 작업은 unknown 으로 실린다", async () => {
    const th = makeTreehouse();
    try {
      const body = FeaturesResponse.parse(
        await (await createApp({ roots, treehouse: th }).request("/api/features/alpha")).json(),
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
  });

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

    test("🔴 작업 대상으로 올라온 기능의 티켓 전부가 9999 단계로 붙는다", () =>
      withDataDir(async (dataDir) => {
        await post(dataDir, { features: ["auth-login"], area: "active", index: 0 });
        expect(readSteps(dataDir, "alpha")).toEqual([
          { feature: "auth-login", ticket: "01-session", step: 9999 },
          { feature: "auth-login", ticket: "02-screen", step: 9999 },
          { feature: "auth-login", ticket: "03-social", step: 9999 },
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

describe("slug 충돌 (W1)", () => {
  test("같은 slug ≥2 → first-match + ambiguous", () => {
    const projects: Project[] = [
      { slug: "dup", path: "/home/a/dup" },
      { slug: "dup", path: "/work/b/dup" },
      { slug: "solo", path: "/x/solo" },
    ];
    const dup = pickBySlug(projects, "dup");
    expect(dup.ambiguous).toBe(true);
    expect(dup.project?.path).toBe("/home/a/dup"); // first-match

    const solo = pickBySlug(projects, "solo");
    expect(solo.ambiguous).toBe(false);
    expect(solo.project?.path).toBe("/x/solo");

    expect(pickBySlug(projects, "none").project).toBeNull();
  });
});
