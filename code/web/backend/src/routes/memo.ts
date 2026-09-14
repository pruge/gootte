import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  MemosResponse,
  Memo,
  MemoWriteRequest,
  MemoDeleteResponse,
  type ApiError,
} from "@gootte/contract";
import {
  readMemos,
  appendMemo,
  updateMemo,
  deleteMemo,
} from "@gootte/core-io";

const planError = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const slugParam = z.object({ slug: z.string().min(1) });

export interface MemoRouteDeps {
  resolveSlug: (roots: string[], slug: string) => { copies: readonly string[]; path: string } | null;
  effectiveRoots: () => string[];
  now: () => string;
}

export function createMemoRoutes(deps: MemoRouteDeps): Hono {
  const { resolveSlug, effectiveRoots, now } = deps;
  const router = new Hono();

  /**
   * slug → **메모가 살아가는 메인 프로젝트 경로** — 저장 자리는 더 이상 gootte 의 계획 저장소
   * (`dataDir`)가 아니라 관리대상 저장소 안의 `.gootte/memo.json` 이다
   * (memos-live-with-the-project/T02). 해소는 화면이 이미 쓰는 판과 같다: discover 대표 경로
   * (`resolveSlug(...).path`) — 시간·상태 레코드를 읽는 자리와 같은 칸이다
   * (time-records-to-state-store D4).
   * 🔴 중앙(`dataDir/memos/<slug>.json`) 을 읽는 **폴백은 없다** — 폴백이 살아있으면 이중
   * 원장이자, 이관 안 된 프로젝트가 이관된 척 보인다(grill Locked 5). 못 찾으면 404.
   */
  const memoDirOf = (slug: string): string | null => {
    const proj = resolveSlug(effectiveRoots(), slug);
    return proj ? proj.path : null;
  };

  // GET /api/memos/:slug → MemosResponse
  router.get("/api/memos/:slug", zValidator("param", slugParam), (c) => {
    const { slug } = c.req.valid("param");
    const projectDir = memoDirOf(slug);
    if (projectDir === null) return c.json({ error: `프로젝트 없음: ${slug}` } satisfies ApiError, 404);
    try {
      // 🔴 `project` 값은 slug 그대로 — 경로를 화면에 흘리지 않는다(Locked 5).
      return c.json(MemosResponse.parse({ project: slug, memos: readMemos(projectDir) }));
    } catch (err) {
      return c.json({ error: planError(err) } satisfies ApiError, 500);
    }
  });

  // POST /api/memos/:slug → Memo (새 메모 한 장 — 작성 순서대로 목록 뒤에 붙는다)
  router.post("/api/memos/:slug", zValidator("param", slugParam), zValidator("json", MemoWriteRequest), (c) => {
    const { slug } = c.req.valid("param");
    const body = c.req.valid("json");
    const projectDir = memoDirOf(slug);
    if (projectDir === null) return c.json({ error: `프로젝트 없음: ${slug}` } satisfies ApiError, 404);
    try {
      const memo = appendMemo(projectDir, body, now());
      return c.json(Memo.parse(memo));
    } catch (err) {
      return c.json({ error: planError(err) } satisfies ApiError, 500);
    }
  });

  // PUT /api/memos/:slug/:id → Memo (한 장 고치기 — 내용만 바꾸고 수정 시각을 고친다)
  router.put(
    "/api/memos/:slug/:id",
    zValidator("param", slugParam.extend({ id: z.string().min(1) })),
    zValidator("json", MemoWriteRequest),
    (c) => {
      const { slug, id } = c.req.valid("param");
      const body = c.req.valid("json");
      const projectDir = memoDirOf(slug);
      if (projectDir === null) return c.json({ error: `프로젝트 없음: ${slug}` } satisfies ApiError, 404);
      try {
        const memo = updateMemo(projectDir, id, body, now());
        if (!memo) return c.json({ error: `메모 없음: ${id}` } satisfies ApiError, 404);
        return c.json(Memo.parse(memo));
      } catch (err) {
        return c.json({ error: planError(err) } satisfies ApiError, 500);
      }
    },
  );

  // DELETE /api/memos/:slug/:id → MemoDeleteResponse
  router.delete(
    "/api/memos/:slug/:id",
    zValidator("param", slugParam.extend({ id: z.string().min(1) })),
    (c) => {
      const { slug, id } = c.req.valid("param");
      const projectDir = memoDirOf(slug);
      if (projectDir === null) return c.json({ error: `프로젝트 없음: ${slug}` } satisfies ApiError, 404);
      try {
        if (!deleteMemo(projectDir, id)) {
          return c.json({ error: `메모 없음: ${id}` } satisfies ApiError, 404);
        }
        return c.json(MemoDeleteResponse.parse({ ok: true }));
      } catch (err) {
        return c.json({ error: planError(err) } satisfies ApiError, 500);
      }
    },
  );

  return router;
}
