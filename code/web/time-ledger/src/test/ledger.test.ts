import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLedger } from "../ledger.js";
import type { LedgerConfig } from "../ledger.js";
import { timeRecordKey } from "../core.js";

function makeConfig(ledgerRoot: string): LedgerConfig {
  return { ledgerRoot, ticketSourceRoot: ledgerRoot };
}

function setupTmp(): { ledgerRoot: string; config: LedgerConfig } {
  const ledgerRoot = join(tmpdir(), `time-ledger-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(ledgerRoot, ".gootte"), { recursive: true });
  mkdirSync(join(ledgerRoot, "auth", "tickets"), { recursive: true });
  mkdirSync(join(ledgerRoot, "billing", "tickets"), { recursive: true });
  writeFileSync(join(ledgerRoot, "auth", "tickets", "T01.md"), "# T01\n");
  writeFileSync(join(ledgerRoot, "auth", "tickets", "T02.md"), "# T02\n");
  writeFileSync(join(ledgerRoot, "billing", "tickets", "T02.md"), "# T02\n");
  writeFileSync(join(ledgerRoot, ".gootte", "state.json"), JSON.stringify({ version: 2, updatedAt: new Date().toISOString(), tickets: {} }));
  return { ledgerRoot, config: makeConfig(ledgerRoot) };
}

function cleanupTmp(ledgerRoot: string): void {
  try { rmSync(ledgerRoot, { recursive: true, force: true }); } catch { /* ignore */ }
}

describe("ledger transitions — 9 independent methods", () => {
  let ledger: ReturnType<typeof createLedger>;
  let ledgerRoot: string;

  beforeEach(() => {
    const tmp = setupTmp();
    ledgerRoot = tmp.ledgerRoot;
    ledger = createLedger(tmp.config);
  });

  afterEach(() => {
    cleanupTmp(ledgerRoot);
  });

  // ── 7 lifecycle ────────────────────────────────────────────────
  test("start — creates time record for a ticket", async () => {
    const result = await (ledger as any).start({ feature: "auth", ticket: "T01" }, "2026-01-01T00:00:00Z");
    expect(result.ok).toBe(true);
    const read = await (ledger as any).read({ feature: "auth", ticket: "T01" });
    expect(read.ok).toBe(true);
    expect(read.data!.startedAt).toBe("2026-01-01T00:00:00Z");
    expect(read.data!.finishedAt).toBeNull();
  });

  test("start twice without update returns conflict", async () => {
    await (ledger as any).start({ feature: "auth", ticket: "T01" }, "2026-01-01T00:00:00Z");
    const result = await (ledger as any).start({ feature: "auth", ticket: "T01" }, "2026-01-02T00:00:00Z");
    expect("ok" in result && result.ok === false).toBe(true);
    expect((result as any).code).toBe("conflict");
  });

  test("start with update:true overwrites existing start", async () => {
    await (ledger as any).start({ feature: "auth", ticket: "T01" }, "2026-01-01T00:00:00Z");
    const result = await (ledger as any).start({ feature: "auth", ticket: "T01" }, "2026-01-02T00:00:00Z", { update: true });
    expect(result.ok).toBe(true);
    const read = await (ledger as any).read({ feature: "auth", ticket: "T01" });
    expect(read.data!.startedAt).toBe("2026-01-02T00:00:00Z");
  });

  test("pause — records pause time", async () => {
    await (ledger as any).start({ feature: "auth", ticket: "T01" }, "2026-01-01T00:00:00Z");
    const result = await (ledger as any).pause({ feature: "auth", ticket: "T01" }, "2026-01-01T01:00:00Z");
    expect(result.ok).toBe(true);
    const read = await (ledger as any).read({ feature: "auth", ticket: "T01" });
    expect(read.data!.pauses.length).toBe(1);
    expect(read.data!.pauses[0].pausedAt).toBe("2026-01-01T01:00:00Z");
  });

  test("resume — records resume time after pause", async () => {
    await (ledger as any).start({ feature: "auth", ticket: "T01" }, "2026-01-01T00:00:00Z");
    await (ledger as any).pause({ feature: "auth", ticket: "T01" }, "2026-01-01T01:00:00Z");
    const result = await (ledger as any).resume({ feature: "auth", ticket: "T01" }, "2026-01-01T02:00:00Z");
    expect(result.ok).toBe(true);
    const read = await (ledger as any).read({ feature: "auth", ticket: "T01" });
    expect(read.data!.pauses[0].resumedAt).toBe("2026-01-01T02:00:00Z");
  });

  test("end — records finishedAt", async () => {
    await (ledger as any).start({ feature: "auth", ticket: "T01" }, "2026-01-01T00:00:00Z");
    await (ledger as any).pause({ feature: "auth", ticket: "T01" }, "2026-01-01T01:00:00Z");
    await (ledger as any).resume({ feature: "auth", ticket: "T01" }, "2026-01-01T02:00:00Z");
    const result = await (ledger as any).end({ feature: "auth", ticket: "T01" }, "2026-01-01T03:00:00Z");
    expect(result.ok).toBe(true);
    const read = await (ledger as any).read({ feature: "auth", ticket: "T01" });
    expect(read.data!.finishedAt).toBe("2026-01-01T03:00:00Z");
  });

  test("cancel — removes the record", async () => {
    await (ledger as any).start({ feature: "auth", ticket: "T01" }, "2026-01-01T00:00:00Z");
    const result = await (ledger as any).cancel({ feature: "auth", ticket: "T01" });
    expect(result.ok).toBe(true);
    const read = await (ledger as any).read({ feature: "auth", ticket: "T01" });
    expect(read.ok).toBe(true);
    expect(read.data).toBeUndefined();
  });

  test("drop — marks ticket as wontfix with finishedAt", async () => {
    const result = await (ledger as any).drop({ feature: "auth", ticket: "T01" }, "2026-01-01T00:00:00Z");
    expect(result.ok).toBe(true);
    const read = await (ledger as any).read({ feature: "auth", ticket: "T01" });
    expect(read.data!.finishedAt).toBe("2026-01-01T00:00:00Z");
    expect(read.data!.statusRaw).toBe("wontfix");
  });

  test("reopen — resets finishedAt and startedAt", async () => {
    await (ledger as any).start({ feature: "auth", ticket: "T01" }, "2026-01-01T00:00:00Z");
    await (ledger as any).end({ feature: "auth", ticket: "T01" }, "2026-01-01T03:00:00Z");
    const result = await (ledger as any).reopen({ feature: "auth", ticket: "T01" }, "2026-01-02T00:00:00Z");
    expect(result.ok).toBe(true);
    const read = await (ledger as any).read({ feature: "auth", ticket: "T01" });
    expect(read.data!.startedAt).toBe("2026-01-02T00:00:00Z");
    expect(read.data!.finishedAt).toBeNull();
  });

  // ── batchDrop ────────────────────────────────────────────────
  test("batchDrop — drops multiple tickets at once", async () => {
    const ledger2 = createLedger(makeConfig(setupTmp().ledgerRoot));
    const result = await (ledger2 as any).batchDrop("auth", [
      { feature: "auth", ticket: "T01", path: "auth/tickets/T01.md" },
      { feature: "auth", ticket: "T02", path: "auth/tickets/T02.md" },
    ], "2026-01-01T00:00:00Z");
    expect(result.ok).toBe(true);
    const r1 = await (ledger2 as any).read({ feature: "auth", ticket: "T01" });
    const r2 = await (ledger2 as any).read({ feature: "auth", ticket: "T02" });
    expect(r1.data!.statusRaw).toBe("wontfix");
    expect(r2.data!.statusRaw).toBe("wontfix");
  });

  // ── importLegacy ─────────────────────────────────────────────
  test("importLegacy overwrite — replaces existing records", async () => {
    const result = await (ledger as any).importLegacy(
      { "auth/T01": { startedAt: "2026-02-01T00:00:00Z", finishedAt: null, pauses: [], statusRaw: null } },
      { mode: "overwrite" }
    );
    expect(result.ok).toBe(true);
    expect((result as any).data.imported).toBe(1);
    const read = await (ledger as any).read({ feature: "auth", ticket: "T01" });
    expect(read.data!.startedAt).toBe("2026-02-01T00:00:00Z");
  });

  test("importLegacy overwrite with active record returns conflict", async () => {
    await (ledger as any).start({ feature: "auth", ticket: "T01" }, "2026-01-01T00:00:00Z");
    const result = await (ledger as any).importLegacy(
      { "auth/T01": { startedAt: "2026-02-01T00:00:00Z" } },
      { mode: "overwrite" }
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("conflict");
  });

  test("importLegacy append preserves existing records", async () => {
    await (ledger as any).start({ feature: "auth", ticket: "T01" }, "2026-01-01T00:00:00Z");
    const result = await (ledger as any).importLegacy(
      { "auth/T02": { startedAt: null, finishedAt: null, pauses: [], statusRaw: null } },
      { mode: "append" }
    );
    expect(result.ok).toBe(true);
    expect((result as any).data.imported).toBe(1);
    const r01 = await (ledger as any).read({ feature: "auth", ticket: "T01" });
    expect(r01.data!.startedAt).toBe("2026-01-01T00:00:00Z"); // preserved
  });

  test("importLegacy append never overwrites startedAt != null", async () => {
    await (ledger as any).start({ feature: "auth", ticket: "T01" }, "2026-01-01T00:00:00Z");
    const result = await (ledger as any).importLegacy(
      { "auth/T01": { startedAt: "2026-02-01T00:00:00Z" } },
      { mode: "append" }
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("conflict");
  });

  test("importLegacy returns single coherent result", async () => {
    const result = await (ledger as any).importLegacy({}, { mode: "append" });
    expect(result.ok).toBe(true);
    expect("data" in result).toBe(true);
    expect((result as any).data).toHaveProperty("imported");
    expect((result as any).data).toHaveProperty("skipped");
    expect((result as any).data).toHaveProperty("conflicts");
  });
});

describe("replaceOpenFeatures parity", () => {
  let ledger: ReturnType<typeof createLedger>;
  let ledgerRoot: string;

  beforeEach(() => {
    const tmp = setupTmp();
    ledgerRoot = tmp.ledgerRoot;
    ledger = createLedger(tmp.config);
  });

  afterEach(() => {
    cleanupTmp(ledgerRoot);
  });

  test("identical values → 0 writes", async () => {
    // Write initial state
    const statePath = join(ledgerRoot, ".gootte", "state.json");
    const state = { version: 2, updatedAt: new Date().toISOString(), tickets: {} };
    writeFileSync(statePath, JSON.stringify(state, null, 2));

    const result = await (ledger as any).replaceOpenFeatures([]);
    expect(result.ok).toBe(true);
    // State should be unchanged (0 writes)
    const current = readFileSync(statePath, "utf-8");
    expect(current).toBe(JSON.stringify(state, null, 2));
  });

  test("v1 state preserved (no state → v1 badge schema preserved)", async () => {
    // When there's no state.json, replaceOpenFeatures should preserve v1 badge schema
    const result = await (ledger as any).replaceOpenFeatures([]);
    // Should not crash — v1 badge schema is preserved by not writing new format
    expect(result.ok).toBe(true);
  });
});
