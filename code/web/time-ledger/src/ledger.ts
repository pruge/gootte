import { createHash } from "node:crypto";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import type { Feature, TicketTimeRecord } from "@gootte/contract";
import type { TicketRef as TR, ResolvedTicketKey, LedgerResult, LedgerConflict, TimedTicketRecord, ImportSummary } from "./types.js";
import { casWrite, hashFile, conflict as makeConflict } from "./lock.js";
import { timeRecordKey, applyTimeRecords } from "./core.js";

// ── LedgerConfig ──────────────────────────────────────────
export interface LedgerConfig {
  ledgerRoot: string;
  ticketSourceRoot?: string;
}

// ── 내부 타입 ──────────────────────────────────────────────
interface LedgerInternals {
  ledgerRoot: string;
  ticketSourceRoot: string;
}

function statePath(root: string): string {
  return join(root, ".gootte", "state.json");
}

function readState(root: string): Record<string, TimedTicketRecord> {
  const sp = statePath(root);
  if (!existsSync(sp)) return {};
  try {
    const raw = readFileSync(sp, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed.version !== 2) throw new Error("Invalid state version");
    return parsed.tickets ?? {};
  } catch (e) {
    if ((e as Error).message === "Invalid state version") throw e;
    throw makeConflict("corrupt", "state.json is corrupt or invalid");
  }
}

async function writeState(root: string, records: Record<string, TimedTicketRecord>): Promise<void> {
  const sp = statePath(root);
  const dir = dirname(sp);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const content = JSON.stringify({ version: 2, updatedAt: new Date().toISOString(), tickets: records });
  await casWrite(root, sp, content);
}

// ── TicketRef resolve — always returns LedgerResult ──────
function resolveRef(root: string, ticketSourceRoot: string, ref: TR): Promise<LedgerResult<ResolvedTicketKey>> {
  const gitRel = `${ref.feature}/tickets/${ref.ticket}.md`;
  const absPath = join(ticketSourceRoot, gitRel);
  return new Promise((resolve) => {
    if (existsSync(absPath)) {
      resolve({ ok: true, data: { feature: ref.feature, ticket: ref.ticket, path: gitRel } });
      return;
    }
    try {
      execFileSync("git", ["cat-file", "-e", `HEAD:${gitRel}`], { cwd: ticketSourceRoot, stdio: "pipe" });
      resolve({ ok: true, data: { feature: ref.feature, ticket: ref.ticket, path: gitRel } });
    } catch {
      resolve({ ok: false, error: makeConflict("not-found", `Ticket not found: ${ref.feature}/${ref.ticket}`) });
    }
  });
}

// ── Transition API (per-instance closures) ────────────────
function makeStart(inst: LedgerInternals, ref: TR, at: string, options?: { update?: boolean }): Promise<LedgerResult | LedgerConflict> {
  return (async () => {
    const resolved = await resolveRef(inst.ledgerRoot, inst.ticketSourceRoot, ref);
    if (!resolved.ok) return resolved.error;
    const records = readState(inst.ledgerRoot);
    const rd = resolved.data;
    const key = timeRecordKey(rd.feature, rd.ticket);
    const existing = records[key];
    if (existing && existing.startedAt !== null && !options?.update) {
      return makeConflict("conflict", "Ticket already started");
    }
    records[key] = { ...existing, startedAt: at, finishedAt: null, pauses: [], statusRaw: null };
    await writeState(inst.ledgerRoot, records);
    return { ok: true, data: undefined };
  })();
}

