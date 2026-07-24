import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { planText, lineageText, writeDigest, discoverText } from "./commands";

function usage(): number {
  process.stderr.write("usage: gootte <plan|lineage|digest|discover> [path]\n");
  return 1;
}

function run(argv: string[]): number {
  const cmd = argv[0];
  const arg = argv[1];
  switch (cmd) {
    case "plan": {
      if (!arg) return usage();
      process.stdout.write(planText(resolve(arg)));
      return 0;
    }
    case "lineage": {
      if (!arg) return usage();
      process.stdout.write(lineageText(resolve(arg)));
      return 0;
    }
    case "digest": {
      if (!arg) return usage();
      process.stdout.write(`digest → ${writeDigest(resolve(arg))}\n`);
      return 0;
    }
    case "discover": {
      const roots = argv.slice(1);
      const targets =
        roots.length > 0 ? roots.map((r) => resolve(r)) : [process.cwd(), join(homedir(), "Documents")];
      process.stdout.write(discoverText(targets) + "\n");
      return 0;
    }
    default:
      return usage();
  }
}

process.exit(run(process.argv.slice(2)));
