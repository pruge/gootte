import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 저장소 사용량 측정(settings-storage-meter) — WebKit WebsiteData 디렉토리 합산.
 * INV-5: 그때 재는 사실이라 저장하지 않고, 읽을 때마다 잰다.
 */

let cachedBundleId: string | null | undefined;

/** 번들 ID — `tauri.conf.json` 의 `identifier` 가 SoT 다. */
function bundleId(): string | null {
  if (cachedBundleId !== undefined) return cachedBundleId;
  try {
    const here = dirname(fileURLToPath(import.meta.url)); // backend/src
    const conf = JSON.parse(
      readFileSync(join(here, "..", "..", "src-tauri", "tauri.conf.json"), "utf8"),
    ) as { identifier?: unknown };
    cachedBundleId =
      typeof conf.identifier === "string" && conf.identifier ? conf.identifier : null;
  } catch {
    cachedBundleId = null;
  }
  return cachedBundleId;
}

/**
 * 잴 디렉토리 — env 오버라이드(`GOOTTE_WEBKIT_DATA_DIR`, 테스트용)가 이기고,
 * 없으면 macOS 기본값(`~/Library/WebKit/<번들ID>/`). 잴 수 없으면 null.
 */
export function webkitDataDir(): string | null {
  const override = process.env.GOOTTE_WEBKIT_DATA_DIR?.trim();
  if (override) return override;
  if (process.platform !== "darwin") return null;
  const home = process.env.HOME;
  const id = bundleId();
  if (!home || !id) return null;
  return join(home, "Library", "WebKit", id);
}

/** 디렉토리 재귀 합산(바이트). 못 읽으면 null — 죽지 않는다. 심볼릭링크는 건너뛴다. */
export function dirSizeBytes(dir: string): number | null {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  let total = 0;
  for (const e of entries) {
    const abs = join(dir, e.name);
    try {
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        const sub = dirSizeBytes(abs);
        if (sub !== null) total += sub;
      } else if (e.isFile()) {
        total += statSync(abs).size;
      }
    } catch {
      // 읽을 수 없는 항목은 건너뛴다 — 죽지 않는다
    }
  }
  return total;
}

/** 저장소 총량 — 잴 수 없으면 null. */
export function storageTotalBytes(): number | null {
  const dir = webkitDataDir();
  if (!dir || !existsSync(dir)) return null;
  return dirSizeBytes(dir);
}
