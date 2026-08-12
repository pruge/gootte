import { resolve } from "node:path";
import { defaultPlanDataDir, defaultProjectRoots } from "@gootte/core-io";
import { CliError } from "./args";
import { dbMigrateText, discoverText, nextText } from "./commands";

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
      "  next        <프로젝트>  — 아직 없다(05 가 새 규칙으로 다시 쓴다)",
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
      case "next":
        process.stdout.write(nextText(rest) + "\n");
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
