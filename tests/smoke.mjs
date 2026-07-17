/* 冒烟测试 v2：jsdom 中加载应用，走通开场定向、推荐引擎、浮层输入与全部路由 */
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(ROOT + "/" + p, "utf8");

const html = read("index.html").replace(/<script[\s\S]*?<\/script>/g, "");
const dom = new JSDOM(html, { url: "http://localhost:8080/#/now", runScripts: "dangerously", pretendToBeVisual: true });
const { window } = dom;

window.confirm = () => true;
window.scrollTo = () => {};
const errors = [];
window.addEventListener("error", (e) => errors.push("window error: " + e.message));

for (const file of ["js/data.js", "js/store.js", "js/app.js"]) {
  const s = window.document.createElement("script");
  s.textContent = read(file);
  window.document.body.appendChild(s);
}

const doc = window.document;
const results = [];
function check(name, fn) {
  try {
    const ok = fn();
    results.push((ok ? "✓" : "✗") + " " + name);
    if (!ok) errors.push("断言失败: " + name);
  } catch (e) {
    results.push("✗ " + name + " → " + e.message);
    errors.push(name + ": " + e.message);
  }
}
function goto(hash) {
  window.location.hash = hash;
  window.dispatchEvent(new window.Event("hashchange"));
}
function click(sel, root) {
  const el = (root || doc).querySelector(sel);
  if (!el) throw new Error("找不到元素 " + sel);
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}
const text = () => doc.querySelector("#view").textContent;
const modal = () => doc.querySelector("#modal-root").textContent;

/* ---- 开场定向 ---- */
check("首次启动出现开场定向", () => modal().includes("我是考生") && modal().includes("我是家长"));
click('[data-act="ob-persona"][data-v="student"]');
check("第二步选阶段", () => modal().includes("现在到哪一步了"));
click('[data-act="ob-phase"][data-v="before"]');
check("第三步欢迎语", () => modal().includes("迷茫很正常"));
click('[data-act="ob-start"]');
check("定向完成，浮层关闭", () => modal().trim() === "");

/* ---- 此刻：推荐引擎 ---- */
check("时间线渲染（三阶段）", () => text().includes("认识自己") && text().includes("启航"));
check("下一步推荐 = 校准罗盘", () => text().includes("先把罗盘校准"));
check("次选推荐含心流", () => text().includes("记下心流时刻"));

/* ---- 探索页空状态（测评前） ---- */
goto("#/compass");
check("网格空状态文案友好", () => text().includes("未开始 · 约 6 分钟") && text().includes("建议 2–3 场") && text().includes("三种五年"));

/* ---- 浮层无障碍 ---- */
click('[data-act="sheet-open"][data-sheet="flow"]');
check("浮层带 dialog 语义", () => !!doc.querySelector('.sheet[role="dialog"][aria-modal="true"]'));
doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
check("Esc 关闭浮层", () => modal().trim() === "");

/* ---- 测评全流程 ---- */
goto("#/compass/quiz");
click('[data-act="riasec-start"]');
check("测评开始（第 1 题）", () => text().includes("第 1 / 48 题"));
for (let i = 0; i < 48; i++) {
  const btns = doc.querySelectorAll('[data-act="riasec-answer"]');
  if (!btns.length) { errors.push("第 " + (i + 1) + " 题没有作答按钮"); break; }
  btns[i % 3].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}
check("48 题答完出结果", () => text().includes("我的霍兰德代码"));
check("结果含雷达图", () => !!doc.querySelector("svg.radar"));
check("雷达图走 CSS 令牌（深色适配）", () => !!doc.querySelector(".radar .rd-data") && !!doc.querySelector(".radar .rd-grid"));
check("结果 CTA 术语统一（决策）", () => text().includes("把感兴趣的方向加进决策"));

/* ---- 测评完成后，推荐进位 ---- */
goto("#/now");
check("下一步推荐进位到心流", () => text().includes("记下心流时刻"));

