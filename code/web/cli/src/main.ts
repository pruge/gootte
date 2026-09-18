import { resolve } from "node:path";
import { defaultPlanDataDir, defaultProjectRoots } from "@gootte/core-io";
import { CliError } from "./args";
import { boardText, dbMigrateText, discoverText, featureStateText, frontierText, memoMigrateText, memoText, nextText, statusText, stepClearText, stepText } from "./commands";
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
      "  status      [기능] [--working|--pending]  — 현황(state 별칭). 기능을 주면 그 기능만, 안 주면 작업중/대기중 + 기능별 남은 카드",
      "  next        <프로젝트>  — 작업 대상의 표시 1단계 티켓만 말한다",
  "  frontier    [프로젝트]  — 착수 가능(대기+차단 없음+임자 없음) 티켓 목록(기능 + 티켓 + 제목)",
      "  memo        [--done|--undone]  — 지금 프로젝트 메모를 읽는다(세션용. 프로젝트 인자 없음)",
      "  memo migrate [프로젝트…] [--purge] — central 메모를 <프로젝트>/.gootte/memo.json 으로 옮긴다(읽기는 이미 그 파일을 본다)",
      "  migrate     [--dry-run] [--strip] <프로젝트>  — 티켓 시간·상태 기록을 state.json v2 로 이관한다",
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

      case "frontier":
        process.stdout.write(frontierText(rest, planDataDir()) + "\n");
        return 0;
      case "memo": {
        // 하위 명령 `migrate`(memos-live-with-the-project/T01) 와 읽기를 여기서 갈라 넘긴다.
        // 🔴 읽기(`memoText`) 는 T02 부터 **`<메인 프로젝트>/.gootte/memo.json`** 을 본다 — central 을
        // 읽는 폴백은 없다(이중 원장 방지). 계획 저장소(`planDataDir()`)는 이관 명령의 원본 좌표로만 산다.
        const [sub, ...more] = rest;
        if (sub === "migrate") {
          process.stdout.write(memoMigrateText(more, planDataDir()) + "\n");
          return 0;
        }
        // 지금 프로젝트(cwd) 메모만 — 인자 규격은 commands.memoText 가 잠근다(T01).
        // 🔴 `dataDir` 를 넘기지 않는다: 읽기 경로에 중앙 좌표가 들어서도 될 자리는 없다(T02).
        process.stdout.write(memoText(rest, process.cwd()) + "\n");
        return 0;
      }
      case "time":
      case "start":
      case "pause":
      case "resume":
      case "end":
      case "reset":
      case "cancel":
      case "drop": {
        // state.json 모드의 시간 기록 — `time <cmd> …` 형태와 bare 동사(`gootte start …`)
        // 둘 다 받는다. 후자는 npm 설치본에서 런처 없이 직접 칠 때 쓴다(bin/gootte 도 같은 곳으로 낸다).
        const args = cmd === "time" ? rest : [cmd, ...rest];
        process.stdout.write(runTimeCommand(args) + "\n");
        return 0;
      }
      case "migrate":
      case "migrate-time": {
        // MD Time:/Status: 줄 → state.json v2 레코드. `--strip` 을 주면 이관 뒤
        // 메인 경로 티켓 파일의 MD 줄까지 지운다(레코드 백업 확보가 전제). `migrate-time` 은 옛 이름 별칭이다.
        const report = migrateTime(rest);
        const stripBits = report.strip ? ` · 정리 ${report.strippedFiles}파일/${report.strippedLines}줄` : "";
        process.stdout.write(
          [
            `${report.dryRun ? "[dry-run] " : ""}${report.project} 이관: 검사 ${report.scanned} · 기록 ${report.migrated} · 생략(무기록) ${report.skipped} · 사본병합 ${report.multiCopy}${stripBits}`,
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
      case "status":
      case "state": {
        process.stdout.write(statusText(rest, planDataDir()) + "\n");
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
