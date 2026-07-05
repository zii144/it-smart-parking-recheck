// Generates real, scannable QR code PNGs for the demo codes wired to
// backend/app/seed.py's QR_DEMO_CODES, so the camera-based scanner in
// src/components/QRScan.jsx can actually be tested with a phone/webcam
// instead of only through the on-screen demo-code buttons.
//
// Run with: npm run generate-demo-qr
// Output:   public/demo-qr/<code>.png (committed - regenerate only if the
//           demo code list below drifts from seed.py)
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import QRCode from "qrcode";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "public", "demo-qr");

// Keep in sync with backend/app/seed.py QR_DEMO_CODES and
// src/components/QRScan.jsx DEMO_CODES.
const CODES = [
  { code: "QR-A1001", desc: "成功讀取・符合規定・會觸發重複警示" },
  { code: "QR-A1002", desc: "成功讀取・開單逾時" },
  { code: "QR-A1003", desc: "成功讀取・資料異常" },
  { code: "QR-A1004", desc: "成功讀取・符合規定・無重複" },
  { code: "QR-A1005", desc: "QR 解碼成功但查詢頁讀取失敗" },
  { code: "QR-BAD-SCAN", desc: "模擬掃描失敗（無法辨識的 QR）" },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const manifest = [];

  for (const { code, desc } of CODES) {
    const filename = `${code}.png`;
    const filePath = path.join(OUT_DIR, filename);
    await QRCode.toFile(filePath, code, {
      type: "png",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320,
    });
    manifest.push({ code, desc, file: `demo-qr/${filename}` });
    console.log(`wrote ${filePath}`);
  }

  await writeFile(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n"
  );
  console.log(`wrote ${path.join(OUT_DIR, "manifest.json")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
