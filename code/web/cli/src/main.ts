import { resolve } from "node:path";
import { defaultPlanDataDir, defaultProjectRoots } from "@gootte/core-io";
import { CliError } from "./args";
import {
  discoverText,
  dropText,
  extraAddText,
  extraDoneText,
  extraListText,
  extraPruneText,
  nextText,
  orderText,
  setFeatureText,
  setTicketText,
} from "./commands";

/** 계획 저장 자리 — env `GOOTTE_DATA_DIR` 로 덮어쓴다(기계마다 다를 수 있다, `GOOTTE_ROOTS`·`GOOTTE_TREEHOUSE` 와 같은 관례). */
function planDataDir(): string {
  return process.env.GOOTTE_DATA_DIR?.trim() || defaultPlanDataDir();
}

function usage(): number {
  process.stderr.write(
    [
      "usage: gootte <command> ...",
      "  discover [roots...]",
      '  set         <프로젝트> <기능>/<번호> [--step n] [--kind 계획|틈틈이|순서밖] --why "…"',
      '  set-feature <프로젝트> <기능> --track <트랙> --rank <n> --why "…"',
      "  drop        <프로젝트> <기능>[/<번호>]",
      "  order       <프로젝트> [--json]",
      "  next        <프로젝트> [--json]",
      '  extra add   <프로젝트> <기능>/<번호> "…" [--who 이름]',
      "  extra       [프로젝트] [--all] [--json]   (미처리만 — 없으면 침묵)",
      "  extra done  <id>",
      "  extra prune --before <날짜>",
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
      case "set":
        process.stdout.write(setTicketText(rest, planDataDir()) + "\n");
        return 0;
      case "set-feature":
        process.stdout.write(setFeatureText(rest, planDataDir()) + "\n");
        return 0;
      case "drop":
        process.stdout.write(dropText(rest, planDataDir()) + "\n");
        return 0;
      case "order":
        process.stdout.write(orderText(rest, planDataDir()) + "\n");
        return 0;
      case "next":
        process.stdout.write(nextText(rest, planDataDir()) + "\n");
        return 0;
      case "extra": {
        const [sub, ...subRest] = rest;
        if (sub === "add") {
          process.stdout.write(extraAddText(subRest, planDataDir()) + "\n");
          return 0;
        }
        if (sub === "done") {
          process.stdout.write(extraDoneText(subRest, planDataDir()) + "\n");
          return 0;
        }
        if (sub === "prune") {
          process.stdout.write(extraPruneText(subRest, planDataDir()) + "\n");
          return 0;
        }
        // 미처리 없음 → 빈 문자열 → 아무것도 안 찍는다(ask 와 같은 침묵 규약).
        const text = extraListText(rest, planDataDir());
        if (text) process.stdout.write(text + "\n");
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
