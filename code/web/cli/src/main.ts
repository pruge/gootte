import { resolve } from "node:path";
import { defaultPlanDataDir, defaultProjectRoots } from "@gootte/core-io";
import { CliError } from "./args";
import { boardText, dbMigrateText, discoverText, endText, nextText, stepClearText, stepText, startText } from "./commands";

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
      "  next        <프로젝트>  — 작업 대상의 표시 1단계 티켓만 말한다",
      "  start       <프로젝트> <기능> <티켓>  — 티켓 시작 시각 기록",
      "  end         <프로젝트> <기능> <티켓>  — 티켓 완료 시각 기록",
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
      case "start":
        process.stdout.write(startText(rest, planDataDir()) + "\n");
        return 0;
      case "end":
        process.stdout.write(endText(rest, planDataDir()) + "\n");
        return 0;
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
