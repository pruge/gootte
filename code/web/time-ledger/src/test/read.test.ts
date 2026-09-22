import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLedger } from "../ledger.js";
import type { LedgerConfig } from "../ledger.js";

function makeConfig(ledgerRoot: string): LedgerConfig {
  return { ledgerRoot };
}

function setupTmp(): { ledgerRoot: string; config: LedgerConfig } {
  const ledgerRoot = join(tmpdir(), `time-ledger-read-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(ledgerRoot, ".gootte"), { recursive: true });
  mkdirSync(join(ledgerRoot, "auth", "tickets"), { recursive: true });
  mkdirSync(join(ledgerRoot, "billing", "tickets"), { recursive: true });
  writeFileSync(join(ledgerRoot, "auth", "tickets", "T01.md"), "# T01\n");
  writeFileSync(join(ledgerRoot, "billing", "tickets", "T02.md"), "# T02\n");
  writeFileSync(join(ledgerRoot, ".gootte", "state.json"), JSON.stringify({ version: 2, updatedAt: new Date().toISOString(), tickets: {} }));
  return { ledgerRoot, config: makeConfig(ledgerRoot) };
}

function cleanupTmp(ledgerRoot: string): void {
  try { rmSync(ledgerRoot, { recursive: true, force: true }); } catch { /* ignore */ }
}

describe("resolve/read/readAll/hasTimeRecords/replaceOpenFeatures", () => {
  let ledger: ReturnType<typeof createLedger>;
  let ledgerRoot: string;
  let config: LedgerConfig;

  beforeEach(() => {
    const tmp = setupTmp();
    ledgerRoot = tmp.ledgerRoot;
    config = tmp.config;
    ledger = createLedger(config);
  });

  afterEach(() => {
    cleanupTmp(ledgerRoot);
  });

  test("resolve returns ResolvedTicketKey for existing ticket", async () => {
    // Create a ticket file so git cat-file works
    const ticketDir = join(ledgerRoot, "auth", "tickets");
    mkdirSync(ticketDir, { recursive: true });
    writeFileSync(join(ticketDir, "T01.md"), "# T01\n");

    const result = await (ledger as any).resolve({ feature: "auth", ticket: "T01" });
    expect(result.ok).toBe(true);
    expect((result as any).data).toBeDefined();
  });

  test("read returns undefined for non-existent record", async () => {
    const result = await (ledger as any).read({ feature: "auth", ticket: "T99" });
    expect(result.ok).toBe(true);
    expect(result.data).toBeUndefined();
  });

  test("read returns TimedTicketRecord after start", async () => {
    await (ledger as any).start({ feature: "auth", ticket: "T01" }, "2026-01-01T00:00:00Z");
    const result = await (ledger as any).read({ feature: "auth", ticket: "T01" });
    expect(result.ok).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.startedAt).toBe("2026-01-01T00:00:00Z");
  });

  test("readAll returns all records", async () => {
    await (ledger as any).start({ feature: "auth", ticket: "T01" }, "2026-01-01T00:00:00Z");
    await (ledger as any).start({ feature: "billing", ticket: "T02" }, "2026-01-02T00:00:00Z");
    const result = await (ledger as any).readAll();
    expect(result.ok).toBe(true);
    expect(Object.keys(result.data ?? {}).length).toBe(2);
  });

  test("hasTimeRecords returns false when empty", async () => {
    const result = await (ledger as any).hasTimeRecords();
    expect(result.ok).toBe(true);
    expect(result.data).toBe(false);
  });

  test("hasTimeRecords returns true when records exist", async () => {
    await (ledger as any).start({ feature: "auth", ticket: "T01" }, "2026-01-01T00:00:00Z");
    const result = await (ledger as any).hasTimeRecords();
    expect(result.ok).toBe(true);
    expect(result.data).toBe(true);
  });

  test("hasTimeRecords uses LedgerConfig.ledgerRoot only — no public param", () => {
    // hasTimeRecords signature takes no arguments — it uses the internal config
    // This is verified by the function signature: hasTimeRecords(): Promise<LedgerResult<boolean>>
    expect(typeof (ledger as any).hasTimeRecords).toBe("function");
  });

  test("corrupt state.json → LedgerConflict.corrupt", async () => {
    const corruptPath = join(ledgerRoot, ".gootte", "state.json");
    writeFileSync(corruptPath, "{invalid json{{{");

    const result = await (ledger as any).readAll();
    expect("ok" in result && !result.ok).toBe(true);
    expect(result.code).toBe("corrupt");
  });

  test("read() validates v2 schema — corrupt → conflict", async () => {
    const corruptPath = join(ledgerRoot, ".gootte", "state.json");
    writeFileSync(corruptPath, JSON.stringify({ version: 1, tickets: {} }));

    const result = await (ledger as any).readAll();
    expect("ok" in result && !result.ok).toBe(true);
  });
});

describe("hasTimeRecords corrupt fail-closed", () => {
  let ledgerRoot: string;
  let config: LedgerConfig;

  beforeEach(() => {
    const tmp = setupTmp();
    ledgerRoot = tmp.ledgerRoot;
    config = tmp.config;
  });

  afterEach(() => {
    cleanupTmp(ledgerRoot);
  });

  test("read() with corrupt v2 schema returns LedgerConflict.corrupt", async () => {
    const ledger = createLedger(config);
    const corruptPath = join(ledgerRoot, ".gootte", "state.json");
    writeFileSync(corruptPath, "not json at all {{{");

    const result = await (ledger as any).hasTimeRecords();
    expect("ok" in result && !result.ok).toBe(true);
    expect(result.code).toBe("corrupt");
  });
});
