import { build, context } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const watch = process.argv.includes("--watch");
const root = process.cwd();
const outdir = path.join(root, "dist");

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await cp(path.join(root, "public"), outdir, { recursive: true });
await cp(path.join(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"), path.join(outdir, "pdf.worker.min.mjs"));

const sharedOptions = {
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

const coreOptions = {
  ...sharedOptions,
  entryPoints: {
    "service-worker": "src/background/service-worker.ts",
    "page-agent": "src/content/page-agent.ts",
    sidepanel: "src/ui/sidepanel.ts"
  },
  splitting: false
};

const optionsPageOptions = {
  ...sharedOptions,
  entryPoints: { options: "src/ui/options.ts" },
  splitting: true,
  chunkNames: "chunks/[name]-[hash]"
};

if (watch) {
  const coreContext = await context(coreOptions);
  const optionsContext = await context(optionsPageOptions);
  await Promise.all([coreContext.watch(), optionsContext.watch()]);
  console.log("Watching LocalApply sources…");
} else {
  await Promise.all([build(coreOptions), build(optionsPageOptions)]);
}
