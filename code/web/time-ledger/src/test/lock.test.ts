import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLedger } from "../ledger.js";
import { acquireLock, releaseLock, hashFile, casWrite } from "../lock.js";
import type { LedgerConfig } from "../ledger.js";

function makeConfig(ledgerRoot: string): LedgerConfig {
  return { ledgerRoot };
}

function setupTmp(): { ledgerRoot: string } {
  const ledgerRoot = join(tmpdir(), `time-ledger-lock-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(ledgerRoot, ".gootte"), { recursive: true });
  mkdirSync(join(ledgerRoot, "auth", "tickets"), { recursive: true });
  writeFileSync(join(ledgerRoot, "auth", "tickets", "T01.md"), "# T01\n");
  writeFileSync(join(ledgerRoot, ".gootte", "state.json"), JSON.stringify({ version: 2, updatedAt: new Date().toISOString(), tickets: {} }));
  return { ledgerRoot };
}

function cleanupTmp(ledgerRoot: string): void {
  try { rmSync(ledgerRoot, { recursive: true, force: true }); } catch { /* ignore */ }
}

describe("lock/CAS/conflict", () => {
  let ledgerRoot: string;

  beforeEach(() => {
    const tmp = setupTmp();
    ledgerRoot = tmp.ledgerRoot;
  });

  afterEach(() => {
    cleanupTmp(ledgerRoot);
  });

  test("acquireLock returns lock file", async () => {
    const lock = await acquireLock(ledgerRoot);
    expect("ok" in lock ? lock.ok : true).toBe(true);
    expect(existsSync(join(ledgerRoot, ".gootte", "state.json.lock"))).toBe(true);
    await releaseLock(ledgerRoot);
  });

  test("acquireLock after release works", async () => {
    const lock1 = await acquireLock(ledgerRoot);
    expect("ok" in lock1).toBe(true);
    await releaseLock(ledgerRoot);
    const lock2 = await acquireLock(ledgerRoot);
    expect("ok" in lock2).toBe(true);
    await releaseLock(ledgerRoot);
  });

  test("hashFile returns sha256 hash", async () => {
    const content = "hello world";
    writeFileSync(join(ledgerRoot, "test.txt"), content);
    const hash = await hashFile(join(ledgerRoot, "test.txt"));
    expect(hash.length).toBe(64);
    try { rmSync(join(ledgerRoot, "test.txt"), { force: true }); } catch { /* ignore */ }
  });

  test("casWrite writes and verifies content", async () => {
    const result = await casWrite(
      ledgerRoot,
      join(ledgerRoot, "output.json"),
      JSON.stringify({ test: true })
    );
    expect(result.ok).toBe(true);
    const content = readFileSync(join(ledgerRoot, "output.json"), "utf-8");
    expect(JSON.parse(content)).toEqual({ test: true });
  });

  test("corrupt state.json → LedgerConflict.corrupt", async () => {
    const corruptPath = join(ledgerRoot, ".gootte", "state.json");
    writeFileSync(corruptPath, "{invalid json{{{");
    const ledger = createLedger(makeConfig(ledgerRoot));
    const result = await (ledger as any).readAll();
    expect(result.ok).toBe(false);
    expect(result.code).toBe("corrupt");
  });
});
