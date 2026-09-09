import { resolve } from "node:path";
import { defaultPlanDataDir, defaultProjectRoots } from "@gootte/core-io";
import { CliError } from "./args";
import { boardText, dbMigrateText, discoverText, featureStateText, nextText, pendingText, stepClearText, stepText, workingText } from "./commands";
import { runTimeCommand } from "./time";
import { migrateTime } from "./migrate-time";

/** 계획 저장 자리 — env `GOOTTE_DATA_DIR` 로 덮어쓴다(기계마다 다를 수 있다, `GOOTTE_ROOTS`·`GOOTTE_TREEHOUSE` 와 같은 관례). */
function planDataDir(): string {
  return process.env.GOOTTE_DATA_DIR?.trim() || defaultPlanDataDir();
}

function usage(): number {
  process.stderr.write(
    [
      "usage: gootte <command> ...",
      "  discover [roots...]",
      "  db migrate  — 계획 DB(~/.gootte/plan.db) 를 지금 스키마로 올린다(멱등)",
      "  step        <프로젝트> <기능>/<티켓> <N>  — 단계를 매긴다",
      "  step --clear <프로젝트> <기능>/<티켓>      — 단계를 뗀다",
      "  board       <프로젝트>  — 다섯 칸 현황을 읽는다(읽기 전용)",
      "  status      <프로젝트> <기능>  — 기능의 모든 티켓 상태",
      "  next        <프로젝트>  — 작업 대상의 표시 1단계 티켓만 말한다",
      "  working     <프로젝트>  — 처리중인 티켓 목록(기능 + 티켓)",
      "  pending     <프로젝트>  — 아직 대기중인 티켓 목록(기능 + 티켓)",
      "  migrate     [--dry-run] <프로젝트>  — 티켓 시간·상태 기록을 state.json v2 로 이관한다",
      "",
    ].join("\n"),
  );
  return 1;
}

function run(argv: string[]): number {
  const [cmd, ...rest] = argv;
  try {
    switch (cmd) {
      case "discover": {
        const targets =
          rest.length > 0 ? rest.map((r) => resolve(r)) : [process.cwd(), ...defaultProjectRoots()];
        process.stdout.write(discoverText(targets) + "\n");
        return 0;
      }
      case "db": {
        const [sub] = rest;
        if (sub === "migrate") {
          process.stdout.write(dbMigrateText(planDataDir()) + "\n");
          return 0;
        }
        return usage();
      }
      case "step": {
        const [first, ...more] = rest;
        process.stdout.write(
          (first === "--clear" ? stepClearText(more, planDataDir()) : stepText(rest, planDataDir())) + "\n",
        );
        return 0;
      }
      case "board":
        process.stdout.write(boardText(rest, planDataDir()) + "\n");
        return 0;
      case "next":
        process.stdout.write(nextText(rest, planDataDir()) + "\n");
        return 0;
      case "working":
        process.stdout.write(workingText(rest, planDataDir()) + "\n");
        return 0;
      case "pending":
        process.stdout.write(pendingText(rest, planDataDir()) + "\n");
        return 0;
      case "time": {
        // state.json 모드의 시간 기록(T05) — bin/gootte 가 위임한다.
        process.stdout.write(runTimeCommand(rest) + "\n");
        return 0;
      }
      case "migrate":
      case "migrate-time": {
        // MD Time:/Status: 줄 → state.json v2 레코드(T06, 캡틴 지시 2026-09-09: `gootte migrate
        // <프로젝트>`). MD 줄은 삭제하지 않는다. `migrate-time` 은 옛 이름 별칭이다.
        const report = migrateTime(rest);
        process.stdout.write(
          [
            `${report.dryRun ? "[dry-run] " : ""}${report.project} 이관: 검사 ${report.scanned} · 기록 ${report.migrated} · 생략(무기록) ${report.skipped} · 사본병합 ${report.multiCopy}`,
            ...report.details,
            "",
          ].join("\n"),
        );
        return 0;
      }
      case "feature": {
        const [sub, ...more] = rest;
        if (sub === "state") {
          process.stdout.write(featureStateText(more, planDataDir()) + "\n");
          return 0;
        }
        return usage();
      }
      case "status": {
        process.stdout.write(featureStateText(rest, planDataDir()) + "\n");
        return 0;
      }
      default:
        return usage();
    }
  } catch (err) {
    if (err instanceof CliError) {
      process.stderr.write(`${err.message}\n`);
      return 1;
    }
    throw err;
  }
}

process.exit(run(process.argv.slice(2)));
