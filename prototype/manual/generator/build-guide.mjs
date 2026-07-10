// Renders manifest.json (produced by capture.mjs) into a self-contained,
// zh-TW visual user manual at ../guide.html.
import fs from "node:fs";
import { MANIFEST_PATH, GUIDE_PATH } from "./config.mjs";

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const dateStr = new Date(manifest.generatedAt).toLocaleString("zh-TW", {
  timeZone: "Asia/Taipei", hour12: false,
});

function clipMarkup(flow) {
  const c = flow.clip || {};
  const src = c.mp4 || c.webm;
  if (!src) return "";
  const poster = flow.poster ? ` poster="${esc(flow.poster)}"` : "";
  const gifNote = c.gif
    ? `<a class="clip-alt" href="${esc(c.gif)}" target="_blank" rel="noopener">開啟 GIF 版本 ↗</a>`
    : "";
  return `
    <figure class="clip ${flow.device}">
      <video controls muted playsinline preload="metadata"${poster} src="${esc(src)}"></video>
      <figcaption>完整流程錄影（Playwright 自動側錄）。${gifNote}</figcaption>
    </figure>`;
}

function stepMarkup(step) {
  const tip = step.tip
    ? `<p class="tip"><span class="tip-badge">提示</span>${esc(step.tip)}</p>`
    : "";
  return `
    <li class="step" id="${esc(step.flowId)}-${step.n}">
      <div class="step-media">
        <a href="${esc(step.shot)}" target="_blank" rel="noopener">
          <img loading="lazy" src="${esc(step.shot)}" alt="${esc(step.title)}">
        </a>
      </div>
      <div class="step-body">
        <div class="step-no">步驟 ${step.n}</div>
        <h3>${esc(step.title)}</h3>
        <p>${esc(step.desc)}</p>
        ${tip}
      </div>
    </li>`;
}

function flowSection(flow) {
  const steps = flow.steps.map((s) => stepMarkup({ ...s, flowId: flow.id })).join("");
  return `
  <section class="flow" id="${esc(flow.id)}">
    <header class="flow-head">
      <h2>${esc(flow.title)}</h2>
      <p class="flow-sub">${esc(flow.subtitle)}</p>
      <div class="chips">
        <span class="chip">${esc(flow.actor)}</span>
        <span class="chip chip-mono">帳號：${esc(flow.account)}</span>
        <span class="chip">${flow.steps.length} 個步驟</span>
      </div>
      <p class="flow-intro">${esc(flow.intro)}</p>
    </header>
    ${clipMarkup(flow)}
    <ol class="steps ${flow.device}">${steps}</ol>
  </section>`;
}

function tocMarkup() {
  return manifest.flows.map((flow) => `
    <div class="toc-group">
      <a class="toc-flow" href="#${esc(flow.id)}">${esc(flow.title)}</a>
      <ul>${flow.steps.map((s) =>
        `<li><a href="#${esc(flow.id)}-${s.n}">${s.n}. ${esc(s.title)}</a></li>`).join("")}</ul>
    </div>`).join("");
}

