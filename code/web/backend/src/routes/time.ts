import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { ApiError } from "@gootte/contract";
import type { TicketTimeRecord } from "@gootte/contract";
import {
  readFeatures,
  extraWorktreeRoots,
  hasTimeRecords,
  joinTimeRecords,
} from "@gootte/core-io";
import { runTimeCommand } from "@gootte/cli";
import { recordProjectScan } from "../snapshot";

const planError = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** bash `bin/gootte` argv — flags 는 명령어 **뒤·위치인자 앞**(그 스크립트의 usage:
 *  `gootte start [--at <TIME>] [--force] <feature> <ticket>`). */
const bashArgs = (action: string, feature: string, ticket: string): string[] =>
  action === "start" ? [action, "--force", feature, ticket] : [action, feature, ticket];

/** `runTimeCommand` argv — 위치인자가 **먼저**, flags 는 뒤(그 함수의 usage:
 *  `time <cmd> <기능> <티켓> [--at <TIME>] [--force]`). 두 규약이 반대라 하나로 합치면
 *  `--force` 가 feature 자리에 앉아 "티켓 파일을 찾을 수 없습니다" 로 죽는다. */
const tsArgs = (action: string, feature: string, ticket: string): string[] =>
  action === "start" ? [action, feature, ticket, "--force"] : [action, feature, ticket];

const slugParam = z.object({ slug: z.string().min(1) });
const TimeAction = z.object({ feature: z.string().min(1), ticket: z.string().min(1), action: z.enum(["start", "pause", "resume", "end"]) });

