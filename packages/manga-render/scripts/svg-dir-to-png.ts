/** Rasterise every page-*.svg in a directory to PNG (review helper). Usage: tsx scripts/svg-dir-to-png.ts DIR [width] */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { svgToPng } from "../src/raster.js";
const dir = process.argv[2];
const width = Number(process.argv[3] ?? "1000");
for (const file of readdirSync(dir).filter((f) => /^page-\d+\.svg$/.test(f))) {
  const svg = readFileSync(path.join(dir, file), "utf8");
  if (!svg) continue;
  writeFileSync(path.join(dir, file.replace(/\.svg$/, ".png")), svgToPng(svg, { width }));
}
console.log("done");