/* ---- 探索汇总页 ---- */
goto("#/compass");
check("标签栏 4 个功能标签", () => {
  const tabs = doc.querySelector("#tabbar").textContent;
  return tabs.includes("此刻") && tabs.includes("探索") && tabs.includes("决策") && tabs.includes("更多");
});
check("功能导航网格（4 入口带状态）", () => {
  const t = text();
  return t.includes("兴趣测评") && t.includes("心流与成就") && t.includes("奥德赛计划") && t.includes("人物访谈") && t.includes("已完成");
});
check("探索页显示代码与雷达", () => text().includes("我的霍兰德代码") && !!doc.querySelector("svg.radar"));
check("画像速览区块", () => text().includes("画像速览"));
check("顶栏标题为功能词", () => doc.querySelector("#topbar").textContent.includes("探索 · 我是谁"));

/* ---- 浮层：记心流 ---- */
click('[data-act="sheet-open"][data-sheet="flow"]');
check("心流浮层打开", () => modal().includes("记一个心流时刻"));
doc.querySelector("#flow-activity").value = "调试机器人";
const sigs = doc.querySelectorAll(".flow-sig");
sigs[0].checked = true; sigs[1].checked = true; sigs[2].checked = true;
click('[data-act="flow-add"]');
check("添加后浮层自动关闭", () => modal().trim() === "");
check("强信号沉淀到罗盘", () => text().includes("调试机器人"));

/* ---- 心流与成就页 ---- */
goto("#/compass/flow");
check("心流页有记录与小结", () => text().includes("调试机器人") && text().includes("天赋线索小结"));
click('[data-act="sheet-open"][data-sheet="ach"]');
doc.querySelector("#ach-event").value = "机器人比赛二等奖";
doc.querySelector("#ach-pattern").value = "带队攻坚";
click('[data-act="ach-add"]');
check("成就事件已添加", () => text().includes("机器人比赛二等奖"));

/* ---- 奥德赛 ---- */
goto("#/compass/odyssey");
check("奥德赛三版本", () => text().includes("延伸版") && text().includes("突变版") && text().includes("自由版"));
const t1 = doc.querySelector('[data-od="a"][data-field="title"]');
t1.value = "工科稳步前行";
t1.dispatchEvent(new window.Event("input", { bubbles: true }));
goto("#/now");
goto("#/compass/odyssey");
check("三版对比视图出现", () => text().includes("三版对比") && text().includes("六字标题"));
check("对比含心动洞察", () => text().includes("最让你心动") && text().includes("工科稳步前行"));

/* ---- 访谈 ---- */
goto("#/compass/interview");
click('[data-act="sheet-open"][data-sheet="iv"]');
doc.querySelector("#iv-person").value = "王学长";
doc.querySelector("#iv-occ").value = "算法工程师";
click('[data-act="iv-add"]');
check("访谈对象已添加", () => text().includes("王学长"));
click(".iv-head"); // 展开访谈卡
check("访谈卡已展开", () => doc.querySelector('[data-aid^="iv-"]').classList.contains("open"));
click('[data-act="iv-status"]');
check("访谈状态切换", () => text().includes("已约"));
check("状态切换后访谈卡保持展开", () => doc.querySelector('[data-aid^="iv-"]').classList.contains("open"));

/* ---- 航海图 ---- */
goto("#/chart");
click('[data-act="sheet-open"][data-sheet="cand"]');
doc.querySelector("#cand-school").value = "华中科技大学";
doc.querySelector("#cand-major").value = "计算机大类";
click('[data-act="cand-add"]');
click('[data-act="sheet-open"][data-sheet="cand"]');
doc.querySelector("#cand-school").value = "武汉理工大学";
doc.querySelector("#cand-major").value = "车辆工程";
click('[data-act="cand-add"]');
check("方向池两个方案 + 排序", () => text().includes("华中科技大学") && text().includes("综合排序"));
// 关键回归：调整权重滑杆后，折叠面板必须保持展开
click('[data-aid="weights"] .acc-head');
check("权重面板已展开", () => doc.querySelector('[data-aid="weights"]').classList.contains("open"));
const wSlider = doc.querySelector("[data-w='interest']");
wSlider.value = "5";
wSlider.dispatchEvent(new window.Event("input", { bubbles: true }));
wSlider.dispatchEvent(new window.Event("change", { bubbles: true }));
check("调权重后面板保持展开", () => doc.querySelector('[data-aid="weights"]').classList.contains("open"));