/** `bin/gootte` CLI 절대 경로 — routes(1)/src(2)/backend(3)/web(4)/code(5) 를 올라 저장소 뿌리의 bin/ 으로. */
const gootteBin = join(resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", ".."), "bin", "gootte");

/**
 * 그 사본에 티켓 파일이 실재하는가 — 신관례(`tickets/T<NN>.md`)와 구관례(`issues/<NN>-*.md`)
 * 둘 다 본다. `pickTimeTarget` 이 기록 대상을 고를 때, 그 사본에서 CLI 가 실제로 파일을 찾을 수
 * 있는지를 확인하기 위해 쓴다 — 파일이 없는 사본을 고르면 `gootte start` 가 "티켓 파일을 찾을 수
 * 없습니다" 로 죽는다(실제 결함 2026-09-01: fsm-coordination-docs worktree 에는 live-state-display
 * 가 없는데 시작 버튼이 그쪽을 골랐다).
 */
const hasTicketFile = (copy: string, feature: string, ticket: string): boolean => {
  const num = ticket.replace(/^T/i, "");
  if (existsSync(join(copy, "docs", "features", feature, "tickets", `T${num}.md`))) return true;
  const issuesDir = join(copy, "docs", "features", feature, "issues");
  if (!existsSync(issuesDir)) return false;
  return readdirSync(issuesDir).some((f) => f.startsWith(num) && f.endsWith(".md"));
};

/**
 * ADR-0002: 대상 사본 선택 — 버튼으로 시간 기록할 때 어느 사본의 티켓 문서를 수정할지 정한다.
 * - `start` 이외: `started=` 가 이미 있는 사본 우선. 없으면 대표.
 * - `start`: working worktree 우선, 없으면 대표(copies[0]).
 */
const pickTimeTarget = (
  proj: { copies: readonly string[]; path: string },
  feature: string,
  ticket: string,
  action: string,
  withWorktrees: (copies: readonly string[]) => string[],
  bbWorktrees: string,
): string => {
  const allCopies = withWorktrees(proj.copies);
  if (action === "start") {
    const worktrees = extraWorktreeRoots(proj.copies, bbWorktrees);
    const withTicket = worktrees.find((c) => existsSync(c) && hasTicketFile(c, feature, ticket));
    if (withTicket) return withTicket;
    const anyWithTicket = allCopies.find((c) => hasTicketFile(c, feature, ticket));
    if (anyWithTicket) return anyWithTicket;
    return proj.path;
  }
  for (const copy of allCopies) {
    const newTicketFile = join(copy, "docs", "features", feature, "tickets", `T${ticket.replace(/^T/i, "")}.md`);
    if (existsSync(newTicketFile) && readFileSync(newTicketFile, "utf8").includes("started=")) return copy;
    const num = ticket.replace(/^T/i, "");
    const issuesDir = join(copy, "docs", "features", feature, "issues");
    if (existsSync(issuesDir)) {
      for (const f of readdirSync(issuesDir)) {
        if (f.startsWith(num) && f.endsWith(".md") && readFileSync(join(issuesDir, f), "utf8").includes("started=")) return copy;
      }
    }
  }
  return proj.path;
};

export interface TimeRouteDeps {
  resolveSlug: (roots: string[], slug: string) => { copies: readonly string[]; path: string } | null;
  effectiveRoots: () => string[];
  withWorktrees: (copies: readonly string[]) => string[];
  bbWorktrees: string;
  dataDir: string;
  broadcast?: (event: { kind: "project"; project: string } | { kind: "projects" }) => void;
}

export function createTimeRoutes(deps: TimeRouteDeps): Hono {
  const { resolveSlug, effectiveRoots, withWorktrees, bbWorktrees, dataDir, broadcast } = deps;
  const router = new Hono();

  router.post("/api/projects/:slug/time", zValidator("param", slugParam), zValidator("json", TimeAction), (c) => {
    const { slug } = c.req.valid("param");
    const { feature, ticket, action } = c.req.valid("json");
    const proj = resolveSlug(effectiveRoots(), slug);
    if (!proj) return c.json({ error: `프로젝트 없음: ${slug}` } satisfies ApiError, 404);
    try {
      // 🔴 모드 이분법(D2)이 **프로세스 경계**를 정한다 — 읽기 경로(time-records-join)와 같은 판이다.
      //    레코드 모드(state.json v2) 프로젝트의 시간 기록 권위는 상태 저장소다: MD 를 쓰는 bash CLI 를
      //    거치면 안 된다. 종전에는 항상 `bin/gootte` 를 exec 했는데, 그 스크립트의 레코드 모드 위임이
      //    `command -v npx` 에 걸려 있어 데스크톱 앱의 GUI PATH(`/usr/bin:/bin:…`)에서는 조용히
      //    MD 경로로 떨어졌다 — 레코드 모드 MD 에는 `Time:` 줄이 없으므로 종료 버튼이
      //    "시작되지 않은 티켓입니다(Time: 줄이 없음)" 로 죽었다(실측 2026-09-17).
      //    레코드 경로는 CLI 와 **같은 구현**을 in-process 로 부른다 — 검증 규칙 복제가 없다.
      if (hasTimeRecords(proj.path)) {
        runTimeCommand(tsArgs(action, feature, ticket), proj.path);
      } else {
        // MD 모드 — MD 가 SoT 다. bash CLI 가 MD 를 직접 쓴다(이 경로는 npx 가 필요 없다).
        const target = pickTimeTarget(proj, feature, ticket, action, withWorktrees, bbWorktrees);
        execFileSync(gootteBin, bashArgs(action, feature, ticket), { cwd: target, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      }
      const all = withWorktrees(proj.copies);
      // 🔴 레코드 조인 뒤의 값을 스냅샷에 기록한다(T03) — 기록 직후 화면·스냅샷·state.json 이
      // 같은 값을 보게(INV-3). bin/gootte 가 state.json 모드면 레코드가 방금 바뀌었으므로 특히 중요.
      recordProjectScan(dataDir, { slug, path: proj.path, copies: [...all] }, joinTimeRecords(readFeatures([...all]), proj.path));
      broadcast?.({ kind: "project", project: slug });
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: `시간 기록 실패: ${err instanceof Error ? err.message : String(err)}` } satisfies ApiError, 500);
    }
  });

  return router;
}
