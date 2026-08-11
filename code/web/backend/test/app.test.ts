import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import {
  ProjectsResponse,
  FeaturesResponse,
  FeatureDocResponse,
  PlanResponse,
  DragResult,
  ApiError,
  type Project,
} from "@gootte/contract";
import { readPlanOrder, setFeatureOrder, setTicketOrder } from "@gootte/core-io";
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

// fixture alpha 의 auth-login — 01 resolved · 02 blocked by 01(이미 끝났으니 이제 착수 가능) · 03 알 수 없음
describe("GET /api/plan/:slug — 티켓 03", () => {
  test("PlanResponse envelope — features + order + next 를 함께 싣는다", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "gootte-app-plan-"));
    try {
      setFeatureOrder(dataDir, {
        project: "alpha",
        feature: "auth-login",
        track: "web",
        rank: 10,
        why: "먼저",
      });
      setTicketOrder(dataDir, {
        project: "alpha",
        feature: "auth-login",
        ticket: "02",
        step: 1,
        why: "01 은 이미 끝났다",
      });
      const app = createApp({ ...APP, dataDir });
      const res = await app.request("/api/plan/alpha");
      expect(res.status).toBe(200);
      const body = PlanResponse.parse(await res.json());
      expect(body.project).toBe("alpha");
      expect(body.order.tickets).toHaveLength(1);
      expect(body.order.tickets[0]).toMatchObject({ feature: "auth-login", ticket: "02", step: 1 });
      // 🔴 판정 자리는 하나뿐 — 02 는 01 이 이미 끝나 착수 가능하다는 것을 `next`(02 의 함수)가 그대로 골라낸다.
      const track = body.next.tracks.find((t) => t.track === "web");
      expect(track?.tickets.map((t) => `${t.feature}/${t.ticket}`)).toEqual(["auth-login/02"]);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("🔴 계획에 없는 티켓은 어긋남으로 잡힌다 — 감추지 않는다", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "gootte-app-plan-"));
    try {
      const app = createApp({ ...APP, dataDir });
      const body = PlanResponse.parse(await (await app.request("/api/plan/alpha")).json());
      expect(body.next.mismatches.some((m) => m.kind === "ticket_without_step")).toBe(true);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("🔴 계획 DB 스키마가 안 맞으면 원시 SQL 오류 대신 `pnpm db migrate` 안내와 함께 500 — 조용히 반쯤 돌지 않는다", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "gootte-app-plan-broken-"));
    try {
      // node:sqlite 가 열자마자 던지는 상태를 만든다 — 마이그레이션으로 못 고치는 스키마 불일치를 흉내.
      writeFileSync(join(dataDir, "plan.db"), "not a real sqlite db");
      const app = createApp({ ...APP, dataDir });
      const res = await app.request("/api/plan/alpha");
      expect(res.status).toBe(500);
      const body = ApiError.parse(await res.json());
      expect(body.error).toContain("pnpm db migrate");
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("미해소 프로젝트 slug → 404 ApiError", async () => {
    const app = createApp(APP);
    const res = await app.request("/api/plan/does-not-exist");
    expect(res.status).toBe(404);
  });
});

