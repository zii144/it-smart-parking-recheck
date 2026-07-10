// Shared paths + settings for the manual capture/build pipeline.
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url)); // .../manual/generator
export const GENERATOR_DIR = here;
export const MANUAL_DIR = path.resolve(here, ".."); // .../manual
export const SHOTS_DIR = path.join(MANUAL_DIR, "shots");
export const CLIPS_DIR = path.join(MANUAL_DIR, "clips");
export const MANIFEST_PATH = path.join(MANUAL_DIR, "manifest.json");
export const GUIDE_PATH = path.join(MANUAL_DIR, "guide.html");
export const DEMO_TICKET = path.join(here, "assets", "demo-ticket.jpg");

export const BASE_URL = process.env.MANUAL_BASE_URL || "http://localhost:5173";

// Viewports: the inspector app is phone-first; the back office is a desktop.
export const MOBILE = { width: 414, height: 896 };
export const DESKTOP = { width: 1440, height: 940 };

// Taipei, so GPS-assisted positioning resolves to a sensible spot.
export const GEO = { latitude: 25.0375, longitude: 121.5645, accuracy: 20 };
