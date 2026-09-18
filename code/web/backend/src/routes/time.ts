import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { ApiError } from "@gootte/contract";
import {
  readFeatures,
  joinTimeRecords,
} from "@gootte/core-io";
import { runTimeCommand } from "@gootte/cli";
import { recordProjectScan } from "../snapshot";

/** `runTimeCommand` argv — 위치인자가 **먼저**, flags 는 뒤(그 함수의 usage:
 *  `time <cmd> <기능> <티켓> [--at <TIME>] [--force]`). 두 규약이 반대라 하나로 합치면
 *  `--force` 가 feature 자리에 앉아 "티켓 파일을 찾을 수 없습니다" 로 죽는다. */
const tsArgs = (action: string, feature: string, ticket: string): string[] =>
  action === "start" ? [action, feature, ticket, "--force"] : [action, feature, ticket];

const slugParam = z.object({ slug: z.string().min(1) });
const TimeAction = z.object({ feature: z.string().min(1), ticket: z.string().min(1), action: z.enum(["start", "pause", "resume", "end"]) });

export interface TimeRouteDeps {
  resolveSlug: (roots: string[], slug: string) => { copies: readonly string[]; path: string } | null;
  effectiveRoots: () => string[];
  withWorktrees: (copies: readonly string[]) => string[];
  dataDir: string;
  broadcast?: (event: { kind: "project"; project: string } | { kind: "projects" }) => void;
}

export function createTimeRoutes(deps: TimeRouteDeps): Hono {
  const { resolveSlug, effectiveRoots, withWorktrees, dataDir, broadcast } = deps;
  const router = new Hono();

  router.post("/api/projects/:slug/time", zValidator("param", slugParam), zValidator("json", TimeAction), (c) => {
    const { slug } = c.req.valid("param");
    const { feature, ticket, action } = c.req.valid("json");
    const proj = resolveSlug(effectiveRoots(), slug);
    if (!proj) return c.json({ error: `프로젝트 없음: ${slug}` } satisfies ApiError, 404);
    try {
      // 🔴 시간 기록은 레코드(`state.json` v2)에만 쓴다 — CLI 와 **같은 구현**을
      // in-process 로 부른다. MD 분기·bash 위임은 제거됨(구관례 완전 정리).
      // MD-only 프로젝트는 전부 pending 으로 보이므로 `gootte migrate` 로 이관해야 한다.
      runTimeCommand(tsArgs(action, feature, ticket), proj.path);
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
