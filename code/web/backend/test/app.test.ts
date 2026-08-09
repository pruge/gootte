import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import {
  ProjectsResponse,
  PlanResponse,
  RoadmapResponse,
  FeaturesResponse,
  LineageResponse,
  TimelineResponse,
  WorktreeResponse,
  DocResponse,
  TreeResponse,
  ApiError,
  type Project,
} from "@gootte/contract";
import { createApp } from "../src/app";
import {
  clearDiscoverCache,
  getProjects,
  pickBySlug,
  DISCOVER_TTL_MS,
} from "../src/discover-cache";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "roots");
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
    // worktrees 수 enrich — worktree 없는 fixture = 0
    const alpha = body.projects.find((p) => p.slug === "alpha");
    expect(alpha?.worktrees).toBe(0);
  });
});

describe("GET /api/plan/:slug", () => {
  test("PlanResponse envelope 반환 (project 이름 정확)", async () => {
    const app = createApp(APP);
    const res = await app.request("/api/plan/alpha");
    expect(res.status).toBe(200);
    const body = PlanResponse.parse(await res.json());
    expect(body.project).toBe("alpha");
    expect(Array.isArray(body.plan)).toBe(true);
    expect(Array.isArray(body.rationale)).toBe(true);
    expect(Array.isArray(body.trackOrder)).toBe(true); // 대분류 그룹 순서(019)
  });

  test("미해소 slug → 404 ApiError", async () => {
    const app = createApp(APP);
    const res = await app.request("/api/plan/does-not-exist");
    expect(res.status).toBe(404);
    const body = ApiError.parse(await res.json());
    expect(body.error).toContain("does-not-exist");
  });
});

