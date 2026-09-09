import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  SettingsResponse,
  SettingsUpdateRequest,
  type ApiError,
  type Settings,
} from "@gootte/contract";
import {
  readSettings,
  writeSettings,
  normalizeDirPath,
} from "@gootte/core-io";

const planError = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export interface SettingsRouteDeps {
  dataDir: string;
  effectiveRoots: () => string[];
  onProjectsChange?: (projects: string[]) => void;
}

export function createSettingsRoutes(deps: SettingsRouteDeps): Hono {
  const { dataDir, effectiveRoots, onProjectsChange } = deps;
  const router = new Hono();

  /** 설정 + 응답 시점에 다시 본 파생 프로젝트 목록(INV-3). */
  const settingsWithEffective = (s: Settings): SettingsResponse => ({
    ...s,
    effectiveProjects: effectiveRoots(),
  });

  // GET /api/settings → SettingsResponse
  router.get("/api/settings", (c) => {
    try {
      return c.json(SettingsResponse.parse(settingsWithEffective(readSettings(dataDir))));
    } catch (err) {
      return c.json({ error: planError(err) } satisfies ApiError, 500);
    }
  });

  // PUT /api/settings → SettingsResponse
  router.put("/api/settings", zValidator("json", SettingsUpdateRequest), (c) => {
    const update = c.req.valid("json");
    const normalized: {
      projects?: string[] | null;
      blockedCopies?: string[];
      autoClose?: boolean;
    } = {};
    if (update.projects !== undefined) {
      if (update.projects === null) {
        normalized.projects = null;
      } else {
        try {
          normalized.projects = update.projects.map((p) => normalizeDirPath(p));
        } catch (err) {
          return c.json({ error: planError(err) } satisfies ApiError, 400);
        }
      }
    }
    if (update.blockedCopies !== undefined) normalized.blockedCopies = update.blockedCopies;
    if (update.autoClose !== undefined) normalized.autoClose = update.autoClose;
    try {
      writeSettings(dataDir, normalized);
      if (update.projects !== undefined)
        onProjectsChange?.(effectiveRoots());
    } catch (err) {
      return c.json({ error: planError(err) } satisfies ApiError, 500);
    }
    try {
      return c.json(SettingsResponse.parse(settingsWithEffective(readSettings(dataDir))));
    } catch (err) {
      return c.json({ error: planError(err) } satisfies ApiError, 500);
    }
  });

  return router;
}
