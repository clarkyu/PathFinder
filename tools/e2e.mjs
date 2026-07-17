/**
 * 真实浏览器 E2E + 截图（Chromium via Playwright）
 * 用法：node tools/e2e.mjs
 * 产物：/tmp 场景截图（light/dark 双主题）+ 终端 PASS/FAIL 摘要
 * 检查：控制台错误、页面横向溢出、核心旅程可走通
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = process.env.E2E_OUT || "/tmp/pf-screens";
const PORT = 8123;
const BASE = `http://127.0.0.1:${PORT}`;
mkdirSync(OUT, { recursive: true });

const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: ROOT, stdio: "ignore" });
async function waitServer() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(BASE + "/index.html"); if (r.ok) return; } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error("http.server 未就绪");
}

const results = [];
const consoleErrors = [];
function check(name, ok, extra = "") {
  results.push((ok ? "✓ " : "✗ ") + name + (extra ? " — " + extra : ""));
  if (!ok) process.exitCode = 1;
}

async function launch() {
  try { return await chromium.launch(); }
  catch { return await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); }
}

async function settle(page) { await page.waitForTimeout(750); } // 等入场动画与 toast 稳定
async function noOverflow(page, name) {
  const over = await page.evaluate(() =>
    document.scrollingElement.scrollWidth - window.innerWidth);
  check(`无横向溢出：${name}`, over <= 1, over > 1 ? `超出 ${over}px` : "");
}
async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
}

try {
  await waitServer();
  const browser = await launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: "light",
  });
  const page = await ctx.newPage();
  page.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", e => consoleErrors.push(String(e)));

  /* ---- 开场定向 ---- */
  await page.goto(BASE + "/#/now");
  await page.waitForSelector(".ob-card", { timeout: 8000 });
  await shot(page, "01-onboarding");
  await page.click('[data-act="ob-persona"][data-v="student"]');
  await page.click('[data-act="ob-phase"][data-v="before"]');
  await page.click('[data-act="ob-start"]');
  await page.waitForSelector(".next-hero", { timeout: 5000 });
  check("开场定向可走通", true);
  await page.waitForTimeout(2300); // 等欢迎 toast 淡出
  await shot(page, "02-now-light");
  await noOverflow(page, "此刻");

  /* ---- 探索网格 ---- */
  await page.goto(BASE + "/#/compass");
  await page.waitForSelector(".grid2");
  await settle(page);
  await shot(page, "03-compass-empty");
  await noOverflow(page, "探索");

  /* ---- 测评：答满 48 题 ---- */
  await page.goto(BASE + "/#/compass/quiz");
  await page.click('[data-act="riasec-start"]');
  await page.waitForSelector(".scale-btn");
  await settle(page);
  await shot(page, "04-quiz");
  for (let i = 0; i < 48; i++) {
    const btns = page.locator('[data-act="riasec-answer"]');
    if (await btns.count() === 0) break;
    await btns.nth(i % 3).click();
  }
  await page.waitForSelector(".code-row", { timeout: 5000 });
  check("48 题走通出结果", true);
  await page.waitForTimeout(2300); // 等完成 toast 淡出
  const radar = await page.evaluate(() => {
    const r = document.querySelector("svg.radar");
    if (!r) return null;
    const b = r.getBoundingClientRect();
    return { w: Math.round(b.width), h: Math.round(b.height) };
  });
  check("雷达图真实渲染尺寸正常", !!radar && radar.h > 200 && radar.w > 200,
    radar ? `${radar.w}×${radar.h}` : "不存在");
  await shot(page, "05-result-light");
  await noOverflow(page, "测评结果");

  /* ---- 决策：浮层添加方向 ---- */
  await page.goto(BASE + "/#/chart");
  await page.click('[data-act="sheet-open"][data-sheet="cand"]');
  await page.waitForSelector("#cand-school");
  await settle(page);
  await shot(page, "06-sheet");
  await page.fill("#cand-school", "华中科技大学");
  await page.fill("#cand-major", "计算机大类");
  await page.fill("#cand-rank", "30000");
  await page.click('[data-act="cand-add"]');
  await page.click('[data-act="sheet-open"][data-sheet="cand"]');
  await page.fill("#cand-school", "武汉理工大学");
  await page.fill("#cand-major", "车辆工程");
  await page.click('[data-act="cand-add"]');
  await page.waitForSelector(".rank-row");
  check("方向池添加走通", true);
  await settle(page);
  await shot(page, "07-chart-pool");
  await noOverflow(page, "方向池");

  /* ---- 位次定位 ---- */
  await page.goto(BASE + "/#/chart/rank");
  await page.fill('[data-rank="mine"]', "20000");
  await page.dispatchEvent('[data-rank="mine"]', "change");
  await page.waitForSelector(".rank-row");
  await settle(page);
  await shot(page, "08-rank");
  await noOverflow(page, "位次定位");

  /* ---- 选科 ---- */
  await page.goto(BASE + "/#/more/subjects");
  for (const s of ["物理", "化学", "生物"]) {
    await page.click(`[data-act="subj-toggle"][data-v="${s}"]`);
  }
  await page.waitForSelector(".next-hero");
  await settle(page);
  await shot(page, "09-subjects");
  await noOverflow(page, "选科参考");

  /* ---- 反馈浮层 ---- */
  await page.goto(BASE + "/#/more");
  await page.click('[data-sheet="fb"]');
  await page.waitForSelector("#fb-text");
  await settle(page);
  await shot(page, "10-feedback");

  /* ---- 深色模式（复用登录态） ---- */
  const state = await ctx.storageState();
  const dark = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
    storageState: state,
  });
  const dp = await dark.newPage();
  dp.on("console", m => { if (m.type() === "error") consoleErrors.push("[dark] " + m.text()); });
  dp.on("pageerror", e => consoleErrors.push("[dark] " + String(e)));
  // localStorage 不在 storageState 的 origins 里时手动补一份
  await dp.goto(BASE + "/#/now");
  const hasProfile = await dp.evaluate(() => !!localStorage.getItem("pathfinder.v1"));
  if (!hasProfile) {
    const data = await page.evaluate(() => localStorage.getItem("pathfinder.v1"));
    await dp.evaluate(d => localStorage.setItem("pathfinder.v1", d), data);
    await dp.reload();
  }
  await dp.waitForSelector(".next-hero", { timeout: 5000 });
  await settle(dp);
  await shot(dp, "11-now-dark");
  await noOverflow(dp, "此刻(dark)");
  await dp.goto(BASE + "/#/compass/quiz");
  await dp.waitForSelector(".code-row");
  await settle(dp);
  await shot(dp, "12-result-dark");
  await dp.goto(BASE + "/#/chart");
  await dp.waitForSelector(".rank-row");
  await settle(dp);
  await shot(dp, "13-chart-dark");
  await noOverflow(dp, "方向池(dark)");
  check("深色模式三页渲染", true);

  await browser.close();

  const realErrors = consoleErrors.filter(t => !/favicon|manifest.*401/i.test(t));
  check("无控制台错误", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));

} catch (e) {
  check("E2E 执行", false, String(e).slice(0, 200));
} finally {
  server.kill();
}

console.log(results.join("\n"));
console.log(`\n截图目录：${OUT}`);
if (process.exitCode) { console.error("E2E 存在失败项"); process.exit(1); }
console.log("E2E 全部通过 🎉");
