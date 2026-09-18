import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { upsertTicketRecord } from "@gootte/core-io";
import { createApp } from "../src/app";
import { clearDiscoverCache } from "../src/discover-cache";
import { clearSnapshot } from "../src/snapshot";

/**
 * 시간 기록 **쓰기** 경로 — 단일 모드(구관례 완전 정리).
 * POST /api/projects/:slug/time 은 항상 레코드(`state.json` v2)에 쓰고,
 * 티켓 문서를 절대 건드리지 않는다. MD 분기·bash 위임은 제거됨.
 *
 * 🔴 옛 결함(2026-09-17) 회귀 가드: 데스크톱 앱의 GUI PATH 에는 npx 가 없어
 * bash 위임이 조용히 MD 경로로 떨어졌었다. 백엔드는 이제 셸을 거치지 않으므로
 * PATH 를 앱과 같은 값으로 좁혀서 돈다 — 좁은 PATH 에서도 기록이 성공해야 한다.
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

function setup(record?: { startedAt?: string | null; finishedAt?: string | null }): void {
  root = mkdtempSync(join(tmpdir(), "gootte-tw-"));
  cpSync(FIXTURES, root, { recursive: true });
  dataDir = mkdtempSync(join(tmpdir(), "gootte-tw-data-"));
  // 픽스처의 state 파일을 지우고 필요한 레코드만 세운다 — 없으면 stateless 시작이다.
  rmSync(join(projectDir(), ".gootte"), { recursive: true, force: true });
  mkdirSync(join(projectDir(), "docs", "features", "auth-login", "tickets"), { recursive: true });
  writeFileSync(ticketFile(), `# ${TICKET} — 화면\n\n## Goal\n\n로그인 화면.\n`);
  if (record !== undefined) {
    // 레코드가 권위인 프로젝트. MD 에는 Time: 줄이 없다 — gootte 는 문서에 안 쓴다.
    upsertTicketRecord(projectDir(), `auth-login/${TICKET}`, record);
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

describe("쓰기 경로 — 항상 레코드, 문서는 손대지 않는다", () => {
  test("좁은 PATH(npx 없음): end 가 레코드에 완료를 쓴다", async () => {
    setup({ startedAt: "2026-09-17T07:00:00+09:00", finishedAt: null });
    const { status, body } = await postTime("end");
    expect(body.error ?? "").not.toContain("Time: 줄이 없음");
    expect(status).toBe(200);
    const rec = JSON.parse(readFileSync(stateFile(), "utf8"));
    expect(rec.tickets[`auth-login/${TICKET}`].finishedAt).toBeTruthy();
  });

  test("start 는 문서에 Time: 줄을 만들지 않는다 — 레코드가 SoT 다", async () => {
    setup({ startedAt: null, finishedAt: null });
    const before = readFileSync(ticketFile(), "utf8");
    const { status } = await postTime("start");
    expect(status).toBe(200);
    expect(readFileSync(ticketFile(), "utf8")).toBe(before);
    expect(before).not.toContain("Time:");
    const rec = JSON.parse(readFileSync(stateFile(), "utf8"));
    expect(rec.tickets[`auth-login/${TICKET}`].startedAt).toBeTruthy();
  });

  test("state.json 없는 프로젝트에 start → 쓰기로 v2 승격(문서는 그대로)", async () => {
    setup();
    expect(existsSync(stateFile())).toBe(false);
    const before = readFileSync(ticketFile(), "utf8");
    const { status, body } = await postTime("start");
    expect(body.error ?? "").toBe("");
    expect(status).toBe(200);
    expect(readFileSync(ticketFile(), "utf8")).toBe(before);
    expect(existsSync(stateFile())).toBe(true);
    const rec = JSON.parse(readFileSync(stateFile(), "utf8"));
    expect(rec.tickets[`auth-login/${TICKET}`].startedAt).toBeTruthy();
  });

  test("MD Time: 줄이 남아 있어도 start 는 그 줄을 읽지도 고치지도 않는다", async () => {
    setup();
    writeFileSync(ticketFile(), `# ${TICKET} — 화면\n\n**Time:** started=2026-08-01T09:00:00+09:00\n\n## Goal\n\n로그인 화면.\n`);
    const before = readFileSync(ticketFile(), "utf8");
    const { status } = await postTime("start");
    expect(status).toBe(200);
    expect(readFileSync(ticketFile(), "utf8")).toBe(before); // 좀비 줄 그대로 — 권위가 아니라 흔적이다
    const rec = JSON.parse(readFileSync(stateFile(), "utf8"));
    expect(rec.tickets[`auth-login/${TICKET}`].startedAt).toBeTruthy();
  });
});
