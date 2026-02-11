// web/build.ts

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as esbuild from "esbuild";

const watchMode = process.argv.includes("--watch");

/** Assemble the single-file HTML output from esbuild result + static assets. */
function assemble(result: esbuild.BuildResult): void {
  const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const css = readFileSync("web/styles.css", "utf-8");
  const html = readFileSync("web/index.html", "utf-8");
  const output = html
    // Use function replacers so `$` sequences in minified JS/CSS are not treated
    // as special replacement tokens by String.prototype.replace.
    .replace("/* __INJECTED_CSS__ */", () => css)
    .replace("/* __INJECTED_JS__ */", () => js);

  // Build-time sanity checks
  const scriptOpen = output.indexOf("<script>");
  const firstClose = output.toLowerCase().indexOf("</script>", scriptOpen);
  const secondClose = output.toLowerCase().indexOf("</script>", firstClose + 1);
  if (secondClose !== -1) {
    throw new Error(
      "Build error: HTML contains multiple </script> tags — minified JS likely corrupted",
    );
  }
  if (!output.includes('"DM Sans"')) {
    throw new Error("Build error: missing DM Sans font reference");
  }
  if (!output.includes('href="/favicon.png"')) {
    throw new Error("Build error: missing favicon link");
  }

  mkdirSync("public", { recursive: true });
  writeFileSync("public/chunker.html", output);
  console.log(`Built public/chunker.html (${output.length} bytes)`);

  // Copy favicon for static asset serving
  copyFileSync("web/assets/favicon-64.png", "public/favicon.png");
}

async function build() {
  const buildOptions: esbuild.BuildOptions = {
    entryPoints: ["web/app.ts"],
    bundle: true,
    minify: true,
    format: "iife",
    target: ["es2022"],
    loader: { ".md": "text" },
    write: false,
  };

  if (watchMode) {
    const ctx = await esbuild.context({
      ...buildOptions,
      plugins: [
        {
          name: "rebuild-notify",
          setup(build) {
            build.onEnd((result) => {
              if (result.errors.length === 0) {
                assemble(result);
                console.log(`[watch] Rebuilt at ${new Date().toLocaleTimeString()}`);
              }
            });
          },
        },
      ],
    });
    // Initial build + start watching
    await ctx.rebuild();
    await ctx.watch();
    console.log("[watch] Watching web/ for changes...");
  } else {
    const result = await esbuild.build(buildOptions);
    assemble(result);
    console.log("Copied public/favicon.png");
  }
}

build();