const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>停車單稽查系統 · 圖解操作手冊</title>
<style>
  :root{
    --bg:#f6f7f9; --panel:#ffffff; --ink:#1f2933; --muted:#67727e; --line:#e3e8ee;
    --brand:#e6a020; --brand-weak:#fbf1dd; --ink-strong:#12161b;
    --shadow:0 1px 3px rgba(16,24,40,.08),0 1px 2px rgba(16,24,40,.04);
    --shadow-lg:0 12px 32px rgba(16,24,40,.14); --sidebar:288px; --radius:14px;
  }
  @media (prefers-color-scheme: dark){
    :root{
      --bg:#0f1115; --panel:#171a21; --ink:#e6e9ee; --muted:#98a2b3; --line:#262b34;
      --brand:#e6a020; --brand-weak:#2a2211; --ink-strong:#fff;
      --shadow:0 1px 3px rgba(0,0,0,.5); --shadow-lg:0 14px 40px rgba(0,0,0,.55);
    }
  }
  *{box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{margin:0;background:var(--bg);color:var(--ink);line-height:1.75;font-size:16px;
    font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;}
  a{color:var(--brand);text-decoration:none}
  a:hover{text-decoration:underline}
  .wrap{display:grid;grid-template-columns:var(--sidebar) 1fr;min-height:100vh}
  nav.side{position:sticky;top:0;align-self:start;height:100vh;overflow:auto;background:var(--panel);
    border-right:1px solid var(--line);padding:22px 18px}
  nav.side .logo{font-weight:800;font-size:16px;color:var(--ink-strong);display:flex;align-items:center;gap:8px;margin-bottom:4px}
  nav.side .logo .dot{width:12px;height:12px;border-radius:4px;background:var(--brand)}
  nav.side .sub{color:var(--muted);font-size:12.5px;margin-bottom:18px}
  .toc-group{margin-bottom:16px}
  .toc-flow{display:block;font-weight:700;color:var(--ink-strong);font-size:13.5px;margin-bottom:6px}
  nav.side ul{list-style:none;margin:0;padding:0 0 0 4px;border-left:2px solid var(--line)}
  nav.side ul li a{display:block;color:var(--muted);font-size:12.5px;padding:3px 0 3px 10px}
  nav.side ul li a:hover{color:var(--brand)}
  main{padding:48px 56px 96px;max-width:1000px}
  .doc-head{border-bottom:1px solid var(--line);padding-bottom:26px;margin-bottom:14px}
  .doc-head h1{font-size:30px;margin:0 0 8px;color:var(--ink-strong);letter-spacing:-.01em}
  .doc-head p{margin:0;color:var(--muted)}
  .meta-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
  .meta{font-size:12px;color:var(--muted);background:var(--panel);border:1px solid var(--line);
    border-radius:999px;padding:4px 11px}
  .flow{margin-top:56px;scroll-margin-top:20px}
  .flow-head h2{font-size:23px;color:var(--ink-strong);margin:0 0 4px}
  .flow-sub{margin:0;color:var(--muted)}
  .chips{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}
  .chip{font-size:12.5px;background:var(--brand-weak);color:var(--brand);border-radius:999px;
    padding:4px 12px;font-weight:600}
  .chip-mono{font-family:"SF Mono",ui-monospace,Menlo,Consolas,monospace}
  .flow-intro{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--brand);
    border-radius:10px;padding:14px 16px;color:var(--ink);font-size:15px}
  figure.clip{margin:22px 0 8px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);
    padding:14px;box-shadow:var(--shadow);text-align:center}
  figure.clip video{width:100%;max-width:100%;border-radius:10px;background:#000}
  figure.clip.mobile video{max-width:390px}
  figure.clip figcaption{color:var(--muted);font-size:12.5px;margin-top:10px}
  .clip-alt{margin-left:8px}
  ol.steps{list-style:none;margin:26px 0 0;padding:0;display:flex;flex-direction:column;gap:22px}
  li.step{display:grid;grid-template-columns:minmax(0,420px) 1fr;gap:26px;align-items:start;
    background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);
    padding:18px;box-shadow:var(--shadow);scroll-margin-top:20px}
  ol.steps.mobile li.step{grid-template-columns:minmax(0,300px) 1fr}
  .step-media img{width:100%;border-radius:10px;border:1px solid var(--line);display:block;box-shadow:var(--shadow-lg)}
  .step-no{display:inline-block;font-size:12px;font-weight:700;color:var(--brand);
    background:var(--brand-weak);border-radius:999px;padding:2px 10px;margin-bottom:8px}
  .step-body h3{margin:0 0 8px;font-size:18px;color:var(--ink-strong)}
  .step-body p{margin:0 0 10px}
  .tip{background:var(--brand-weak);border-radius:9px;padding:9px 12px;font-size:13.5px;color:var(--ink);margin:10px 0 0}
  .tip-badge{display:inline-block;font-weight:700;color:var(--brand);margin-right:8px;font-size:12px;
    border:1px solid var(--brand);border-radius:5px;padding:0 6px}
  footer{margin-top:60px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:12.5px}
  @media (max-width:900px){
    .wrap{grid-template-columns:1fr}
    nav.side{position:static;height:auto;border-right:none;border-bottom:1px solid var(--line)}
    main{padding:28px 20px 64px}
    li.step,ol.steps.mobile li.step{grid-template-columns:1fr}
  }
  @media print{
    nav.side{display:none} .wrap{display:block} main{max-width:none;padding:0}
    li.step{break-inside:avoid;box-shadow:none} figure.clip{display:none}
  }
</style>
</head>
<body>
<div class="wrap">
  <nav class="side">
    <div class="logo"><span class="dot"></span>操作手冊</div>
    <div class="sub">停車單稽查系統</div>
    <a class="toc-flow" href="#top">封面與說明</a>
    ${tocMarkup()}
  </nav>
  <main>
    <div class="doc-head" id="top">
      <h1>停車單稽查系統 · 圖解操作手冊</h1>
      <p>逐步圖解稽查員 APP 與後台管理系統的完整操作流程。本手冊之螢幕截圖與流程錄影，皆由 Playwright 實際驅動應用程式自動產生。</p>
      <div class="meta-row">
        <span class="meta">產生時間：${esc(dateStr)}</span>
        <span class="meta">流程數：${manifest.flows.length}</span>
        <span class="meta">步驟總數：${manifest.flows.reduce((a, f) => a + f.steps.length, 0)}</span>
        <span class="meta">語言：繁體中文（zh-TW）</span>
      </div>
    </div>
    ${manifest.flows.map(flowSection).join("")}
    <footer>
      本手冊由 <code>prototype/manual/generator</code> 以 Playwright 自動截圖 / 側錄後產生。
      重新產生：<code>prototype/manual/generate.sh</code>。
    </footer>
  </main>
</div>
</body>
</html>`;

fs.writeFileSync(GUIDE_PATH, html);
console.log(`✓ Guide written: ${GUIDE_PATH}`);
console.log(`  ${manifest.flows.length} flows, ${manifest.flows.reduce((a, f) => a + f.steps.length, 0)} steps`);
