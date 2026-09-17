import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { upsertTicketRecord } from "@gootte/core-io";
import { createApp } from "../src/app";
import { clearDiscoverCache } from "../src/discover-cache";
import { clearSnapshot } from "../src/snapshot";

/**
 * 시간 기록 **쓰기** 경로의 모드 이분법(D2) — 읽기는 time-records-join.test.ts 가 지킨다.
 *
 * 🔴 실제 결함(2026-09-17): 데스크톱 앱이 띄운 백엔드는 GUI PATH(`/usr/bin:/bin:…`)를 물려받는데,
 * `bin/gootte` 의 레코드 모드 위임이 `command -v npx` 에 걸려 있어 PATH 에 npx 가 없으면 **조용히
 * MD 경로로 떨어진다**. 레코드 모드 프로젝트의 MD 에는 Time: 줄이 없으므로(SoT 는 state.json)
 * 종료 버튼이 "시작되지 않은 티켓입니다(Time: 줄이 없음)" 로 죽었다.
 * 그래서 이 테스트는 PATH 를 앱과 같은 값으로 좁혀서 돈다 — 그게 결함의 조건이다.
 */

const FIXTURES = join(import.meta.dirname, "fixtures", "roots");
const NO_TREEHOUSE = join(FIXTURES, "..", "no-treehouse");
const GUI_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
const TICKET = "T02";

let root: string;
let dataDir: string;
let savedPath: string | undefined;

beforeEach(() => {
  clearDiscoverCache();
  clearSnapshot();
  savedPath = process.env.PATH;
  process.env.PATH = GUI_PATH;
});
afterEach(() => {
  if (savedPath === undefined) delete process.env.PATH;
  else process.env.PATH = savedPath;
  if (root) rmSync(root, { recursive: true, force: true });
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  root = "";
  dataDir = "";
});

const projectDir = () => join(root, "alpha");
const ticketFile = () => join(projectDir(), "docs", "features", "auth-login", "tickets", `${TICKET}.md`);
const stateFile = () => join(projectDir(), ".gootte", "state.json");

function setup(mode: "records" | "md", record?: { startedAt?: string | null; finishedAt?: string | null }): void {
  root = mkdtempSync(join(tmpdir(), "gootte-tw-"));
  cpSync(FIXTURES, root, { recursive: true });
  dataDir = mkdtempSync(join(tmpdir(), "gootte-tw-data-"));
  // 픽스처의 v1 파일은 배지 전용이라 모드를 켜지 않는다 — 지우고 필요한 모드만 세운다.
  rmSync(join(projectDir(), ".gootte"), { recursive: true, force: true });
  mkdirSync(join(projectDir(), "docs", "features", "auth-login", "tickets"), { recursive: true });
  writeFileSync(ticketFile(), `# ${TICKET} — 화면\n\n## Goal\n\n로그인 화면.\n`);
  if (mode === "records") {
    // 레코드가 권위인 프로젝트. MD 에는 Time: 줄이 없다 — 새 gootte 는 문서에 안 쓴다.
    upsertTicketRecord(projectDir(), `auth-login/${TICKET}`, record ?? { startedAt: null, finishedAt: null });
  }
}

const postTime = async (action: string) => {
  const app = createApp({ roots: [root], treehouse: NO_TREEHOUSE, dataDir });
  const res = await app.request("/api/projects/alpha/time", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ feature: "auth-login", ticket: TICKET, action }),
  });
  return { status: res.status, body: (await res.json()) as { ok?: boolean; error?: string } };
};

describe("쓰기 경로 — 모드가 프로세스 경계를 정한다", () => {
  test("레코드 모드 + 앱 PATH(npx 없음): end 가 레코드에 완료를 쓴다", async () => {
    setup("records", { startedAt: "2026-09-17T07:00:00+09:00", finishedAt: null });
    const { status, body } = await postTime("end");
    expect(body.error ?? "").not.toContain("Time: 줄이 없음");
    expect(status).toBe(200);
    const rec = JSON.parse(readFileSync(stateFile(), "utf8"));
    expect(rec.tickets[`auth-login/${TICKET}`].finishedAt).toBeTruthy();
  });

  test("레코드 모드: start 는 문서에 Time: 줄을 만들지 않는다 — 레코드가 SoT 다", async () => {
    setup("records");
    const before = readFileSync(ticketFile(), "utf8");
    const { status } = await postTime("start");
    expect(status).toBe(200);
    expect(readFileSync(ticketFile(), "utf8")).toBe(before);
    expect(before).not.toContain("Time:");
    const rec = JSON.parse(readFileSync(stateFile(), "utf8"));
    expect(rec.tickets[`auth-login/${TICKET}`].startedAt).toBeTruthy();
  });

  test("MD 모드: start 는 여전히 문서에 Time: 줄을 쓴다 — 옛 프로젝트를 깨지 않는다", async () => {
    setup("md");
    const before = readFileSync(ticketFile(), "utf8");
    const { status, body } = await postTime("start");
    expect(body.error ?? "").toBe("");
    expect(status).toBe(200);
    expect(readFileSync(ticketFile(), "utf8")).toContain("Time:");
    expect(before).not.toContain("Time:");
    // MD 모드 프로젝트를 클릭 한 번으로 v2 로 승격시키지 않는다 — 전환은 migrate-time 의 몫이다(D2).
    expect(existsSync(stateFile())).toBe(false);
  });
});
