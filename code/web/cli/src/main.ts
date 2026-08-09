import { resolve } from "node:path";
import { defaultProjectRoots } from "@gootte/core-io";
import { discoverText } from "./commands";

function usage(): number {
  process.stderr.write("usage: gootte discover [roots...]\n");
  return 1;
}

function run(argv: string[]): number {
  if (argv[0] !== "discover") return usage();
  const roots = argv.slice(1);
  const targets =
    roots.length > 0 ? roots.map((r) => resolve(r)) : [process.cwd(), ...defaultProjectRoots()];
  process.stdout.write(discoverText(targets) + "\n");
  return 0;
}

process.exit(run(process.argv.slice(2)));
