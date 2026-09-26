import { writeFileSync } from "node:fs";
import { svgToPng } from "../src/raster.js";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120" width="400" height="120"><rect width="400" height="120" fill="#fff"/><text x="20" y="50" font-family="PS Comic" font-weight="700" font-size="28">Hello, Swallow!</text><text x="20" y="100" font-family="PS Bangers" font-size="36">KRAK!</text></svg>`;
writeFileSync(process.argv[2] ?? "/tmp/raster-smoke.png", svgToPng(svg, { width: 800 }));
console.log("ok");
