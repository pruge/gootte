import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync, openSync, fsyncSync, closeSync } from "node:fs";
import { join, dirname } from "node:path";
import { hostname } from "node:os";
import type { LedgerConflict, LedgerResult } from "./types.js";

// ── Lock/CAS defaults (locked, not unknown) ──────────────────────
const LOCK_FILE_SUFFIX = ".gootte/state.json.lock";
const LOCK_DEADLINE_MS = 2000;
const RETRY_BASE_MS = 10;
const RETRY_MAX_MS = 100;
const STALE_AGE_MS = 30_000;
const MAX_HASH_MISMATCH_RETRIES = 3;

interface LockFile {
  ownerPid: number;
  ownerHost: string;
  acquiredAt: number;
  documentHash: string;
}

// ── 파일 해시 ──────────────────────────────────────────────────
export async function hashFile(path: string): Promise<string> {
  const content = await readFileBytes(path);
  return createHash("sha256").update(content).digest("hex");
}

function readFileBytes(path: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    try {
      const buf = readFileSync(path);
      resolve(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
    } catch (e) { reject(e); }
  });
}

// ── Lock 관리 ──────────────────────────────────────────────────
export async function acquireLock(ledgerRoot: string): Promise<{ ok: true; data: LockFile } | { ok: false; error: LedgerConflict }> {
  const lockPath = join(ledgerRoot, LOCK_FILE_SUFFIX);
  const deadline = Date.now() + LOCK_DEADLINE_MS;

  while (Date.now() < deadline) {
    const existing = readLockFile(lockPath);
    if (!existing) {
      const lock: LockFile = {
        ownerPid: process.pid,
        ownerHost: hostname(),
        acquiredAt: Date.now(),
        documentHash: "",
      };
      const result = writeLockFile(lockPath, lock);
      if (result.ok) return { ok: true, data: lock };
      return { ok: false, error: result.error };
    }

    const age = Date.now() - existing.acquiredAt;
    if (age >= STALE_AGE_MS && existing.ownerHost === hostname() && !isProcessAlive(existing.ownerPid)) {
      try { unlinkSync(lockPath); continue; } catch { /* 다른 프로세스가 잡았음 */ }
    }

    if (Date.now() >= deadline) {
      return { ok: false, error: conflict("locked", `Lock held by PID ${existing.ownerPid} on ${existing.ownerHost}`) };
    }

    await sleep(jitter(RETRY_BASE_MS, RETRY_MAX_MS));
  }

  return { ok: false, error: conflict("locked", "Could not acquire lock within deadline") };
}

export async function releaseLock(ledgerRoot: string): Promise<void> {
  const lockPath = join(ledgerRoot, LOCK_FILE_SUFFIX);
  try { unlinkSync(lockPath); } catch { /* 이미 없음 */ }
}

// ── CAS write ──────────────────────────────────────────────────
export async function casWrite(
  ledgerRoot: string,
  path: string,
  content: string,
): Promise<LedgerResult<void> | LedgerConflict> {
  const lockPath = join(ledgerRoot, LOCK_FILE_SUFFIX);
  const tempPath = `${path}.${randomBytes(4).toString("hex")}.tmp`;

  for (let attempt = 0; attempt < MAX_HASH_MISMATCH_RETRIES; attempt++) {
    const lockResult = await acquireLock(ledgerRoot);
    if (lockResult.ok === false) return lockResult;
    const lock = lockResult.data;

    try {
      await writeFileBytes(tempPath, new TextEncoder().encode(content));
      await fsyncFile(tempPath);
      await fsyncDir(dirname(path));
      renameSync(tempPath, path);

      const actualHash = await hashFile(path);
      if (lock.documentHash && actualHash !== lock.documentHash && attempt < MAX_HASH_MISMATCH_RETRIES - 1) {
        continue;
      }

      const newLock: LockFile = { ...lock, documentHash: actualHash, acquiredAt: Date.now() };
      writeLockFile(lockPath, newLock);
      return { ok: true, data: undefined };
    } finally {
      await releaseLock(ledgerRoot);
      try { unlinkSync(tempPath); } catch { /* 이미 rename됨 */ }
    }
  }

  return { ok: false, error: conflict("hash-mismatch", `Document hash mismatch after ${MAX_HASH_MISMATCH_RETRIES} retries`) };
}

// ── 내부 헬퍼 ────────────────────────────────────────────────
function readLockFile(lockPath: string): LockFile | null {
  try {
    const raw = readFileSync(lockPath, "utf-8");
    return JSON.parse(raw) as LockFile;
  } catch { return null; }
}

function writeLockFile(lockPath: string, lock: LockFile): LedgerResult<void> {
  try {
    const dir = dirname(lockPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(lockPath, JSON.stringify(lock));
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: conflict("locked", `Failed to write lock: ${(e as Error).message}`) };
  }
}

function isProcessAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function fsyncFile(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const fd = openSync(path, "r");
      fsyncSync(fd);
      closeSync(fd);
      resolve();
    } catch (e) { reject(e); }
  });
}

function fsyncDir(_dirPath: string): Promise<void> {
  // Directory fsync not needed for basic CAS on most platforms
  return Promise.resolve();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(base: number, max: number): number {
  return base + Math.random() * (max - base);
}

function writeFileBytes(path: string, bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    try { writeFileSync(path, Buffer.from(bytes)); resolve(); } catch (e) { reject(e); }
  });
}

export function conflict(code: LedgerConflict["code"], message: string, detail?: string): LedgerConflict {
  return { ok: false, code, message, detail };
}
