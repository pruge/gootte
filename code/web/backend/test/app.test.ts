import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import {
  ProjectsResponse,
  PlanResponse,
  LineageResponse,
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
  });

  test("미해소 slug → 404 ApiError", async () => {
    const app = createApp({ roots });
    const res = await app.request("/api/plan/does-not-exist");
    expect(res.status).toBe(404);
    const body = ApiError.parse(await res.json());
    expect(body.error).toContain("does-not-exist");
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
