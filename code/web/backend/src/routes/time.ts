import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { ApiError } from "@gootte/contract";
import {
  readFeatures,
  extraWorktreeRoots,
  joinTimeRecords,
} from "@gootte/core-io";
import { recordProjectScan } from "../snapshot";

const planError = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const slugParam = z.object({ slug: z.string().min(1) });
const TimeAction = z.object({ feature: z.string().min(1), ticket: z.string().min(1), action: z.enum(["start", "pause", "resume", "end"]) });

/** `bin/gootte` CLI 절대 경로 — 이 파일에서 ../.. 으로 코드 루트를 찾아 bin/ 으로. */
const gootteBin = join(resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".."), "bin", "gootte");

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
      const target = pickTimeTarget(proj, feature, ticket, action, withWorktrees, bbWorktrees);
      execFileSync(gootteBin, [action, feature, ticket], { cwd: target, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
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
