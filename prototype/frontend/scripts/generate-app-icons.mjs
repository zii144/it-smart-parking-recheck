/**
 * Regenerate raster favicons from public/favicon.svg.
 * Run: node scripts/generate-app-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");
const svg = fs.readFileSync(path.join(publicDir, "favicon.svg"));

function writePng(filename, size) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    background: "transparent",
  });
  const png = resvg.render().asPng();
  fs.writeFileSync(path.join(publicDir, filename), png);
}

writePng("favicon-16x16.png", 16);
writePng("favicon-32x32.png", 32);
writePng("apple-touch-icon.png", 180);
writePng("android-chrome-192x192.png", 192);
writePng("android-chrome-512x512.png", 512);

console.log("Generated app icon PNGs from favicon.svg");