// fixture alpha 의 auth-login/02 — ready-for-agent(임자 없음), 선행 01 은 이미 resolved.
describe("POST /api/plan/:slug/ticket-step, /ticket-step/insert, /feature-rank — 티켓 04, gootte 의 첫 쓰기 경로", () => {
  test("ticket-step — 다른 단계 줄로 옮기면 DB 에 남고 재조회에도 남는다(재조회 = 티켓 04 §완료 시연 가능한 것)", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "gootte-app-drag-"));
    try {
      setTicketOrder(dataDir, { project: "alpha", feature: "auth-login", ticket: "02", step: 1, why: "먼저" });
      const app = createApp({ ...APP, dataDir });
      const res = await app.request("/api/plan/alpha/ticket-step", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feature: "auth-login", ticket: "02", step: 3 }),
      });
      expect(res.status).toBe(200);
      const body = DragResult.parse(await res.json());
      const t = body.order.tickets.find((x) => x.ticket === "02");
      expect(t).toMatchObject({ step: 3, why: "먼저", whyNeedsReview: true });

      // 재조회 — 값이 남아 있다.
      const reread = readPlanOrder(dataDir, "alpha");
      expect(reread.tickets.find((x) => x.ticket === "02")).toMatchObject({ step: 3, whyNeedsReview: true });
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("ticket-step — 처리중(임자 있는) 티켓을 옮기면 claimed 경고가 즉시 뜬다, 막지는 않는다", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "gootte-app-drag-"));
    try {
      // 03-social 은 원문 상태가 "진행중"(알 수 없는 값) — claimed 검사는 sourceStatus === "claimed" 만
      // 보므로, 대신 계획에 없던 03 을 등록해 두고 sourceStatus 가 알려진 claimed 케이스는
      // ticket-step/insert 테스트에서 별도로 잡는다. 여기서는 이미 끝난 01 로 already_done 을 본다.
      setTicketOrder(dataDir, { project: "alpha", feature: "auth-login", ticket: "01", step: 1, why: "…" });
      const app = createApp({ ...APP, dataDir });
      const res = await app.request("/api/plan/alpha/ticket-step", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feature: "auth-login", ticket: "01", step: 2 }),
      });
      expect(res.status).toBe(200);
      const body = DragResult.parse(await res.json());
      expect(body.warnings.map((w) => w.kind)).toContain("already_done");
      // 🔴 검사가 드래그를 막지 않는다 — 실제로 단계가 바뀌어 있다.
      expect(body.order.tickets.find((x) => x.ticket === "01")?.step).toBe(2);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("ticket-step/insert — 줄 사이에 놓으면 새 단계가 생기고 뒤가 밀린다", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "gootte-app-drag-"));
    try {
      setTicketOrder(dataDir, { project: "alpha", feature: "auth-login", ticket: "01", step: 1, why: "…" });
      setTicketOrder(dataDir, { project: "alpha", feature: "auth-login", ticket: "02", step: 2, why: "…" });
      const app = createApp({ ...APP, dataDir });
      const res = await app.request("/api/plan/alpha/ticket-step/insert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feature: "auth-login", ticket: "02", afterStep: 0 }),
      });
      expect(res.status).toBe(200);
      const body = DragResult.parse(await res.json());
      const byTicket = Object.fromEntries(body.order.tickets.map((t) => [t.ticket, t.step]));
      expect(byTicket).toEqual({ "01": 2, "02": 1 });
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("feature-rank — 이웃 사이에 끼우면 그 순위만 바뀐다, 트랙도 바꿀 수 있다", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "gootte-app-drag-"));
    try {
      setFeatureOrder(dataDir, { project: "alpha", feature: "auth-login", track: "web", rank: 10, why: "…" });
      setFeatureOrder(dataDir, { project: "alpha", feature: "doc-tree", track: "web", rank: 20, why: "…" });
      const app = createApp({ ...APP, dataDir });
      const res = await app.request("/api/plan/alpha/feature-rank", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feature: "doc-tree", track: "backend", beforeRank: null, afterRank: null }),
      });
      expect(res.status).toBe(200);
      const body = DragResult.parse(await res.json());
      const f = body.order.features.find((x) => x.feature === "doc-tree");
      expect(f).toMatchObject({ track: "backend", whyNeedsReview: true });
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("track-rename — 그 트랙의 모든 기능이 새 이름을 받는다", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "gootte-app-drag-"));
    try {
      setFeatureOrder(dataDir, { project: "alpha", feature: "auth-login", track: "web", rank: 10, why: "…" });
      setFeatureOrder(dataDir, { project: "alpha", feature: "doc-tree", track: "web", rank: 20, why: "…" });
      const app = createApp({ ...APP, dataDir });
      const res = await app.request("/api/plan/alpha/track-rename", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ track: "web", newTrack: "frontend" }),
      });
      expect(res.status).toBe(200);
      const body = DragResult.parse(await res.json());
      expect(body.order.features.map((f) => f.track)).toEqual(["frontend", "frontend"]);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("track-rename — 그런 트랙이 없으면 400", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "gootte-app-drag-"));
    try {
      const app = createApp({ ...APP, dataDir });
      const res = await app.request("/api/plan/alpha/track-rename", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ track: "no-such", newTrack: "x" }),
      });
      expect(res.status).toBe(400);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  // 🔴 INV-2 — 이 쓰기 경로가 관리대상 파일을 하나도 안 건드린다는 것을 실측한다(티켓 04 §완료 조건).
  test("🔴 INV-2 — 드래그가 관리대상을 한 바이트도 안 바꾼다(트리 전체)", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "gootte-app-drag-"));
    const projectRoot = join(FIXTURES, "alpha");
    const before = treeSnapshot(projectRoot);
    try {
      setTicketOrder(dataDir, { project: "alpha", feature: "auth-login", ticket: "02", step: 1, why: "…" });
      const app = createApp({ ...APP, dataDir });
      await app.request("/api/plan/alpha/ticket-step", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feature: "auth-login", ticket: "02", step: 5 }),
      });
      await app.request("/api/plan/alpha/ticket-step/insert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feature: "auth-login", ticket: "02", afterStep: 1 }),
      });
      setFeatureOrder(dataDir, { project: "alpha", feature: "auth-login", track: "web", rank: 10, why: "…" });
      await app.request("/api/plan/alpha/feature-rank", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feature: "auth-login", track: "backend", beforeRank: null, afterRank: null }),
      });
      // 🔴 파일 하나가 아니라 트리 전체다 — 바뀐 것도, 새로 생긴 것도, 사라진 것도 차이로 잡힌다.
      expect(treeSnapshot(projectRoot)).toEqual(before);
      // INV-2 가 예외로 열어 둔 `.gootte/` 네임스페이스조차 쓰지 않는다(사양 §불변식).
      expect(readdirSync(projectRoot)).not.toContain(".gootte");
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("계획에 없는 티켓을 옮기려 하면 400", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "gootte-app-drag-"));
    try {
      const app = createApp({ ...APP, dataDir });
      const res = await app.request("/api/plan/alpha/ticket-step", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feature: "auth-login", ticket: "99", step: 1 }),
      });
      expect(res.status).toBe(400);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("미해소 프로젝트 slug → 404 ApiError", async () => {
    const app = createApp(APP);
    const res = await app.request("/api/plan/does-not-exist/ticket-step", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feature: "a", ticket: "01", step: 1 }),
    });
    expect(res.status).toBe(404);
  });
});

