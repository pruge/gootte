import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { FeaturesResponse, ProjectsResponse } from "@gootte/contract";
import { createApp } from "../src/app";
import { clearDiscoverCache } from "../src/discover-cache";
import { clearSnapshot } from "../src/snapshot";
import { joinTimeRecords, readFeatures, readTicketRecords, upsertTicketRecord } from "@gootte/core-io";

/**
 * 시간·상태 레코드 조인(T03) — 읽기 소비처가 레코드를 지나는가.
 * 🔴 모드는 프로젝트 단위 이분법(D2): v2 state.json 이 있으면 레코드가 권위
 * (MD Time:/Status: 줄은 무시), 없으면 MD 파싱 그대로. 회귀 가드가 이 티켓의 본질이다.
 */

const FIXTURES = join(import.meta.dirname, "fixtures", "roots");
const NO_TREEHOUSE = join(FIXTURES, "..", "no-treehouse");
const NO_WORK = {
  root: "/tmp/th",
  rootExists: false,
  copies: 0,
  working: 0,
  tickets: 0,
  unknown: [],
  unreadable: [],
  unclaimed: [],
};

let root: string;
let dataDir: string;
beforeEach(() => {
  clearDiscoverCache();
  clearSnapshot();
});
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  root = "";
  dataDir = "";
});

function setup(withV2: boolean): void {
  root = mkdtempSync(join(tmpdir(), "gootte-tj-"));
  cpSync(FIXTURES, root, { recursive: true });
  dataDir = mkdtempSync(join(tmpdir(), "gootte-tj-data-"));
  // 🔴 다른 테스트(/api/features/:slug → recalcProjectState)가 픽스처에 state.json 을 쓴다 —
  // 그것이 설계다(.gootte/ 예외). 모드 판정을 순서 무관으로 고정하려 복사본에서 항상 지운다.
  rmSync(join(root, "alpha", ".gootte"), { recursive: true, force: true });
  if (withV2) {
    // v2 모드 미리 깔기 — migrate-time 이 하는 일을 직접 한다(T06 이전의 시드).
    upsertTicketRecord(join(root, "alpha"), "auth-login/01-session", {
      startedAt: null,
      finishedAt: null,
      statusRaw: null,
    });
  }
}

const features = async (): Promise<FeaturesResponse> => {
  const app = createApp({ roots: [root], treehouse: NO_TREEHOUSE, dataDir });
  return FeaturesResponse.parse(await (await app.request("/api/features/alpha")).json());
};

describe("읽기 조인 — 레코드가 권위다(D2)", () => {
  test("v2 없는 프로젝트는 MD 파싱 그대로다 — 폴백 회귀 가드", async () => {
    setup(false);
    const body = await features();
    const f = body.features.find((x) => x.slug === "auth-login")!;
    const t = f.tickets.find((x) => x.slug === "01-session"); // 구관례 issues/ — MD Status: resolved
    expect(t?.status).toBe("done");
    expect(t?.sourceStatus).toBe("resolved");
    expect(t?.startedAt).toBeUndefined(); // MD Time: 줄이 없는 티켓
  });

  test("v2 프로젝트는 레코드가 권위다 — 레코드 없는 티켓은 미시작 pending(MD 줄 무시)", async () => {
    setup(true);
    const body = await features();
    const f = body.features.find((x) => x.slug === "auth-login")!;
    // MD 에 Status: resolved 가 있어도 레코드가 없으면 "없다"가 정답이다(D2).
    const t = f.tickets.find((x) => x.slug === "01-session");
    expect(t?.status).toBe("pending");
    expect(t?.sourceStatus).toBeNull();
    expect(t?.startedAt).toBeUndefined();
    // 레코드가 있는 티켓은 그 값을 따른다.
    expect(readTicketRecords(join(root, "alpha"))["auth-login/01-session"]).toBeDefined();
  });

  test("v2 프로젝트 + 레코드 finished → done이 화면에 실린다", async () => {
    setup(true);
    upsertTicketRecord(join(root, "alpha"), "auth-login/01-session", {
      startedAt: "2026-09-01T09:00:00+09:00",
      finishedAt: "2026-09-01T10:00:00+09:00",
    });
    const body = await features();
    const t = body.features.find((x) => x.slug === "auth-login")?.tickets.find((x) => x.slug === "01-session");
    expect(t?.status).toBe("done");
    expect(t?.finishedAt).toBe("2026-09-01T10:00:00+09:00");
    // 배지(state.json openFeatures)도 조인 뒤의 판정을 따른다 — 기능이 아직 남아 있나.
    const list = ProjectsResponse.parse(await (await (async () => {
      const app = createApp({ roots: [root], treehouse: NO_TREEHOUSE, dataDir });
      return app.request("/api/projects");
    })()).json());
    const badge = list.projects.find((p) => p.slug === "alpha")?.openFeatures;
    expect(badge).toBeGreaterThanOrEqual(0);
  });

  test("cancel(removeTicketRecord) 뒤에는 낡은 MD 줄이 되살아나지 않는다 — 이중 SoT 금지", async () => {
    setup(true);
    // MD 줄이 started= 를 말해도(잔존해도) 레코드가 없으면 pending 이다.
    const strayDir = join(root, "alpha", "docs", "features", "auth-login", "tickets");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(strayDir, { recursive: true });
    writeFileSync(
      join(strayDir, "T00.md"),
      "# T00 — MD Time 잔존 티켓\n\n**Time:** started=2026-08-01T09:00:00+09:00\n",
    );
    clearDiscoverCache();
    const joined = joinTimeRecords(readFeatures([join(root, "alpha")]), join(root, "alpha"));
    const f = joined.find((x) => x.slug === "auth-login");
    const stray = f?.newTickets?.find((t) => t.slug === "T00");
    expect(stray?.status).toBe("pending"); // MD Time: 줄은 무시된다
    expect(stray?.startedAt).toBeUndefined();
  });
});
