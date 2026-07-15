import { build, context } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const watch = process.argv.includes("--watch");
const root = process.cwd();
const outdir = path.join(root, "dist");

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await cp(path.join(root, "public"), outdir, { recursive: true });

const options = {
  entryPoints: {
    "service-worker": "src/background/service-worker.ts",
    "page-agent": "src/content/page-agent.ts",
    sidepanel: "src/ui/sidepanel.ts",
    options: "src/ui/options.ts"
  },
  outdir,
  bundle: true,
  format: "esm",
  target: "chrome116",
  platform: "browser",
  sourcemap: false,
  minify: !watch,
  legalComments: "none",
  logLevel: "info"
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("Watching LocalApply sources…");
} else {
  await build(options);
}