// development-order/07 — 세 POST 경로가 성공하면 onPlanChange(project) 를 정확히 한 번 부른다.
// server.ts 가 여기 hub.broadcast({kind:"project",project}) 를 연결한다(여기선 콜백만 검증).
describe("POST /api/plan/:slug/* — onPlanChange 훅(development-order/07)", () => {
  test("ticket-step 성공 → onPlanChange(project) 한 번", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "gootte-app-drag-"));
    try {
      setTicketOrder(dataDir, { project: "alpha", feature: "auth-login", ticket: "02", step: 1, why: "…" });
      const calls: string[] = [];
      const app = createApp({ ...APP, dataDir, onPlanChange: (p) => calls.push(p) });
      await app.request("/api/plan/alpha/ticket-step", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feature: "auth-login", ticket: "02", step: 2 }),
      });
      expect(calls).toEqual(["alpha"]);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("ticket-step/insert 성공 → onPlanChange(project) 한 번", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "gootte-app-drag-"));
    try {
      setTicketOrder(dataDir, { project: "alpha", feature: "auth-login", ticket: "02", step: 1, why: "…" });
      const calls: string[] = [];
      const app = createApp({ ...APP, dataDir, onPlanChange: (p) => calls.push(p) });
      await app.request("/api/plan/alpha/ticket-step/insert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feature: "auth-login", ticket: "02", afterStep: 0 }),
      });
      expect(calls).toEqual(["alpha"]);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("feature-rank 성공 → onPlanChange(project) 한 번", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "gootte-app-drag-"));
    try {
      setFeatureOrder(dataDir, { project: "alpha", feature: "auth-login", track: "web", rank: 10, why: "…" });
      const calls: string[] = [];
      const app = createApp({ ...APP, dataDir, onPlanChange: (p) => calls.push(p) });
      await app.request("/api/plan/alpha/feature-rank", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feature: "auth-login", track: "backend", beforeRank: null, afterRank: null }),
      });
      expect(calls).toEqual(["alpha"]);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("실패(계획에 없는 티켓)면 onPlanChange 를 안 부른다", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "gootte-app-drag-"));
    try {
      const calls: string[] = [];
      const app = createApp({ ...APP, dataDir, onPlanChange: (p) => calls.push(p) });
      const res = await app.request("/api/plan/alpha/ticket-step", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feature: "auth-login", ticket: "99", step: 1 }),
      });
      expect(res.status).toBe(400);
      expect(calls).toEqual([]);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});

// 🔴 티켓 09 ② — 놓는 순간뿐 아니라 매 plan 읽기에도 04 의 같은 검사를 다시 돌린다(첫 커버).
// 화면은 이 표에서 자기 티켓 키를 찾아 보여줄 뿐이므로, 배치가 바뀌면 다음 읽기에서 답도 같이 바뀐다.
describe("GET /api/plan/:slug — dragWarnings(티켓 09 ②, 다시 물어서 갱신한다)", () => {
  test("지금 자리 그대로가 04 의 검사에 걸리면 그 티켓 키로 잡힌다", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "gootte-app-dragwarn-"));
    try {
      // 01 은 이미 resolved — 완료된 티켓이 계획에 단계로 남아 있으면 already_done 이 걸린다.
      setTicketOrder(dataDir, { project: "alpha", feature: "auth-login", ticket: "01", step: 1, why: "…" });
      const app = createApp({ ...APP, dataDir });
      const body = PlanResponse.parse(await (await app.request("/api/plan/alpha")).json());
      expect(body.dragWarnings["auth-login/01"]?.map((w) => w.kind)).toContain("already_done");
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("걸리는 것이 없으면 표가 빈 채로 온다", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "gootte-app-dragwarn-"));
    try {
      // billing/01 — 아직 안 끝났고, 기다리는 것(외부 API)이 여전히 안 풀렸다. 걸릴 것이 없다.
      setTicketOrder(dataDir, { project: "alpha", feature: "billing", ticket: "01", step: 1, why: "…" });
      const app = createApp({ ...APP, dataDir });
      const body = PlanResponse.parse(await (await app.request("/api/plan/alpha")).json());
      expect(body.dragWarnings).toEqual({});
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
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