const slider = doc.querySelector("[data-cid][data-dim='interest']");
slider.value = "9";
slider.dispatchEvent(new window.Event("input", { bubbles: true }));
slider.dispatchEvent(new window.Event("change", { bubbles: true }));
check("打分后正常渲染", () => text().includes("综合排序"));
click('[data-act="cand-tier"][data-tier="rush"]');
goto("#/chart/tier");
check("冲稳保归档生效", () => text().includes("冲 1"));
check("打印导出按钮存在", () => !!doc.querySelector('[data-act="export-print"]'));
click('[data-act="export-print"]');
check("打印导出优雅降级（无弹窗环境）", () => text().includes("冲稳保"));

/* ---- 位次定位 ---- */
goto("#/chart");
const prInput = doc.querySelector("[data-cid][data-field='pastRank']");
prInput.value = "30000";
prInput.dispatchEvent(new window.Event("input", { bubbles: true }));
prInput.dispatchEvent(new window.Event("change", { bubbles: true }));
goto("#/chart/rank");
check("位次定位页渲染", () => text().includes("位次定位") && text().includes("一分一段表"));
const mineInput = doc.querySelector("[data-rank='mine']");
mineInput.value = "20000";
mineInput.dispatchEvent(new window.Event("input", { bubbles: true }));
mineInput.dispatchEvent(new window.Event("change", { bubbles: true }));
check("位次对照给出建议（1.5 倍 → 保）", () => text().includes("比你靠后 50%") && text().includes("保"));
click('[data-act="cand-tier"][data-tier="safe"]');
check("采纳建议后按钮消失", () => !text().includes("采纳"));

/* ---- 选科参考 ---- */
goto("#/more/subjects");
check("选科页渲染", () => text().includes("选科组合参考"));
["物理", "化学", "生物"].forEach((s) => click('[data-act="subj-toggle"][data-v="' + s + '"]'));
check("选满 3 科出结论", () => text().includes("专业面最大") && text().includes("99.9%"));
click('[data-act="subj-toggle"][data-v="政治"]');
check("第 4 科被拦截（仍为 3 科）", () => JSON.parse(window.localStorage.getItem("pathfinder.v1")).subjects.length === 3);

/* ---- 分享图（无 canvas 环境优雅降级） ---- */
goto("#/compass/quiz");
click('[data-act="riasec-share"]');
check("分享按钮点击不崩溃", () => text().includes("我的霍兰德代码"));

/* ---- 新版本提示条 ---- */
window.dispatchEvent(new window.Event("pf-sw-updated"));
check("新版本提示条出现", () => !!doc.querySelector("#update-bar") && doc.body.textContent.includes("立即刷新"));

/* ---- 此刻：清单勾选 ---- */
goto("#/now");
check("顶栏品牌为 h1", () => !!doc.querySelector("#topbar h1.brand"));
const cb = doc.querySelector('[data-check="p1-1"]');
cb.checked = true;
cb.dispatchEvent(new window.Event("change", { bubbles: true }));
check("本阶段清单勾选生效", () => text().includes("1/4"));
check("原地刷新带 no-anim（不重播动画）", () => doc.querySelector("#view").classList.contains("no-anim"));

/* ---- 阶段与身份切换 ---- */
click('[data-act="set-phase"][data-v="scored"]');
check("切到已出分：推荐变为位次方向池", () => text().includes("用位次补齐方向池"));
click('[data-act="set-persona"][data-v="parent"]');
check("家长视角文案生效", () => text().includes("帮孩子约") || text().includes("家长"));
click('[data-act="set-phase"][data-v="after"]');
check("录取后家长推荐 = 退到顾问", () => text().includes("从决定者退到顾问"));
click('[data-act="set-persona"][data-v="student"]');
click('[data-act="set-phase"][data-v="before"]');

/* ---- 旧链接重定向 ---- */
goto("#/assess");
check("旧链接 #/assess 重定向到测评", () => window.location.hash === "#/compass/quiz" && text().includes("霍兰德"));
goto("#/decide");
check("旧链接 #/decide 重定向到航海图", () => window.location.hash === "#/chart");

/* ---- 更多 ---- */
goto("#/more");
check("更多菜单", () => text().includes("家长专区") && text().includes("知识库") && text().includes("身份"));
goto("#/more/parents");
check("家长专区", () => text().includes("自主支持") && text().includes("四个角色"));
goto("#/more/knowledge");
check("知识库", () => text().includes("Gagné") && text().includes("RIASEC"));
goto("#/more/data");
check("数据管理（含互传）", () => text().includes("导出 / 互传备份") && !!doc.querySelector('[data-act="share-backup"]'));
click('[data-act="share-backup"]');
check("分享备份优雅降级", () => text().includes("导入备份"));