describe("GET /api/roadmap/:slug", () => {
  test("RoadmapResponse envelope 반환 (items·trackOrder)", async () => {
    const app = createApp(APP);
    const res = await app.request("/api/roadmap/alpha");
    expect(res.status).toBe(200);
    const body = RoadmapResponse.parse(await res.json());
    expect(body.project).toBe("alpha");
    expect(Array.isArray(body.items)).toBe(true);
    expect(Array.isArray(body.trackOrder)).toBe(true);
    // 각 항목 = done/pending 배열(할일 체크리스트 재구성)
    for (const it of body.items) {
      expect(Array.isArray(it.done)).toBe(true);
      expect(Array.isArray(it.pending)).toBe(true);
    }
  });

  test("미해소 slug → 404 ApiError", async () => {
    const app = createApp(APP);
    const res = await app.request("/api/roadmap/does-not-exist");
    expect(res.status).toBe(404);
    expect(ApiError.parse(await res.json()).error).toContain("does-not-exist");
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
});

describe("GET /api/doc/:slug/:kind/:name", () => {
  test("todo 문서 raw md 반환(DocResponse)", async () => {
    const app = createApp(APP);
    const res = await app.request("/api/doc/alpha/todo/001-old-thing");
    expect(res.status).toBe(200);
    const body = DocResponse.parse(await res.json());
    expect(body.project).toBe("alpha");
    expect(body.kind).toBe("todo");
    expect(body.name).toBe("001-old-thing");
    expect(body.content.length).toBeGreaterThan(0); // verbatim md
  });

  test("없는 문서 → 404 ApiError", async () => {
    const app = createApp(APP);
    const res = await app.request("/api/doc/alpha/todo/nope-nope");
    expect(res.status).toBe(404);
    expect(ApiError.parse(await res.json()).error).toContain("nope-nope");
  });

  test("경로 traversal 시도 → 400/404 (파일 유출 없음)", async () => {
    const app = createApp(APP);
    const res = await app.request("/api/doc/alpha/todo/..%2F..%2F..%2Fprofile");
    expect(res.status).not.toBe(200);
  });
});

describe("GET /api/lineage/:slug", () => {
  test("LineageResponse — edges(kind 해소) + drops verbatim", async () => {
    const app = createApp(APP);
    const res = await app.request("/api/lineage/alpha");
    expect(res.status).toBe(200);
    const body = LineageResponse.parse(await res.json());
    expect(body.project).toBe("alpha");
    // INDEX supersession "부분 유지" → CORE 가 partial 로 해소(INV-4)
    expect(body.edges.some((e) => e.kind === "supersede-partial")).toBe(true);
    // dropped todo → drop (resolvedBy verbatim, 요약 X)
    expect(body.drops).toHaveLength(1);
    expect(body.drops[0]?.resolvedBy).toContain("흡수");
    // nodes 추가(그래프용, 013) — 배열 존재
    expect(Array.isArray(body.nodes)).toBe(true);
  });
});

describe("2c viz endpoints (013)", () => {
  test("GET /api/timeline — TimelineResponse envelope(rows·bounds)", async () => {
    const app = createApp(APP);
    const res = await app.request("/api/timeline/alpha");
    expect(res.status).toBe(200);
    const body = TimelineResponse.parse(await res.json());
    expect(body.project).toBe("alpha");
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body).toHaveProperty("from");
    expect(body).toHaveProperty("to");
    expect(Array.isArray(body.trackOrder)).toBe(true); // 대분류 그룹 순서(019)
  });

  test("GET /api/worktree — WorktreeResponse envelope", async () => {
    const app = createApp(APP);
    const res = await app.request("/api/worktree/alpha");
    expect(res.status).toBe(200);
    const body = WorktreeResponse.parse(await res.json());
    expect(body.project).toBe("alpha");
    expect(Array.isArray(body.worktrees)).toBe(true);
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

// 문서 브라우저(2e) — fixture alpha 에 docbrowser-fix 이니셔티브 폴더(state 무영향).
describe("GET /api/tree/:slug/:initiative", () => {
  test("TreeResponse — 실제 파일 + adr/ + 가상 todo/", async () => {
    const app = createApp(APP);
    const res = await app.request("/api/tree/alpha/docbrowser-fix");
    expect(res.status).toBe(200);
    const body = TreeResponse.parse(await res.json());
    const paths = body.nodes.map((n) => n.path);
    expect(paths).toContain("spec.md");
    expect(paths).toContain("adr");
    expect(paths).toContain("adr/0001-x.md");
    expect(paths).toContain("todo"); // 가상 폴더 항상
    const spec = body.nodes.find((n) => n.path === "spec.md");
    expect(spec?.read).toEqual({ source: "roadmap", initiative: "docbrowser-fix", relPath: "spec.md" });
  });

  test("미존재 이니셔티브 = 404", async () => {
    const app = createApp(APP);
    const res = await app.request("/api/tree/alpha/nonexistent-xyz");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/doc/:slug/roadmap/:initiative (roadmap 소스)", () => {
  test("roadmap 파일 content 반환 (라우팅 = generic doc 아님)", async () => {
    const app = createApp(APP);
    const res = await app.request("/api/roadmap-doc/alpha/docbrowser-fix?path=spec.md");
    expect(res.status).toBe(200); // 400 이면 generic /:kind/:name 이 가로챈 것
    const body = DocResponse.parse(await res.json());
    expect(body.kind).toBe("roadmap");
    expect(body.content).toBe("# spec\n");
    // 서브폴더
    const adr = await (await app.request("/api/roadmap-doc/alpha/docbrowser-fix?path=adr/0001-x.md")).json();
    expect(DocResponse.parse(adr).content).toBe("# ADR-0001\n");
  });

  test("🔴 traversal (`..`) = 404 (폴더 밖 read 차단)", async () => {
    const app = createApp(APP);
    const res = await app.request("/api/roadmap-doc/alpha/docbrowser-fix?path=../../../../INDEX.md");
    expect(res.status).toBe(404);
  });

  test("기존 todo/sprint doc 무회귀", async () => {
    const app = createApp(APP);
    const res = await app.request("/api/doc/alpha/todo/001-x");
    // alpha todo fixture 유무와 무관하게 라우팅은 generic 으로 (200 또는 404, 400 아님)
    expect([200, 404]).toContain(res.status);
  });
});
