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
  dataDir: string;
  now: () => string;
}

export function createMemoRoutes(deps: MemoRouteDeps): Hono {
  const { resolveSlug, effectiveRoots, dataDir, now } = deps;
  const router = new Hono();

  // GET /api/memos/:slug → MemosResponse
  router.get("/api/memos/:slug", zValidator("param", slugParam), (c) => {
    const { slug } = c.req.valid("param");
    const proj = resolveSlug(effectiveRoots(), slug);
    if (!proj) return c.json({ error: `프로젝트 없음: ${slug}` } satisfies ApiError, 404);
    try {
      return c.json(MemosResponse.parse({ project: slug, memos: readMemos(dataDir, slug) }));
    } catch (err) {
      return c.json({ error: planError(err) } satisfies ApiError, 500);
    }
  });

  // POST /api/memos/:slug → Memo (새 메모 한 장 — 작성 순서대로 목록 뒤에 붙는다)
  router.post("/api/memos/:slug", zValidator("param", slugParam), zValidator("json", MemoWriteRequest), (c) => {
    const { slug } = c.req.valid("param");
    const body = c.req.valid("json");
    const proj = resolveSlug(effectiveRoots(), slug);
    if (!proj) return c.json({ error: `프로젝트 없음: ${slug}` } satisfies ApiError, 404);
    try {
      const memo = appendMemo(dataDir, slug, body, now());
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
      const proj = resolveSlug(effectiveRoots(), slug);
      if (!proj) return c.json({ error: `프로젝트 없음: ${slug}` } satisfies ApiError, 404);
      try {
        const memo = updateMemo(dataDir, slug, id, body, now());
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
      const proj = resolveSlug(effectiveRoots(), slug);
      if (!proj) return c.json({ error: `프로젝트 없음: ${slug}` } satisfies ApiError, 404);
      try {
        if (!deleteMemo(dataDir, slug, id)) {
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