// ── createLedger ──────────────────────────────────────────
export function createLedger(config: LedgerConfig) {
  const inst: LedgerInternals = {
    ledgerRoot: config.ledgerRoot,
    ticketSourceRoot: config.ticketSourceRoot ?? config.ledgerRoot,
  };

  const start = (ref: TR, at: string, options?: { update?: boolean }) =>
    makeStart(inst, ref, at, options);

  const pause = async (ref: TR, at: string): Promise<LedgerResult | LedgerConflict> => {
    const resolved = await resolveRef(inst.ledgerRoot, inst.ticketSourceRoot, ref);
    if (!resolved.ok) return resolved.error;
    const records = readState(inst.ledgerRoot);
    const rd = resolved.data;
    const key = timeRecordKey(rd.feature, rd.ticket);
    const existing = records[key];
    if (!existing || existing.startedAt === null) return makeConflict("conflict", "Ticket not started");
    if (existing.finishedAt !== null) return makeConflict("conflict", "Ticket already finished");
    if (existing.pauses.length > 0 && existing.pauses[existing.pauses.length - 1]!.resumedAt === null)
      return makeConflict("conflict", "Already paused");
    records[key] = { ...existing, pauses: [...existing.pauses, { pausedAt: at, resumedAt: null }] };
    await writeState(inst.ledgerRoot, records);
    return { ok: true, data: undefined };
  };

  const resume = async (ref: TR, at: string): Promise<LedgerResult | LedgerConflict> => {
    const resolved = await resolveRef(inst.ledgerRoot, inst.ticketSourceRoot, ref);
    if (!resolved.ok) return resolved.error;
    const records = readState(inst.ledgerRoot);
    const rd = resolved.data;
    const key = timeRecordKey(rd.feature, rd.ticket);
    const existing = records[key];
    if (!existing || existing.startedAt === null) return makeConflict("conflict", "Ticket not started");
    if (existing.finishedAt !== null) return makeConflict("conflict", "Ticket already finished");
    const lastPause = existing.pauses[existing.pauses.length - 1];
    if (!lastPause || lastPause.resumedAt !== null) return makeConflict("conflict", "No active pause to resume");
    records[key] = { ...existing, pauses: existing.pauses.map((p, i) => i === existing.pauses.length - 1 ? { ...p, resumedAt: at } : p) };
    await writeState(inst.ledgerRoot, records);
    return { ok: true, data: undefined };
  };

  const end = async (ref: TR, at: string): Promise<LedgerResult | LedgerConflict> => {
    const resolved = await resolveRef(inst.ledgerRoot, inst.ticketSourceRoot, ref);
    if (!resolved.ok) return resolved.error;
    const records = readState(inst.ledgerRoot);
    const rd = resolved.data;
    const key = timeRecordKey(rd.feature, rd.ticket);
    const existing = records[key];
    if (!existing || existing.startedAt === null) return makeConflict("conflict", "Ticket not started");
    if (existing.finishedAt !== null) return makeConflict("conflict", "Ticket already finished");
    records[key] = { ...existing, finishedAt: at, pauses: existing.pauses };
    await writeState(inst.ledgerRoot, records);
    return { ok: true, data: undefined };
  };

  const cancel = async (ref: TR): Promise<LedgerResult | LedgerConflict> => {
    const resolved = await resolveRef(inst.ledgerRoot, inst.ticketSourceRoot, ref);
    if (!resolved.ok) return resolved.error;
    const records = readState(inst.ledgerRoot);
    const rd = resolved.data;
    const key = timeRecordKey(rd.feature, rd.ticket);
    delete records[key];
    await writeState(inst.ledgerRoot, records);
    return { ok: true, data: undefined };
  };

  const drop = async (ref: TR, at: string): Promise<LedgerResult | LedgerConflict> => {
    const resolved = await resolveRef(inst.ledgerRoot, inst.ticketSourceRoot, ref);
    if (!resolved.ok) return resolved.error;
    const records = readState(inst.ledgerRoot);
    const rd = resolved.data;
    const key = timeRecordKey(rd.feature, rd.ticket);
    const existing = records[key];
    if (existing && existing.startedAt !== null) return makeConflict("conflict", "Cannot drop an active ticket");
    records[key] = { ...(existing ?? {}), startedAt: null, finishedAt: at, statusRaw: "wontfix", pauses: [] };
    await writeState(inst.ledgerRoot, records);
    return { ok: true, data: undefined };
  };

  const reopen = async (ref: TR, at: string): Promise<LedgerResult | LedgerConflict> => {
    const resolved = await resolveRef(inst.ledgerRoot, inst.ticketSourceRoot, ref);
    if (!resolved.ok) return resolved.error;
    const records = readState(inst.ledgerRoot);
    const rd = resolved.data;
    const key = timeRecordKey(rd.feature, rd.ticket);
    const existing = records[key];
    if (!existing || existing.finishedAt === null) return makeConflict("conflict", "Ticket not finished");
    records[key] = { ...existing, startedAt: at, finishedAt: null, pauses: [] };
    await writeState(inst.ledgerRoot, records);
    return { ok: true, data: undefined };
  };

  const batchDrop = async (feature: string, keys: ResolvedTicketKey[], at: string): Promise<LedgerResult | LedgerConflict> => {
    const records = readState(inst.ledgerRoot);
    for (const key of keys) {
      const k = timeRecordKey(key.feature, key.ticket);
      const existing = records[k];
      if (existing && existing.startedAt !== null) return makeConflict("conflict", `Cannot drop active ticket: ${k}`);
      records[k] = { ...(existing ?? {}), startedAt: null, finishedAt: at, statusRaw: "wontfix", pauses: [] };
    }
    await writeState(inst.ledgerRoot, records);
    return { ok: true, data: undefined };
  };

  const importLegacy = async (
    records: Record<string, Partial<TicketTimeRecord>>,
    options: { mode: "overwrite" | "append" },
  ): Promise<LedgerResult<ImportSummary> | LedgerConflict> => {
    const state = readState(inst.ledgerRoot);
    let imported = 0, skipped = 0, conflicts = 0;
    const conflictKeys: string[] = [];
    for (const [key, rec] of Object.entries(records)) {
      const existing = state[key];
      if (options.mode === "overwrite") {
        if (existing && existing.startedAt !== null) { conflicts++; conflictKeys.push(key); continue; }
        state[key] = { startedAt: rec.startedAt ?? null, finishedAt: rec.finishedAt ?? null, pauses: rec.pauses ?? [], statusRaw: rec.statusRaw ?? null } as TimedTicketRecord;
        imported++;
      } else {
        if (existing && existing.startedAt !== null) { conflicts++; conflictKeys.push(key); continue; }
        if (rec.startedAt !== null && existing) { conflicts++; conflictKeys.push(key); continue; }
        state[key] = { ...(existing ?? {}), ...rec } as TimedTicketRecord;
        imported++;
      }
    }
    if (conflicts > 0) {
      return makeConflict("conflict", `${conflicts} record(s) conflict during import`);
    }
    await writeState(inst.ledgerRoot, state);
    return { ok: true, data: { imported, skipped, conflicts } };
  };

  const resolveFn = async (ref: TR): Promise<LedgerResult<ResolvedTicketKey>> =>
    resolveRef(inst.ledgerRoot, inst.ticketSourceRoot, ref);

  const readFn = async (ref: TR): Promise<LedgerResult<TimedTicketRecord | undefined> | LedgerConflict> => {
    try {
      const state = readState(inst.ledgerRoot);
      const key = timeRecordKey(ref.feature, ref.ticket);
      const record = state[key];
      if (!record) return { ok: true, data: undefined };
      return { ok: true, data: record };
    } catch (e) {
      if ((e as LedgerConflict).code === "corrupt") return e as LedgerConflict;
      return makeConflict("corrupt", "Failed to read record");
    }
  };

  const readAllFn = async (): Promise<LedgerResult<Record<string, TimedTicketRecord>> | LedgerConflict> => {
    try {
      const state = readState(inst.ledgerRoot);
      return { ok: true, data: state };
    } catch (e) {
      if ((e as LedgerConflict).code === "corrupt") return e as LedgerConflict;
      return makeConflict("corrupt", "Failed to read all records");
    }
  };

  const hasTimeRecordsFn = async (): Promise<LedgerResult<boolean> | LedgerConflict> => {
    try {
      const state = readState(inst.ledgerRoot);
      return { ok: true, data: Object.keys(state).length > 0 };
    } catch (e) {
      if ((e as LedgerConflict).code === "corrupt") return e as LedgerConflict;
      return makeConflict("corrupt", "Failed to validate records");
    }
  };

  const replaceOpenFeaturesFn = async (features: Feature[]): Promise<LedgerResult | LedgerConflict> => {
    const currentHash = await hashFile(statePath(inst.ledgerRoot));
    const newContent = JSON.stringify({ version: 2, updatedAt: new Date().toISOString(), tickets: {} }, null, 2);
    const newHash = createHash("sha256").update(newContent).digest("hex");
    if (currentHash === newHash) return { ok: true, data: undefined };
    return await casWrite(inst.ledgerRoot, statePath(inst.ledgerRoot), newContent);
  };

  return {
    start, pause, resume, end, cancel, drop, reopen,
    batchDrop, importLegacy,
    resolve: resolveFn, read: readFn, readAll: readAllFn, hasTimeRecords: hasTimeRecordsFn, replaceOpenFeatures: replaceOpenFeaturesFn,
    timeRecordKey, applyTimeRecords,
  };
}
