import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import {
  ProjectsResponse,
  PlanResponse,
  RoadmapResponse,
  LineageResponse,
  StructureResponse,
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

beforeEach(() => clearDiscoverCache());

describe("GET /api/projects", () => {
  test("ProjectsResponse envelope 반환 + alpha 발견", async () => {
    const app = createApp({ roots });
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
    const app = createApp({ roots });
    const res = await app.request("/api/plan/alpha");
    expect(res.status).toBe(200);
    const body = PlanResponse.parse(await res.json());
    expect(body.project).toBe("alpha");
    expect(Array.isArray(body.plan)).toBe(true);
    expect(Array.isArray(body.rationale)).toBe(true);
    expect(Array.isArray(body.trackOrder)).toBe(true); // 대분류 그룹 순서(019)
  });

  test("미해소 slug → 404 ApiError", async () => {
    const app = createApp({ roots });
    const res = await app.request("/api/plan/does-not-exist");
    expect(res.status).toBe(404);
    const body = ApiError.parse(await res.json());
    expect(body.error).toContain("does-not-exist");
  });
});

describe("GET /api/roadmap/:slug", () => {
  test("RoadmapResponse envelope 반환 (items·trackOrder)", async () => {
    const app = createApp({ roots });
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
    const app = createApp({ roots });
    const res = await app.request("/api/roadmap/does-not-exist");
    expect(res.status).toBe(404);
    expect(ApiError.parse(await res.json()).error).toContain("does-not-exist");
  });
});

describe("GET /api/doc/:slug/:kind/:name", () => {
  test("todo 문서 raw md 반환(DocResponse)", async () => {
    const app = createApp({ roots });
    const res = await app.request("/api/doc/alpha/todo/001-old-thing");
    expect(res.status).toBe(200);
    const body = DocResponse.parse(await res.json());
    expect(body.project).toBe("alpha");
    expect(body.kind).toBe("todo");
    expect(body.name).toBe("001-old-thing");
    expect(body.content.length).toBeGreaterThan(0); // verbatim md
  });

  test("없는 문서 → 404 ApiError", async () => {
    const app = createApp({ roots });
    const res = await app.request("/api/doc/alpha/todo/nope-nope");
    expect(res.status).toBe(404);
    expect(ApiError.parse(await res.json()).error).toContain("nope-nope");
  });

  test("경로 traversal 시도 → 400/404 (파일 유출 없음)", async () => {
    const app = createApp({ roots });
    const res = await app.request("/api/doc/alpha/todo/..%2F..%2F..%2Fprofile");
    expect(res.status).not.toBe(200);
  });
});

describe("GET /api/lineage/:slug", () => {
  test("LineageResponse — edges(kind 해소) + drops verbatim", async () => {
    const app = createApp({ roots });
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
  test("GET /api/structure — StructureResponse (저작 docs/mermaid 렌더)", async () => {
    const app = createApp({ roots });
    const res = await app.request("/api/structure/alpha");
    expect(res.status).toBe(200);
    const body = StructureResponse.parse(await res.json()); // zod 검증
    expect(body.project).toBe("alpha");
    // 이니셔티브 track 없음 → 전부 시스템/공통(null) 그룹, M-ID asc, 코드없는 M-0003 제외.
    expect(body.groups.map((g) => g.track)).toEqual([null]);
    expect(body.groups[0]?.diagrams.map((d) => d.id)).toEqual(["M-0001", "M-0002"]);
    expect(body.groups[0]?.diagrams.find((d) => d.id === "M-0002")?.status).toBe("superseded");
    expect(body.groups[0]?.diagrams[0]?.code).toContain("flowchart");
  });

  test("GET /api/timeline — TimelineResponse envelope(rows·bounds)", async () => {
    const app = createApp({ roots });
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
    const app = createApp({ roots });
    const res = await app.request("/api/worktree/alpha");
    expect(res.status).toBe(200);
    const body = WorktreeResponse.parse(await res.json());
    expect(body.project).toBe("alpha");
    expect(Array.isArray(body.worktrees)).toBe(true);
  });

  test("미해소 slug → 404 ApiError (structure)", async () => {
    const app = createApp({ roots });
    const res = await app.request("/api/structure/nope-xyz");
    expect(res.status).toBe(404);
    expect(ApiError.parse(await res.json()).error).toContain("nope-xyz");
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
    const app = createApp({ roots });
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
    const app = createApp({ roots });
    const res = await app.request("/api/tree/alpha/nonexistent-xyz");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/doc/:slug/roadmap/:initiative (roadmap 소스)", () => {
  test("roadmap 파일 content 반환 (라우팅 = generic doc 아님)", async () => {
    const app = createApp({ roots });
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
    const app = createApp({ roots });
    const res = await app.request("/api/roadmap-doc/alpha/docbrowser-fix?path=../../../../INDEX.md");
    expect(res.status).toBe(404);
  });

  test("기존 todo/sprint doc 무회귀", async () => {
    const app = createApp({ roots });
    const res = await app.request("/api/doc/alpha/todo/001-x");
    // alpha todo fixture 유무와 무관하게 라우팅은 generic 으로 (200 또는 404, 400 아님)
    expect([200, 404]).toContain(res.status);
  });
});