/* ---- 意见反馈（循环工程入口） ---- */
goto("#/more");
check("更多页有反馈入口", () => !!doc.querySelector('[data-act="sheet-open"][data-sheet="fb"]'));
click('[data-act="sheet-open"][data-sheet="fb"]');
check("反馈浮层打开（含隐私说明）", () => modal().includes("意见反馈") && modal().includes("不会上传"));
doc.querySelector("#fb-text").value = "建议增加深色模式开关";
let openedUrl = "";
const realOpen = window.open;
window.open = (u) => { openedUrl = String(u); return { document: { open() {}, write() {}, close() {} } }; };
click('[data-act="fb-github"]');
window.open = realOpen;
check("生成预填 GitHub Issue 链接", () =>
  openedUrl.includes("/issues/new") && openedUrl.includes("labels=feedback") &&
  openedUrl.includes(encodeURIComponent("深色模式开关")));
check("提交后浮层关闭", () => modal().trim() === "");

goto("#/more/about");
check("关于页（v2 + 设计文档）", () => text().includes("2.5.0") && text().includes("design.md"));

/* ---- 数据消毒（导入恶意 / 损坏备份） ---- */
const evil = JSON.stringify({ app: "pathfinder", data: {
  profile: { persona: "hacker", phase: "never", onboarded: true },
  riasec: { answers: { "0": "9", "99": 1 }, idx: 999, inProgress: false,
    history: [ { scores: { R: "99", I: 2, A: 3, S: 4, E: 5, C: 6 }, code: "<img>" }, { nope: true } ] },
  flows: [ { id: '"><img src=x onerror=alert(1)>', activity: "画画", signals: [0, 7, "2"] } ],
  decision: { weights: { interest: "99" }, candidates: [ { id: "x", school: "A大学", tier: "rocket", scores: { interest: "999" } } ] }
}});
const cleaned = window.Store.importJson(evil);
check("非法枚举回退默认值", () => cleaned.profile.persona === "student" && cleaned.profile.phase === "before" && cleaned.decision.candidates[0].tier === "unset");
check("恶意 id 被重新生成", () => /^[a-z0-9]{6,24}$/i.test(cleaned.flows[0].id) && /^[a-z0-9]{6,24}$/i.test(cleaned.decision.candidates[0].id));
check("数值越界被钳位", () => cleaned.riasec.history[0].scores.R === 16 && cleaned.decision.weights.interest === 5 && cleaned.decision.candidates[0].scores.interest === 10);
check("非法 code 重新推导", () => /^[RIASEC]{3}$/.test(cleaned.riasec.history[0].code));
check("损坏的历史条目被剔除", () => cleaned.riasec.history.length === 1);
check("越界心流信号被过滤", () => cleaned.flows[0].signals.join() === "0,2");

/* ---- 未知路由兜底 ---- */
goto("#/nonsense");
check("未知路由重定向回此刻", () => window.location.hash === "#/now" && text().includes("下一步"));

/* ---- 持久化 ---- */
const saved = JSON.parse(window.localStorage.getItem("pathfinder.v1") || "{}");
check("profile 已保存", () => saved.profile && saved.profile.onboarded === true && saved.profile.persona === "student");
check("测评历史已保存", () => saved.riasec.history.length === 1);
check("心流/成就/访谈/方案已保存", () => saved.flows.length === 1 && saved.achievements.length === 1 && saved.interviews.length === 1 && saved.decision.candidates.length === 2);
check("奥德赛标题已保存", () => saved.odyssey.a.title === "工科稳步前行");
check("位次与往年位次已保存", () => saved.decision.rank.mine === 20000 && saved.decision.candidates.some((c) => c.pastRank === 30000));
check("选科已保存", () => Array.isArray(saved.subjects) && saved.subjects.length === 3);

console.log(results.join("\n"));
if (errors.length) {
  console.error("\n===== 错误 =====\n" + errors.join("\n---\n"));
  process.exit(1);
}
console.log("\n全部通过 🎉");
