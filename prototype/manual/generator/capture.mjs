// Drives every flow with Playwright, capturing a screenshot per step and a
// video per flow, then emits manifest.json for build-guide.mjs to render.
//
// Prereqs: the app must be running (frontend at MANUAL_BASE_URL, backend at
// :8000) with demo data seeded. See ../generate.sh.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { flows } from "./flows.mjs";
import {
  BASE_URL, SHOTS_DIR, CLIPS_DIR, MANIFEST_PATH, MOBILE, DESKTOP, GEO,
} from "./config.mjs";

const ensureDir = (d) => fs.mkdirSync(d, { recursive: true });
const pad = (n) => String(n).padStart(2, "0");

function hasFfmpeg() {
  try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; }
  catch { return false; }
}
const FFMPEG = hasFfmpeg();

function toMp4(webm, mp4) {
  execFileSync("ffmpeg", [
    "-y", "-i", webm,
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-movflags", "+faststart", "-pix_fmt", "yuv420p", "-an", mp4,
  ], { stdio: "ignore" });
}
function toGif(webm, gif) {
  execFileSync("ffmpeg", [
    "-y", "-i", webm,
    "-vf", "fps=8,scale=400:-2:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse",
    gif,
  ], { stdio: "ignore" });
}

async function run() {
  ensureDir(SHOTS_DIR);
  ensureDir(CLIPS_DIR);
  // Start clean so renamed/removed steps don't leave orphan files behind.
  for (const f of fs.readdirSync(SHOTS_DIR)) fs.rmSync(path.join(SHOTS_DIR, f), { force: true });
  for (const f of fs.readdirSync(CLIPS_DIR)) {
    if (f.endsWith(".webm")) fs.rmSync(path.join(CLIPS_DIR, f), { force: true });
  }
  const tmpVid = path.join(CLIPS_DIR, "_tmp");
  ensureDir(tmpVid);

  const browser = await chromium.launch();
  const manifest = { generatedAt: new Date().toISOString(), baseUrl: BASE_URL, flows: [] };

  for (const flow of flows) {
    console.log(`\n▶ ${flow.id} — ${flow.title}`);
    const viewport = flow.device === "mobile" ? MOBILE : DESKTOP;
    const context = await browser.newContext({
      viewport,
      // Phone screens are narrow, so 2x stays small and crisp; the desktop
      // canvas is already wide, so 1x keeps file sizes reasonable.
      deviceScaleFactor: flow.device === "mobile" ? 2 : 1,
      locale: "zh-TW",
      timezoneId: "Asia/Taipei",
      geolocation: GEO,
      permissions: ["geolocation"],
      colorScheme: "light",
      reducedMotion: "reduce",
      recordVideo: { dir: tmpVid, size: viewport },
    });
    const page = await context.newPage();

    const steps = [];
    let n = 0;
    for (const step of flow.steps) {
      n += 1;
      await step.arrive(page);
      await page.waitForTimeout(500); // settle animations/fonts before the shot
      const file = `${flow.id}-${pad(n)}-${step.key}.jpg`;
      await page.screenshot({ path: path.join(SHOTS_DIR, file), type: "jpeg", quality: 82 });
      steps.push({
        n, key: step.key, title: step.title, desc: step.desc,
        tip: step.tip || null, shot: `shots/${file}`,
      });
      console.log(`  ✓ ${pad(n)} ${step.key}`);
    }

    // Refresh the poster (used by clips.html and the guide's <video>) from the
    // first step screenshot so it always matches the current UI.
    const posterRel = `clips/${flow.id}_poster.jpg`;
    if (steps[0]) {
      fs.copyFileSync(path.join(SHOTS_DIR, path.basename(steps[0].shot)),
        path.join(CLIPS_DIR, `${flow.id}_poster.jpg`));
    }

    const video = page.video();
    await context.close(); // finalizes the video file
    const clip = { poster: posterRel };
    if (video) {
      const src = await video.path();
      const webm = path.join(CLIPS_DIR, `${flow.id}.webm`);
      fs.copyFileSync(src, webm);
      if (FFMPEG) {
        try {
          toMp4(webm, path.join(CLIPS_DIR, `${flow.id}.mp4`));
          clip.mp4 = `clips/${flow.id}.mp4`;
          toGif(webm, path.join(CLIPS_DIR, `${flow.id}.gif`));
          clip.gif = `clips/${flow.id}.gif`;
          fs.rmSync(webm, { force: true }); // redundant once mp4 exists
          console.log(`  ▸ encoded ${flow.id}.mp4 + .gif`);
        } catch (e) {
          console.warn(`  ! ffmpeg encode failed for ${flow.id}: ${e.message}`);
          clip.webm = `clips/${flow.id}.webm`; // keep webm as the only playable copy
        }
      } else {
        clip.webm = `clips/${flow.id}.webm`;
      }
    }

    manifest.flows.push({
      id: flow.id, title: flow.title, subtitle: flow.subtitle,
      actor: flow.actor, account: flow.account, device: flow.device,
      intro: flow.intro, poster: steps[0]?.shot || null, clip, steps,
    });
  }

  await browser.close();
  fs.rmSync(tmpVid, { recursive: true, force: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\n✓ Manifest written: ${MANIFEST_PATH}`);
  console.log(`  ffmpeg: ${FFMPEG ? "yes (mp4+gif)" : "no (webm only)"}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
