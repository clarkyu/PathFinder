/* ============================================================
 * 航向 PathFinder · 应用主逻辑（v2 · 领航员架构）
 * 设计逻辑见 docs/design.md：
 *   此刻（下一步推荐）· 探索（我是谁）· 决策（去哪里）· 更多
 * ============================================================ */
"use strict";

(function () {

  /* ---------------- 工具函数 ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDate(ts) {
    var d = new Date(ts);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  var toastTimer = null;
  function toast(msg) {
    var el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2000);
  }
  var saveTimer = null;
  var saveWarned = false;
  function doSave() {
    if (!Store.save(S) && !saveWarned) {
      saveWarned = true; // 每次会话只提醒一次，避免刷屏
      toast("数据保存失败：可能处于无痕模式或存储已满，请尽快导出备份");
    }
  }
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, 400);
  }
  function saveNow() { clearTimeout(saveTimer); doSave(); }

  /* ---------------- 状态 ---------------- */
  var S = Store.load();
  var deferredPrompt = null;
  var ob = { step: 0, persona: "student", phase: "before" }; // 开场定向的临时状态
  var openAcc = {}; // 折叠面板展开状态（按 data-aid 记忆，跨重渲染保持）

  function isParent() { return S.profile.persona === "parent"; }
  function accCls(aid, def) {
    var open = Object.prototype.hasOwnProperty.call(openAcc, aid) ? openAcc[aid] : !!def;
    return open ? " open" : "";
  }

  /* ---------------- 图标（内联 SVG） ---------------- */
  function svg(paths) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + "</svg>";
  }
  var ICONS = {
    sail: svg('<path d="M4 17.5h16l-1.6 3.5H5.6z"/><path d="M12 3v14.5"/><path d="M12 4l6.5 9.5H12z"/><path d="M12 7.5 7 13.5h5z"/>'),
    compass: svg('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13.4 13.4 8.5 15.5l2.1-4.9z"/>'),
    map: svg('<path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4z"/><path d="M9 4v13"/><path d="M15 6.5v13"/>'),
    back: svg('<path d="M15 18l-6-6 6-6"/>'),
    chev: svg('<path d="M9 6l6 6-6 6"/>'),
    down: svg('<path d="M6 9l6 6 6-6"/>'),
    plus: svg('<path d="M12 5v14"/><path d="M5 12h14"/>'),
    trash: svg('<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6.5 7l1 13h9l1-13"/><path d="M10 11v6"/><path d="M14 11v6"/>'),
    ext: svg('<path d="M14 5h5v5"/><path d="M19 5l-8 8"/><path d="M19 14v5H5V5h5"/>'),
    close: svg('<path d="M6 6l12 12"/><path d="M18 6 6 18"/>'),
    more: svg('<circle cx="5" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.7" fill="currentColor" stroke="none"/>'),
    target: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.7" fill="currentColor"/>'),
    star: svg('<path d="M12 3.5l2.5 5.1 5.6.8-4 4 .9 5.6-5-2.6-5 2.6.9-5.6-4-4 5.6-.8z"/>'),
    route: svg('<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7.5a3.5 3.5 0 000-7h-7a3.5 3.5 0 010-7H16"/>'),
    chat: svg('<path d="M4 5.5h16V16H9.5L4 20z"/>')
  };

  var NAV = [
    { id: "now", name: "此刻", icon: ICONS.sail },
    { id: "compass", name: "探索", icon: ICONS.compass },
    { id: "chart", name: "决策", icon: ICONS.map },
    { id: "more", name: "更多", icon: ICONS.more }
  ];

  /* ---------------- 路由（含旧链接重定向） ---------------- */
  function route() {
    var h = (location.hash || "#/now").replace(/^#\/?/, "");
    var parts = h.split("/");
    var page = parts[0] || "now", sub = parts[1] || "";
    var legacy = { home: "now", assess: "compass/quiz", explore: "compass", decide: "chart" };
    if (legacy[page] !== undefined) {
      var to = legacy[page];
      if (page === "explore" && sub) to = "compass/" + sub;
      if (page === "decide" && sub === "tier") to = "chart/tier";
      location.replace("#/" + to);
      parts = to.split("/");
      page = parts[0];
      sub = parts[1] || "";
    }
    if (!{ now: 1, compass: 1, chart: 1, more: 1 }[page]) {
      location.replace("#/now");
      page = "now"; sub = "";
    }
    return { page: page, sub: sub };
  }

  /* ---------------- RIASEC 计算 ---------------- */
  function riasecScores(answers) {
    var scores = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
    DATA.riasec.questions.forEach(function (q, i) {
      var v = answers[i];
      if (typeof v === "number") scores[q.t] += v;
    });
    return scores;
  }
  function sortTypes(scores) {
    var order = DATA.riasec.hexOrder;
    return order.slice().sort(function (a, b) {
      return scores[b] - scores[a] || order.indexOf(a) - order.indexOf(b);
    });
  }
  function hexDistance(a, b) {
    var o = DATA.riasec.hexOrder;
    var d = Math.abs(o.indexOf(a) - o.indexOf(b));
    return Math.min(d, 6 - d);
  }
  function answeredCount() { return Object.keys(S.riasec.answers).length; }
  function finishRiasec() {
    var scores = riasecScores(S.riasec.answers);
    var sorted = sortTypes(scores);
    var code = sorted.slice(0, 3).join("");
    S.riasec.history.unshift({ date: Date.now(), scores: scores, code: code });
    if (S.riasec.history.length > 10) S.riasec.history.length = 10;
    S.riasec.inProgress = false;
    S.riasec.answers = {};
    S.riasec.idx = 0;
    saveNow();
    toast("测评完成！这是你的兴趣画像草稿");
  }

  /* ---------------- 雷达图（纯 SVG） ---------------- */
  function radarSvg(scores) {
    var order = DATA.riasec.hexOrder;
    var cx = 130, cy = 122, R = 84, max = DATA.riasec.maxPerType;
    function pt(i, r) {
      var ang = (-90 + i * 60) * Math.PI / 180;
      return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
    }
    function poly(r) {
      return order.map(function (_, i) { return pt(i, r).map(function (n) { return n.toFixed(1); }).join(","); }).join(" ");
    }
    var grid = [0.25, 0.5, 0.75, 1].map(function (k) {
      return '<polygon class="rd-grid" points="' + poly(R * k) + '"/>';
    }).join("");
    var axes = order.map(function (_, i) {
      var p = pt(i, R);
      return '<line class="rd-axis" x1="' + cx + '" y1="' + cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '"/>';
    }).join("");
    var labels = order.map(function (t, i) {
      var p = pt(i, R + 21);
      var info = DATA.riasec.types[t];
      return '<text x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="600" fill="' + info.color + '">' +
        t + " " + info.name + "</text>";
    }).join("");
    var dataPts = order.map(function (t, i) { return pt(i, (scores[t] / max) * R); });
    var dataPoly = dataPts.map(function (p) { return p.map(function (n) { return n.toFixed(1); }).join(","); }).join(" ");
    var dots = dataPts.map(function (p, i) {
      return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="' + DATA.riasec.types[order[i]].color + '"/>';
    }).join("");
    return '<svg class="radar" viewBox="0 0 260 248" width="260" height="248" role="img" aria-label="霍兰德六型兴趣雷达图">' +
      grid + axes +
      '<polygon class="rd-data" points="' + dataPoly + '"/>' +
      dots + labels + "</svg>";
  }

  /* ---------------- 分享图（Canvas 生成 PNG） ---------------- */
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function copyTextLegacy(t) {
    try {
      var ta = document.createElement("textarea");
      ta.value = t;
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand && document.execCommand("copy");
      ta.remove();
      return !!ok;
    } catch (e) { return false; }
  }
  // 以真实结果回调：clipboard API 可能异步失败（失焦/权限），不能同步谎报成功
  function copyText(t, done) {
    var finish = done || function () {};
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t).then(
          function () { finish(true); },
          function () { finish(copyTextLegacy(t)); }
        );
        return;
      }
    } catch (e) { /* 走兜底 */ }
    finish(copyTextLegacy(t));
  }
  function downloadBlob(blob, name) {
    try {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    } catch (e) {
      toast("当前环境不支持下载文件");
    }
  }
  function shareResult() {
    var h = S.riasec.history[0];
    if (!h) return;
    var cv = document.createElement("canvas");
    cv.width = 1080; cv.height = 1500;
    var ctx = null;
    try { ctx = cv.getContext("2d"); } catch (e) { ctx = null; }
    if (!ctx) { toast("当前浏览器不支持生成图片"); return; }

    var FONT = "'PingFang SC','Microsoft YaHei',sans-serif";
    var order = DATA.riasec.hexOrder;
    var max = DATA.riasec.maxPerType;
    var sorted = sortTypes(h.scores);
    var top = sorted.slice(0, 3);

    // 背景与卡片
    var g = ctx.createLinearGradient(0, 0, 1080, 1500);
    g.addColorStop(0, "#1450A3");
    g.addColorStop(1, "#19A7CE");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1080, 1500);
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, 60, 160, 960, 1180, 44);
    ctx.fill();

    // 标题
    ctx.textAlign = "center";
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "700 54px " + FONT;
    ctx.fillText("我的霍兰德兴趣画像", 540, 112);

    // 三字码
    ctx.font = "800 130px " + FONT;
    top.forEach(function (t, i) {
      ctx.fillStyle = DATA.riasec.types[t].color;
      ctx.fillText(t, 540 + (i - 1) * 150, 330);
    });
    ctx.fillStyle = "#6E7D8D";
    ctx.font = "400 34px " + FONT;
    ctx.fillText(top.map(function (t) { return DATA.riasec.types[t].name; }).join(" · "), 540, 392);

    // 雷达图
    var cx = 540, cy = 700, R = 215;
    function pt(i, r) {
      var ang = (-90 + i * 60) * Math.PI / 180;
      return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
    }
    function tracePoly(r) {
      order.forEach(function (_, i) {
        var p = pt(i, r);
        if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
      });
      ctx.closePath();
    }
    ctx.strokeStyle = "#D8DCD2";
    ctx.lineWidth = 2;
    [0.25, 0.5, 0.75, 1].forEach(function (k) {
      ctx.beginPath(); tracePoly(R * k); ctx.stroke();
    });
    order.forEach(function (_, i) {
      var p = pt(i, R);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p[0], p[1]); ctx.stroke();
    });
    ctx.beginPath();
    order.forEach(function (t, i) {
      var p = pt(i, (h.scores[t] / max) * R);
      if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(20,80,163,0.16)";
    ctx.fill();
    ctx.strokeStyle = "#1450A3";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.font = "600 30px " + FONT;
    order.forEach(function (t, i) {
      var p = pt(i, R + 52);
      ctx.fillStyle = DATA.riasec.types[t].color;
      ctx.fillText(t + " " + DATA.riasec.types[t].name, p[0], p[1] + 10);
    });

    // 六型条形
    var by = 1030, rowH = 49;
    sorted.forEach(function (t, i) {
      var info = DATA.riasec.types[t];
      var y = by + i * rowH;
      ctx.fillStyle = info.color;
      roundRect(ctx, 150, y, 40, 40, 10); ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "800 26px " + FONT;
      ctx.fillText(t, 170, y + 29);
      ctx.textAlign = "left";
      ctx.fillStyle = "#17293E";
      ctx.font = "600 26px " + FONT;
      ctx.fillText(info.name, 212, y + 29);
      ctx.fillStyle = "#ECEEE7";
      roundRect(ctx, 350, y + 11, 470, 18, 9); ctx.fill();
      ctx.fillStyle = info.color;
      roundRect(ctx, 350, y + 11, Math.max(18, 470 * h.scores[t] / max), 18, 9); ctx.fill();
      ctx.fillStyle = "#6E7D8D";
      ctx.font = "400 24px " + FONT;
      ctx.fillText(h.scores[t] + "/" + max, 845, y + 29);
      ctx.textAlign = "center";
    });

    // 页脚
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = "700 34px " + FONT;
    ctx.fillText(DATA.app.name + " · " + DATA.app.title, 540, 1408);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "400 24px " + FONT;
    ctx.fillText(fmtDate(h.date) + " · 兴趣画像是探索的草稿，不是判决书", 540, 1456);

    var fileName = "pathfinder-" + h.code + "-" + fmtDate(h.date) + ".png";
    cv.toBlob(function (blob) {
      if (!blob) { toast("生成图片失败"); return; }
      try {
        var file = new File([blob], fileName, { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: "我的霍兰德兴趣画像" })
            .catch(function () { downloadBlob(blob, fileName); });
          return;
        }
      } catch (e) { /* 回退到下载 */ }
      downloadBlob(blob, fileName);
      toast("分享图已保存");
    }, "image/png");
  }

  /* ---------------- 打印版志愿表 ---------------- */
  function exportPrint() {
    var d = S.decision;
    if (!d.candidates.length) { toast("方向池还是空的，先添加候选方案"); return; }
    function rows(list) {
      return list.map(function (c, i) {
        return "<tr><td>" + (i + 1) + "</td><td>" + esc(c.school) + "</td><td>" + esc(c.major || "—") + "</td><td>" +
          esc(c.city || "—") + "</td><td>" + (c.pastRank || "—") + "</td><td>" + candidateScore(c) + "</td><td>" +
          esc(c.note || "") + "</td></tr>";
      }).join("");
    }
    var secs = ["rush", "steady", "safe", "unset"].map(function (key) {
      var t = tierInfo(key);
      var list = d.candidates.filter(function (c) { return (c.tier || "unset") === key; });
      if (!list.length) return "";
      return "<h2><span style='background:" + t.color + "'>" + t.name + "</span>" + esc(t.hint) + "（" + list.length + "）</h2>" +
        "<table><thead><tr><th>#</th><th>院校</th><th>专业 / 组</th><th>城市</th><th>往年位次</th><th>综合分</th><th>备注</th></tr></thead><tbody>" +
        rows(list) + "</tbody></table>";
    }).join("");
    var weights = DATA.decision.dims.map(function (dm) { return dm.name + " " + d.weights[dm.key]; }).join(" · ");
    var html = "<!DOCTYPE html><html lang='zh-CN'><head><meta charset='utf-8'>" +
      "<title>志愿方案表 · " + DATA.app.name + "</title><style>" +
      "body{font-family:'PingFang SC','Microsoft YaHei',sans-serif;color:#1A2433;margin:32px auto;max-width:860px;padding:0 16px}" +
      "h1{font-size:22px;margin:0}h2{font-size:15px;margin:20px 0 8px}" +
      "h2 span{color:#fff;border-radius:4px;padding:2px 9px;margin-right:8px;font-size:13px}" +
      "table{width:100%;border-collapse:collapse;font-size:12.5px}" +
      "th,td{border:1px solid #C9D2DC;padding:6px 8px;text-align:left;vertical-align:top}" +
      "td{white-space:pre-wrap}th{background:#F0F3F7}" +
      ".meta{color:#667789;font-size:12.5px;margin:6px 0 14px}" +
      ".foot{margin-top:24px;color:#667789;font-size:11.5px;border-top:1px solid #C9D2DC;padding-top:10px;line-height:1.7}" +
      ".noprint{margin:14px 0}.noprint button{padding:9px 20px;font-size:14px;cursor:pointer}" +
      "@media print{.noprint{display:none}body{margin:0;max-width:none}}" +
      "</style></head><body>" +
      "<h1>志愿方案表</h1>" +
      "<p class='meta'>" + fmtDate(Date.now()) +
      (d.rank.mine ? " · 我的位次 " + d.rank.mine : "") +
      " · 平衡单权重：" + weights + "</p>" +
      "<div class='noprint'><button onclick='window.print()'>打印 / 存为 PDF</button></div>" +
      secs +
      "<p class='foot'>由 " + DATA.app.name + "（" + DATA.app.title + "）生成。综合分为个人决策平衡单的加权结果，" +
      "往年位次为手工录入，均仅供家庭讨论参考；正式填报请以教育部「阳光志愿」系统与学校老师意见为准。</p>" +
      "</body></html>";
    var w = null;
    try { w = window.open("", "_blank"); } catch (e) { w = null; }
    if (!w || !w.document) { toast("无法打开新窗口，请允许弹窗后重试"); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  /* ---------------- 决策计算 ---------------- */
  function candidateScore(c) {
    var w = S.decision.weights, sumW = 0, raw = 0;
    DATA.decision.dims.forEach(function (d) {
      var wi = Number(w[d.key]) || 0;
      sumW += wi;
      raw += wi * (Number(c.scores[d.key]) || 0);
    });
    if (!sumW) return 0;
    return Math.round((raw / (sumW * 10)) * 100);
  }
  function tierInfo(key) {
    for (var i = 0; i < DATA.decision.tiers.length; i++) {
      if (DATA.decision.tiers[i].key === key) return DATA.decision.tiers[i];
    }
    return DATA.decision.tiers[3];
  }
  function odysseyTouched() {
    return ["a", "b", "c"].some(function (k) {
      var od = S.odyssey[k];
      return (od.title && od.title.trim()) || od.years.join("").trim() || (od.questions && od.questions.trim());
    });
  }

  /* ---------------- 通用 UI 片段 ---------------- */
  function card(inner, cls) { return '<section class="card ' + (cls || "") + '">' + inner + "</section>"; }
  function empty(text) { return '<div class="empty">' + esc(text) + "</div>"; }
  function progressBar(pct, cls) {
    return '<div class="bar ' + (cls || "") + '"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>';
  }
  function sliderRow(label, attrs, value, min, max, hint) {
    var v = Number(value);
    if (!isFinite(v)) v = min;
    v = Math.min(max, Math.max(min, v));
    return '<div class="slider-row"><div class="slider-label">' + esc(label) +
      (hint ? "<small>" + esc(hint) + "</small>" : "") + "</div>" +
      '<input type="range" min="' + min + '" max="' + max + '" step="1" value="' + v + '" ' + attrs + ">" +
      "<output>" + v + "</output></div>";
  }

  /* ---------------- 开场定向（首次启动三屏） ---------------- */
  function renderOnboarding() {
    var root = $("#modal-root");
    if (S.profile.onboarded) {
      if (root.getAttribute("data-ob")) { root.innerHTML = ""; root.removeAttribute("data-ob"); }
      return;
    }
    root.setAttribute("data-ob", "1");
    var inner = "";
    if (ob.step === 0) {
      inner = '<p class="ob-hi">' + DATA.onboarding.hello + "</p>" +
        "<h2>" + DATA.app.name + "</h2>" +
        '<p class="ob-intro">' + DATA.onboarding.intro + "</p>" +
        DATA.onboarding.personas.map(function (p) {
          return '<button class="ob-opt" data-act="ob-persona" data-v="' + p.key + '"><b>' + p.name + "</b><small>" + p.desc + "</small></button>";
        }).join("");
    } else if (ob.step === 1) {
      inner = '<button class="ob-back" data-act="ob-back">' + ICONS.back + " 上一步</button>" +
        "<h2>现在到哪一步了？</h2>" +
        '<p class="ob-intro">阶段不同，该做的事不同。之后随时可以在时间线上切换。</p>' +
        DATA.onboarding.phases.map(function (p) {
          return '<button class="ob-opt" data-act="ob-phase" data-v="' + p.key + '"><b>' + p.name + "</b><small>" + p.desc + "</small></button>";
        }).join("");
    } else {
      inner = "<h2>" + (ob.persona === "parent" ? "欢迎，领航的家人" : "欢迎登船") + "</h2>" +
        '<p class="ob-intro">' + DATA.onboarding.welcome[ob.persona] + "</p>" +
        '<button class="btn btn-cta btn-block" data-act="ob-start">进入航程</button>';
    }
    root.innerHTML = '<div class="ob" role="dialog" aria-modal="true" aria-label="开场定向"><div class="ob-card">' + inner + "</div></div>";
  }

  /* ---------------- 底部浮层（对话式输入） ---------------- */
  function sheetWrap(title, lead, inner) {
    return '<div class="sheet-mask" data-act="sheet-close"><div class="sheet" data-act="noop" role="dialog" aria-modal="true" aria-label="' + title + '">' +
      '<button class="sheet-x" data-act="sheet-close" aria-label="关闭">' + ICONS.close + "</button>" +
      '<div class="sheet-bar"></div><h3>' + title + "</h3>" +
      (lead ? '<p class="sheet-lead">' + lead + "</p>" : "") +
      inner + "</div></div>";
  }
  var SHEETS = {
    flow: function () {
      var sigs = DATA.flowSignals.map(function (s, i) {
        return '<label class="sig"><input type="checkbox" class="flow-sig" value="' + i + '"><span>' + s + "</span></label>";
      }).join("");
      return sheetWrap("记一个心流时刻",
        isParent() ? "孩子做什么时会忘记时间、不需催促？" : "过去三年，做什么让你忘记时间？",
        '<input class="input" id="flow-activity" maxlength="40" placeholder="那件事，比如：拼装模型 / 写剧本 / 调试代码">' +
        '<input class="input" id="flow-when" maxlength="30" placeholder="大概什么时候？（选填）">' +
        '<p class="lbl">出现了哪些信号？</p><div class="sigs">' + sigs + "</div>" +
        '<textarea class="input" id="flow-note" rows="2" placeholder="补充细节（选填）"></textarea>' +
        '<button class="btn btn-cta btn-block" data-act="flow-add">保存这条线索</button>');
    },
    ach: function () {
      return sheetWrap("一件最有成就感的事",
        "反复出现的“动机模式”，往往指向天赋所在。",
        '<input class="input" id="ach-event" maxlength="60" placeholder="那件事，比如：带队拿了机器人比赛二等奖">' +
        '<input class="input" id="ach-role" maxlength="60" placeholder="具体做了什么？">' +
        '<input class="input" id="ach-pattern" maxlength="60" placeholder="最让人兴奋的点是什么？">' +
        '<button class="btn btn-cta btn-block" data-act="ach-add">保存这件事</button>');
    },
    iv: function () {
      var statusOpts = DATA.interview.statuses.map(function (s) {
        return '<option value="' + s.key + '">' + s.name + "</option>";
      }).join("");
      return sheetWrap("添加访谈对象",
        "从亲友、校友里找目标行业的人，用一线信息检验想象。",
        '<input class="input" id="iv-person" maxlength="20" placeholder="对方称呼，比如：李叔叔 / 王学长">' +
        '<input class="input" id="iv-occ" maxlength="30" placeholder="职业 / 行业，比如：三甲医院骨科医生">' +
        '<div class="row2"><input class="input" id="iv-rel" maxlength="20" placeholder="关系（选填）">' +
        '<select class="input" id="iv-status">' + statusOpts + "</select></div>" +
        '<button class="btn btn-cta btn-block" data-act="iv-add">添加</button>');
    },
    cand: function () {
      var tierOpts = DATA.decision.tiers.map(function (t) {
        return '<option value="' + t.key + '"' + (t.key === "unset" ? " selected" : "") + ">" + t.name + "</option>";
      }).join("");
      return sheetWrap("捞一个方向进池子",
        "先记下来就好，出分后再打分排序。",
        '<input class="input" id="cand-school" maxlength="30" placeholder="院校名称（必填）">' +
        '<input class="input" id="cand-major" maxlength="30" placeholder="专业 / 专业组（建议填写）">' +
        '<div class="row2"><input class="input" id="cand-city" maxlength="20" placeholder="城市（选填）">' +
        '<select class="input" id="cand-tier">' + tierOpts + "</select></div>" +
        '<input class="input" id="cand-rank" type="number" min="1" inputmode="numeric" placeholder="往年最低位次（选填，供位次定位用）">' +
        '<button class="btn btn-cta btn-block" data-act="cand-add">放进方向池</button>');
    },
    fb: function () {
      return sheetWrap("意见反馈",
        "你的反馈会进入迭代循环：分诊 → 修复 → 上线后回访。提交内容 = 下面填写的文字 + 应用版本与浏览器环境（便于排查），不会上传你的任何测评与记录数据。",
        '<select class="input" id="fb-cat"><option>问题报告</option><option>功能建议</option><option>使用疑问</option></select>' +
        '<textarea class="input" id="fb-text" rows="4" maxlength="1000" placeholder="发生了什么？你期望是什么样？"></textarea>' +
        '<button class="btn btn-cta btn-block" data-act="fb-github">提交到 GitHub（推荐）</button>' +
        '<button class="btn btn-ghost btn-block" data-act="fb-copy">复制反馈内容（粘贴到微信 / 邮件）</button>' +
        '<p class="note">GitHub 方式需要账号；复制方式适合没有账号的家长与同学，请粘贴后发给应用维护者。</p>');
    }
  };
  var sheetTrigger = null; // 打开浮层的按钮，关闭后焦点归还
  function openSheet(name, trigger) {
    if (!SHEETS[name]) return;
    sheetTrigger = trigger || null;
    $("#modal-root").innerHTML = SHEETS[name]();
    document.body.classList.add("sheet-open");
    var first = $("#modal-root .sheet .input");
    if (first) setTimeout(function () { first.focus(); }, 60);
  }
  function closeSheet() {
    var root = $("#modal-root");
    if (root.getAttribute("data-ob")) return;
    root.innerHTML = "";
    document.body.classList.remove("sheet-open");
    if (sheetTrigger && document.contains(sheetTrigger)) sheetTrigger.focus();
    sheetTrigger = null;
  }

  /* ---------------- 下一步推荐引擎 ---------------- */
  function stepCta(st, cls) {
    if (st.sheet) return '<button class="' + cls + '" data-act="sheet-open" data-sheet="' + st.sheet + '">' + st.cta + "</button>";
    if (st.ext) return '<a class="' + cls + '" href="' + st.ext + '" target="_blank" rel="noopener">' + st.cta + " " + ICONS.ext + "</a>";
    return '<a class="' + cls + '" href="' + st.to + '">' + st.cta + "</a>";
  }
  function nextSteps() {
    var p = isParent();
    var hist = S.riasec.history.length;
    var flows = S.flows.length;
    var ach = S.achievements.length;
    var cands = S.decision.candidates.length;
    var ivs = S.interviews.length;
    var list = [];

    function quizStep() {
      return p
        ? { tag: "罗盘", title: "请孩子先校准罗盘", body: "把手机递给孩子：6 分钟兴趣自评。提醒彼此——结果是聊天素材，不是判决书。", cta: "打开测评", to: "#/compass/quiz" }
        : { tag: "罗盘", title: "先把罗盘校准", body: "6 分钟、48 道「喜欢 / 一般 / 不喜欢」，看清你的兴趣指向哪片海域。", cta: "开始兴趣测评", to: "#/compass/quiz" };
    }

    if (S.profile.phase === "before") {
      if (!hist) list.push(quizStep());
      if (flows < 3) list.push(p
        ? { tag: "线索", title: "一起列心流清单（" + flows + "/3）", body: "回想孩子做什么时忘记时间、不需催促、做完发光——这比任何测评都可靠。", cta: "记一条心流", sheet: "flow" }
        : { tag: "线索", title: "记下心流时刻（" + flows + "/3）", body: "过去三年，做什么会让你忘记时间？那里埋着天赋线索。", cta: "记一条心流", sheet: "flow" });
      if (!odysseyTouched()) list.push(p
        ? { tag: "想象", title: "今晚陪他写三种五年", body: "奥德赛计划的家规：只问不评判。听比说重要。", cta: "了解怎么陪", to: "#/compass/odyssey" }
        : { tag: "想象", title: "今晚，写三种五年", body: "延伸版、突变版、自由版——先让想象发散，再一起讨论。", cta: "去写奥德赛计划", to: "#/compass/odyssey" });
      if (cands < 5) list.push(p
        ? { tag: "方向", title: "帮他把方向捞进池子", body: "已有 " + cands + " 个。一起搜集 5–8 个方向的资料：学什么、就业去向、选科要求。", cta: "添加一个方向", sheet: "cand" }
        : { tag: "方向", title: "把模糊的兴趣捞进方向池", body: "已有 " + cands + " 个。把 5–8 个「隐约感兴趣」的专业 / 职业丢进来，先不用打分。", cta: "添加一个方向", sheet: "cand" });
      if (!ach) list.push({ tag: "线索", title: "写一件最有成就感的事", body: "具体做了什么？什么让人兴奋？反复出现的动机模式，指向天赋。", cta: "写一件", sheet: "ach" });
      if (!list.length) list.push({ tag: "航程", title: "出分前的功课齐了", body: "等待也是航程的一部分。出分那天，点上方时间线进入下一段。", cta: "看看我的探索画像", to: "#/compass" });
    } else if (S.profile.phase === "scored") {
      if (!hist) list.push(quizStep());
      if (cands < 3) list.push({ tag: "方向", title: "用位次补齐方向池", body: "已有 " + cands + " 个。出分了：以「位次」而非绝对分定位，把够得着的院校 + 专业放进来。", cta: "添加方向", sheet: "cand" });
      if (ivs < 2) list.push(p
        ? { tag: "检验", title: "帮孩子约 2–3 场访谈", body: "已安排 " + ivs + " 场。你的人脉正好用在这里：亲友、校友里找目标行业的人。", cta: "添加访谈对象", sheet: "iv" }
        : { tag: "检验", title: "约 2–3 场人物访谈", body: "已安排 " + ivs + " 场。从亲友、校友里找目标行业的人，用一线信息检验想象。", cta: "添加访谈对象", sheet: "iv" });
      var hasDefault = S.decision.candidates.some(function (c) {
        var allFive = DATA.decision.dims.every(function (d) { return (Number(c.scores[d.key]) || 0) === 5; });
        return allFive && !(c.note && c.note.trim());
      });
      if (cands >= 2 && hasDefault) list.push({ tag: "决策", title: "给候选方案打分", body: "六个维度滑一滑，把「感觉」变成可以摆上桌面讨论的数字。", cta: "去打分", to: "#/chart" });
      var unset = S.decision.candidates.some(function (c) { return !c.tier || c.tier === "unset"; });
      if (cands > 0 && unset) list.push({ tag: "决策", title: "把方案归进冲 · 稳 · 保", body: "形成有梯度的志愿表，别把所有鸡蛋放在一档里。", cta: "去归档", to: "#/chart/tier" });
      list.push({ tag: "收尾", title: "最后一道工序", body: "用位次在「阳光志愿」里核对冲稳保梯度，再请班主任把关一遍。", cta: "打开阳光志愿", ext: "https://gaokao.chsi.com.cn/zyck/" });
    } else {
      if (p) {
        list.push({ tag: "心态", title: "从决定者退到顾问", body: "路已经选了，现在他最需要的是信任。提供资源、接住情绪，把方向盘交给他。", cta: "打开家长指南", to: "#/more/parents" });
        list.push({ tag: "心态", title: "两句话常挂嘴边", body: "①兴趣可以养成，不必现在就找到唯一热爱；②专业不是一考定终身。", cta: "看理论依据", to: "#/more/knowledge" });
      } else {
        list.push({ tag: "心态", title: "航程才刚开始", body: "转专业、辅修、考研都是真实的修正机会。大学是广泛尝试 + 在一个方向积累硬技能的黄金期。", cta: "看长期心态卡片", to: "#/more/knowledge" });
        list.push({ tag: "线索", title: "别丢下你的罗盘", body: "心流还在发生——进了大学也继续记录，它会一直为你指向。", cta: "记一条心流", sheet: "flow" });
      }
    }
    return list.slice(0, 3);
  }

  /* ---------------- 阶段时间线 ---------------- */
  function timeline() {
    var idx = Math.max(0, DATA.stages.findIndex(function (s) { return s.key === S.profile.phase; }));
    return '<div class="tl">' + DATA.stages.map(function (s, i) {
      var cls = i < idx ? " past" : i === idx ? " cur" : "";
      return '<button class="tl-node' + cls + '" data-act="set-phase" data-v="' + s.key + '"><i></i><b>' + s.name + "</b><small>" + s.sub + "</small></button>";
    }).join('<span class="tl-line"></span>') + "</div>" +
      '<p class="tl-hint">你在第 ' + (idx + 1) + ' 段航程 · 出分 / 录取后，点节点切换阶段</p>';
  }

  /* ---------------- 视图：此刻 ---------------- */
  function phaseChecklist(phase) {
    var done = phase.items.filter(function (it) { return S.checklist[it.id]; }).length;
    var rows = phase.items.map(function (it) {
      var checked = !!S.checklist[it.id];
      var link = "";
      if (it.link) {
        link = it.ext
          ? '<a class="check-link" href="' + it.link + '" target="_blank" rel="noopener">' + ICONS.ext + "</a>"
          : '<a class="check-link" href="' + it.link + '">' + ICONS.chev + "</a>";
      }
      return '<div class="checkrow' + (checked ? " done" : "") + '">' +
        '<label class="check-main"><input type="checkbox" data-check="' + it.id + '"' + (checked ? " checked" : "") + ">" +
        '<span class="cbox"></span><span class="check-text">' + esc(it.text) +
        (it.hint ? "<small>" + esc(it.hint) + "</small>" : "") + "</span></label>" + link + "</div>";
    }).join("");
    return { html: rows, done: done, total: phase.items.length };
  }

  function viewNow() {
    var steps = nextSteps();
    var html = card(timeline(), "tl-card");

    var first = steps[0];
    html += '<section class="card next-hero">' +
      '<span class="nh-tag">下一步 · ' + first.tag + "</span>" +
      "<h2>" + first.title + "</h2><p>" + first.body + "</p>" +
      stepCta(first, "btn btn-cta btn-block") + "</section>";

    if (steps.length > 1) {
      html += '<p class="group-title">然后可以</p>' + steps.slice(1).map(function (st) {
        var inner = '<span class="nm-main"><b>' + st.title + "</b><small>" + st.body + "</small></span>" + ICONS.chev;
        if (st.sheet) return '<button class="card next-mini" data-act="sheet-open" data-sheet="' + st.sheet + '">' + inner + "</button>";
        if (st.ext) return '<a class="card next-mini" href="' + st.ext + '" target="_blank" rel="noopener">' + inner + "</a>";
        return '<a class="card next-mini" href="' + st.to + '">' + inner + "</a>";
      }).join("");
    }

    var phaseMap = { before: "p1", scored: "p2", after: "p3" };
    var curId = phaseMap[S.profile.phase] || "p1";
    var cur = null, others = [];
    DATA.phases.forEach(function (ph) { if (ph.id === curId) cur = ph; else others.push(ph); });
    if (!cur) { cur = DATA.phases[0]; others = DATA.phases.slice(1); }
    var cl = phaseChecklist(cur);
    html += card('<div class="phase-head"><div><h3>本阶段清单</h3><p class="phase-meta">' + esc(cur.period) + " · " + esc(cur.goal) + "</p></div>" +
      '<span class="phase-count">' + cl.done + "/" + cl.total + "</span></div>" +
      progressBar(cl.done / cl.total * 100) +
      '<div class="checklist">' + cl.html + "</div>" +
      '<div class="acc' + accCls("now-others") + '" data-aid="now-others"><button class="acc-head" data-act="acc">其他阶段的清单 ' + ICONS.down + "</button>" +
      '<div class="acc-body">' + others.map(function (ph) {
        var c = phaseChecklist(ph);
        return '<p class="lbl">' + esc(ph.name) + "（" + c.done + "/" + c.total + "）</p>" + '<div class="checklist">' + c.html + "</div>";
      }).join("") + "</div></div>");

    html += card('<div class="acc' + accCls("now-th") + '" data-aid="now-th"><button class="acc-head" data-act="acc">三个关键信号 · 何时调整策略 ' + ICONS.down + "</button>" +
      '<div class="acc-body">' + DATA.thresholds.map(function (t) {
        return '<div class="th-row"><p class="th-when">' + esc(t.when) + '</p><p class="th-then">' + esc(t.then) + "</p></div>";
      }).join("") + "</div></div>");

    html += card('<div class="id-row"><span class="lbl-inline">我的身份</span>' +
      '<button class="chip chip-pick' + (!isParent() ? " on" : "") + '" style="--tc:#1450A3" data-act="set-persona" data-v="student">考生</button>' +
      '<button class="chip chip-pick' + (isParent() ? " on" : "") + '" style="--tc:#1450A3" data-act="set-persona" data-v="parent">家长</button>' +
      '<small class="id-hint">阶段不对？点上方时间线切换</small></div>');

    html += '<blockquote class="quote">“' + DATA.app.quote + '”<cite>—— ' + DATA.app.quoteBy + "</cite></blockquote>";
    return html;
  }

  /* ---------------- 视图：探索（罗盘） ---------------- */
  function compassGrid() {
    var hist = S.riasec.history;
    var quizStatus = (S.riasec.inProgress || answeredCount() > 0)
      ? "进行中 " + answeredCount() + "/" + DATA.riasec.questions.length
      : hist.length ? esc(hist[0].code) + " · 已完成" : "未开始 · 约 6 分钟";
    var odN = ["a", "b", "c"].filter(function (k) { return S.odyssey[k].title && S.odyssey[k].title.trim(); }).length;
    var ivDone = S.interviews.filter(function (i) { return i.status === "done"; }).length;
    var flowSt = (S.flows.length || S.achievements.length)
      ? S.flows.length + " 条线索 · " + S.achievements.length + " 件成就"
      : "未开始 · 天赋线索";
    var ivSt = S.interviews.length
      ? ivDone + "/" + S.interviews.length + " 场已完成"
      : "未开始 · 建议 2–3 场";
    var tiles = [
      { to: "#/compass/quiz", icon: ICONS.target, name: "兴趣测评", st: quizStatus, done: !!hist.length },
      { to: "#/compass/flow", icon: ICONS.star, name: "心流与成就", st: flowSt, done: S.flows.length >= 3 },
      { to: "#/compass/odyssey", icon: ICONS.route, name: "奥德赛计划", st: odN ? odN + "/3 个版本已写" : "未开始 · 三种五年", done: odN === 3 },
      { to: "#/compass/interview", icon: ICONS.chat, name: "人物访谈", st: ivSt, done: ivDone >= 2 }
    ];
    return '<div class="grid2">' + tiles.map(function (t) {
      return '<a class="tile' + (t.done ? " tile-done" : "") + '" href="' + t.to + '">' +
        '<span class="tile-ic">' + t.icon + "</span><b>" + t.name + "</b><small>" + t.st + "</small>" + "</a>";
    }).join("") + "</div>";
  }

  function viewCompass() {
    var html = compassGrid();
    var hist = S.riasec.history;

    if (S.riasec.inProgress || answeredCount() > 0) {
      html += card('<span class="nh-tag">进行中</span><h2>测评还差几步</h2><p>已完成 ' + answeredCount() + " / " + DATA.riasec.questions.length + ' 题，进度已保存。</p>' +
        '<a class="btn btn-cta btn-block" href="#/compass/quiz">继续测评</a>', "next-hero");
    } else if (hist.length) {
      var h = hist[0];
      var sorted = sortTypes(h.scores);
      var top = sorted.slice(0, 3);
      var codeHtml = top.map(function (t) {
        return '<span class="code-letter" style="color:' + DATA.riasec.types[t].color + '">' + t + "</span>";
      }).join("");
      html += card('<p class="lbl">我的霍兰德代码 · ' + fmtDate(h.date) + "</p>" +
        '<div class="code-row">' + codeHtml + "</div>" +
        radarSvg(h.scores) +
        '<a class="btn btn-ghost btn-block" href="#/compass/quiz">查看完整解读</a>', "cmp-hero");
    } else {
      html += card('<span class="nh-tag">从这里开始</span><h2>先做兴趣测评</h2><p>6 分钟，看清你的兴趣指向哪片海域。结果是草稿，不是判决书。</p>' +
        '<a class="btn btn-cta btn-block" href="#/compass/quiz">开始测评</a>', "next-hero");
    }

    var hot = S.flows.filter(function (f) { return (f.signals || []).length >= 3; });
    var gains = S.interviews.filter(function (i) { return i.gain && i.gain.trim(); });
    var glance = "";
    if (hot.length) {
      glance += '<p class="lbl">强信号活动（≥3 个心流信号）</p><div class="chips">' +
        hot.map(function (f) { return '<span class="chip chip-hot">' + esc(f.activity) + "</span>"; }).join("") + "</div>";
    }
    if (S.achievements.length) {
      glance += '<p class="lbl">反复出现的动机</p><div class="chips">' +
        S.achievements.slice(0, 4).map(function (a) { return '<span class="chip chip-soft">' + esc(a.pattern || a.event) + "</span>"; }).join("") + "</div>";
    }
    if (gains.length) {
      glance += '<p class="lbl">访谈收获</p>' +
        gains.slice(0, 2).map(function (i) { return '<p class="iv-quote">“' + esc(i.gain) + '”<small>—— 访谈 ' + esc(i.person) + "</small></p>"; }).join("");
    }
    if (!glance) glance = '<p class="sec-sub">记录会汇聚到这里：心流强信号、动机模式、访谈收获——你的画像正在成形。</p>';
    html += card('<div class="sec-head"><h3>画像速览</h3></div>' + glance +
      '<div class="btn-row"><button class="btn btn-ghost" data-act="sheet-open" data-sheet="flow">' + ICONS.plus + ' 记心流</button>' +
      '<button class="btn btn-ghost" data-act="sheet-open" data-sheet="ach">' + ICONS.plus + ' 写成就</button>' +
      '<button class="btn btn-ghost" data-act="sheet-open" data-sheet="iv">' + ICONS.plus + ' 加访谈</button></div>');

    html += '<a class="card next-mini" href="#/compass/quiz"><span class="nm-main"><b>更多权威免费测评</b><small>VIA 性格优势 · 阳光志愿四维 · 学职平台 · 大五人格</small></span>' + ICONS.chev + "</a>";
    return html;
  }

  /* ---------------- 视图：兴趣测评页 ---------------- */
  function viewToolsSection() {
    var cards = DATA.tools.map(function (t) {
      var head = '<div class="tool-head"><b>' + esc(t.name) + '</b><span class="badge badge-' + t.grade + '">' + esc(t.badge) + "</span></div>";
      var body = "<p>" + esc(t.desc) + "</p>";
      var link = t.url ? '<a class="tool-link" href="' + t.url + '" target="_blank" rel="noopener">前往 ' + ICONS.ext + "</a>" : "";
      return '<div class="tool">' + head + body + link + "</div>";
    }).join("");
    return card("<h3>更多权威免费测评</h3>" + cards +
      '<div class="acc' + accCls("tools-sci") + '" data-aid="tools-sci"><button class="acc-head" data-act="acc">测评的科学性怎么看 ' + ICONS.down + "</button>" +
      '<div class="acc-body"><p>' + esc(DATA.toolsNote) + "</p></div></div>");
  }

  function viewQuiz() {
    var r = S.riasec;
    var qs = DATA.riasec.questions;

    if (r.inProgress) {
      var i = Math.min(r.idx, qs.length - 1);
      var q = qs[i];
      var cur = r.answers[i];
      var btns = DATA.riasec.scale.map(function (s) {
        return '<button class="scale-btn' + (cur === s.v ? " active" : "") + '" data-act="riasec-answer" data-v="' + s.v + '">' +
          "<b>" + s.label + "</b><small>" + s.hint + "</small></button>";
      }).join("");
      return card('<div class="quiz">' +
        progressBar((i / qs.length) * 100) +
        '<p class="quiz-num">第 ' + (i + 1) + " / " + qs.length + " 题</p>" +
        '<p class="quiz-lead">你对这件事的喜欢程度——</p>' +
        '<h2 class="quiz-q">' + esc(q.text) + "</h2>" +
        '<div class="scale-btns">' + btns + "</div>" +
        '<div class="quiz-nav">' +
        '<button class="btn btn-ghost btn-sm" data-act="riasec-prev"' + (i === 0 ? " disabled" : "") + ">上一题</button>" +
        '<button class="btn btn-ghost btn-sm" data-act="riasec-quit">保存并退出</button>' +
        "</div></div>", "quiz-card");
    }

    var html = "";
    var n = answeredCount();

    if (n > 0) {
      html += card("<h3>测评进行中</h3><p>已完成 " + n + " / " + qs.length + " 题，进度已保存。</p>" +
        '<div class="btn-row"><button class="btn btn-cta" data-act="riasec-resume">继续测评</button>' +
        '<button class="btn btn-ghost" data-act="riasec-retake">重新开始</button></div>');
    } else if (r.history.length) {
      var h = r.history[0];
      var sorted = sortTypes(h.scores);
      var top = sorted.slice(0, 3);
      var codeHtml = top.map(function (t) {
        return '<span class="code-letter" style="color:' + DATA.riasec.types[t].color + '">' + t + "</span>";
      }).join("");
      var dist = hexDistance(top[0], top[1]);
      var distNote = dist === 1
        ? "你的前两位类型在六边形上相邻，兴趣结构比较一致。"
        : dist === 2
          ? "你的前两位类型在六边形上隔了一位，兴趣有一定跨度。"
          : "你的前两位类型恰好处于对角——兴趣面较宽，或者仍在分化中，这很正常。";
      var bars = sorted.map(function (t) {
        var info = DATA.riasec.types[t];
        var pct = h.scores[t] / DATA.riasec.maxPerType * 100;
        return '<div class="tbar"><span class="tbar-tag" style="background:' + info.color + '">' + t + "</span>" +
          '<span class="tbar-name">' + info.name + "</span>" +
          '<div class="bar"><i style="width:' + pct + "%;background:" + info.color + '"></i></div>' +
          '<span class="tbar-val">' + h.scores[t] + "/" + DATA.riasec.maxPerType + "</span></div>";
      }).join("");
      var typeCards = top.map(function (t, idx) {
        var info = DATA.riasec.types[t];
        return '<div class="acc' + (idx === 0 ? " open" : "") + '">' +
          '<button class="acc-head" data-act="acc"><span class="tbar-tag" style="background:' + info.color + '">' + t + "</span> " +
          info.name + " · " + info.alias + " " + ICONS.down + "</button>" +
          '<div class="acc-body"><p>' + info.desc + "</p>" +
          '<p class="lbl">可能合拍的专业方向</p><div class="chips">' + info.majors.map(function (m) { return '<span class="chip">' + m + "</span>"; }).join("") + "</div>" +
          '<p class="lbl">典型职业</p><div class="chips">' + info.careers.map(function (m) { return '<span class="chip chip-soft">' + m + "</span>"; }).join("") + "</div>" +
          "</div></div>";
      }).join("");
      var histList = r.history.length > 1
        ? '<p class="lbl">历史记录</p>' + r.history.slice(1).map(function (x) {
            return '<p class="hist-row">' + fmtDate(x.date) + " · " + esc(x.code) + "</p>";
          }).join("")
        : "";
      html += card('<div class="result-head"><p class="lbl">我的霍兰德代码 · ' + fmtDate(h.date) + "</p>" +
        '<div class="code-row">' + codeHtml + "</div>" +
        "<p>" + distNote + "</p></div>" +
        radarSvg(h.scores) +
        '<div class="tbars">' + bars + "</div>" +
        '<p class="note">' + esc(DATA.riasec.note) + "</p>", "result-card");
      html += card("<h3>前三型解读</h3>" + typeCards +
        '<div class="btn-row"><a class="btn btn-cta" href="#/chart">把感兴趣的方向加进决策</a>' +
        '<button class="btn btn-ghost" data-act="riasec-share">生成分享图</button>' +
        '<button class="btn btn-ghost" data-act="riasec-retake">重新测评</button></div>' + histList);
    } else {
      html += card("<h3>霍兰德兴趣探索</h3><p>" + esc(DATA.riasec.intro) + "</p>" +
        '<p class="note">' + qs.length + " 道题 · 约 6 分钟 · 进度自动保存</p>" +
        '<button class="btn btn-cta btn-block" data-act="riasec-start">开始测评</button>');
    }

    html += viewToolsSection();
    return html;
  }

  /* ---------------- 视图：心流与成就页 ---------------- */
  function viewFlowPage() {
    var html = card("<h3>心流时刻清单</h3><p>" + esc(DATA.flowIntro) + "</p>" +
      '<button class="btn btn-cta btn-block" data-act="sheet-open" data-sheet="flow">' + ICONS.plus + " 记一个心流时刻</button>");

    var strong = S.flows.filter(function (f) { return (f.signals || []).length >= 3; });
    if (strong.length) {
      html += card('<h3>天赋线索小结</h3><p>这些活动出现了 3 个以上信号，值得认真对待：</p><div class="chips">' +
        strong.map(function (f) { return '<span class="chip chip-hot">' + esc(f.activity) + "</span>"; }).join("") + "</div>", "hint-card");
    }

    if (S.flows.length) {
      html += S.flows.map(function (f) {
        var chips = (f.signals || []).filter(function (i) { return DATA.flowSignals[i] !== undefined; })
          .map(function (i) { return '<span class="chip chip-soft">' + DATA.flowSignals[i] + "</span>"; }).join("");
        return card('<div class="item-head"><b>' + esc(f.activity) + "</b>" +
          '<button class="icon-btn" data-act="flow-del" data-id="' + f.id + '" aria-label="删除">' + ICONS.trash + "</button></div>" +
          (f.when ? '<p class="item-meta">' + esc(f.when) + "</p>" : "") +
          (chips ? '<div class="chips">' + chips + "</div>" : "") +
          (f.note ? '<p class="item-note">' + esc(f.note) + "</p>" : ""), "item-card");
      }).join("");
    } else {
      html += empty("还没有记录。回想过去三年：做什么时会忘记时间？");
    }

    html += card("<h3>成就事件分析</h3><p>" + esc(DATA.achieveIntro) + "</p>" +
      '<button class="btn btn-ghost btn-block" data-act="sheet-open" data-sheet="ach">' + ICONS.plus + " 写一件成就事件</button>" +
      (S.achievements.length ? S.achievements.map(function (a) {
        return '<div class="ach"><div class="item-head"><b>' + esc(a.event) + "</b>" +
          '<button class="icon-btn" data-act="ach-del" data-id="' + a.id + '" aria-label="删除">' + ICONS.trash + "</button></div>" +
          (a.role ? '<p class="item-meta">我做了：' + esc(a.role) + "</p>" : "") +
          (a.pattern ? '<p class="item-note">动机模式：' + esc(a.pattern) + "</p>" : "") + "</div>";
      }).join("") : ""));
    return html;
  }

  /* ---------------- 视图：奥德赛页 ---------------- */
  function odysseyCompare() {
    if (!odysseyTouched()) return "";
    var vs = DATA.odyssey.versions;
    var best = null, bestVal = -1;
    ["a", "b", "c"].forEach(function (k) {
      var od = S.odyssey[k];
      if (od.title && od.title.trim() && od.gauges.like > bestVal) { bestVal = od.gauges.like; best = k; }
    });
    var head = '<div class="odc-row odc-head"><span class="odc-lbl"></span>' + vs.map(function (v) {
      return '<span class="odc-cell odc-' + v.key + '">' + v.name.split(" · ")[1] + "</span>";
    }).join("") + "</div>";
    var titleRow = '<div class="odc-row"><span class="odc-lbl">六字标题</span>' + vs.map(function (v) {
      var t = S.odyssey[v.key].title;
      return '<span class="odc-cell">' + (t ? "<b>" + esc(t) + "</b>" : '<i class="odc-empty">未写</i>') + "</span>";
    }).join("") + "</div>";
    var gaugeRows = DATA.odyssey.gauges.map(function (g) {
      return '<div class="odc-row"><span class="odc-lbl">' + g.name + "</span>" + vs.map(function (v) {
        var val = S.odyssey[v.key].gauges[g.key];
        return '<span class="odc-cell"><i class="odc-bar"><b style="width:' + val + '%"></b></i>' + val + "</span>";
      }).join("") + "</div>";
    }).join("");
    var qRow = '<div class="odc-row"><span class="odc-lbl">待解问题</span>' + vs.map(function (v) {
      var n = (S.odyssey[v.key].questions || "").split("\n").filter(function (x) { return x.trim(); }).length;
      return '<span class="odc-cell">' + n + " 个</span>";
    }).join("") + "</div>";
    var insight = best
      ? '<p class="note">此刻最让你心动的是「' + esc(S.odyssey[best].title) + "」（喜欢 " + bestVal + "）。和家人聊聊：它哪一点吸引你？哪些待解问题可以先去验证？</p>"
      : "";
    return card('<h3>三版对比</h3><div class="odc">' + head + titleRow + gaugeRows + qRow + "</div>" + insight);
  }

  function viewOdysseyPage() {
    var html = card("<h3>奥德赛计划 · 三个五年</h3><p>" + esc(DATA.odyssey.intro) + '</p><p class="note">内容自动保存在本机。</p>');
    html += odysseyCompare();
    html += DATA.odyssey.versions.map(function (v) {
      var od = S.odyssey[v.key];
      var years = od.years.map(function (y, i) {
        return '<input class="input" maxlength="60" value="' + esc(y) + '" data-od="' + v.key + '" data-y="' + i + '" placeholder="第 ' + (i + 1) + ' 年：关键事件 / 里程碑">';
      }).join("");
      var gauges = DATA.odyssey.gauges.map(function (g) {
        return sliderRow(g.name, 'data-od="' + v.key + '" data-gauge="' + g.key + '"', od.gauges[g.key], 0, 100, g.hint);
      }).join("");
      return card('<div class="od-head od-' + v.key + '"><h3>' + v.name + "</h3><p>" + v.desc + "</p></div>" +
        '<input class="input input-title" maxlength="12" value="' + esc(od.title) + '" data-od="' + v.key + '" data-field="title" placeholder="六字标题：用六个字概括这版人生">' +
        '<p class="lbl">五年时间线</p>' + years +
        '<p class="lbl">仪表盘（0–100）</p>' + gauges +
        '<p class="lbl">待解问题</p>' +
        '<textarea class="input" rows="2" data-od="' + v.key + '" data-field="questions" placeholder="这版人生还有哪些待解的问题？（每行一个）">' + esc(od.questions) + "</textarea>");
    }).join("");
    return html;
  }

  /* ---------------- 视图：访谈页 ---------------- */
  function viewInterviewPage() {
    var html = card("<h3>生涯人物访谈</h3><p>" + esc(DATA.interview.intro) + "</p>" +
      '<p class="lbl">四个推荐问题</p><ol class="qlist">' +
      DATA.interview.questions.map(function (q) { return "<li>" + q + "</li>"; }).join("") + "</ol>" +
      '<button class="btn btn-cta btn-block" data-act="sheet-open" data-sheet="iv">' + ICONS.plus + " 添加访谈对象</button>");

    if (S.interviews.length) {
      html += S.interviews.map(function (iv) {
        var st = null;
        DATA.interview.statuses.forEach(function (s) { if (s.key === iv.status) st = s; });
        st = st || DATA.interview.statuses[0];
        var qa = DATA.interview.questions.map(function (q, qi) {
          return '<p class="lbl">' + q + "</p>" +
            '<textarea class="input" rows="2" data-iid="' + iv.id + '" data-q="' + qi + '" placeholder="对方的回答…">' + esc(iv.answers[qi] || "") + "</textarea>";
        }).join("");
        return '<section class="card item-card acc' + accCls("iv-" + iv.id) + '" data-aid="iv-' + iv.id + '">' +
          '<div class="item-head">' +
          '<button class="acc-head iv-head" data-act="acc"><b>' + esc(iv.person) + "</b>" +
          (iv.occupation ? '<span class="item-meta">' + esc(iv.occupation) + "</span>" : "") + " " + ICONS.down + "</button>" +
          '<button class="chip chip-status st-' + st.key + '" data-act="iv-status" data-id="' + iv.id + '">' + st.name + "</button></div>" +
          (iv.relation ? '<p class="item-meta">' + esc(iv.relation) + "</p>" : "") +
          '<div class="acc-body">' + qa +
          '<p class="lbl">我的收获</p>' +
          '<textarea class="input" rows="2" data-iid="' + iv.id + '" data-field="gain" placeholder="听完之后，对这条路的想象有什么变化？">' + esc(iv.gain || "") + "</textarea>" +
          '<button class="btn btn-ghost btn-sm btn-danger-text" data-act="iv-del" data-id="' + iv.id + '">' + ICONS.trash + " 删除这条访谈</button>" +
          "</div></section>";
      }).join("");
    } else {
      html += empty("还没有访谈对象。从亲友、校友里找 3–5 位目标行业的人开始吧。");
    }
    return html;
  }

  /* ---------------- 视图：航海图 ---------------- */
  function chartSeg(active) {
    return '<div class="seg">' +
      '<a class="seg-btn' + (active === "pool" ? " active" : "") + '" href="#/chart">方向池与打分</a>' +
      '<a class="seg-btn' + (active === "tier" ? " active" : "") + '" href="#/chart/tier">冲稳保</a>' +
      '<a class="seg-btn' + (active === "rank" ? " active" : "") + '" href="#/chart/rank">位次定位</a>' +
      "</div>";
  }

  function viewChart(sub) {
    if (sub === "tier") return chartSeg("tier") + viewTier();
    if (sub === "rank") return chartSeg("rank") + viewRank();
    return chartSeg("pool") + viewPool();
  }

  /* ---------------- 视图：位次定位 ---------------- */
  function viewRank() {
    var rk = S.decision.rank;
    var html = card("<h3>位次定位</h3><p>" + esc(DATA.rank.intro) + "</p>" +
      '<div class="row2">' +
      '<input class="input" type="number" min="1" inputmode="numeric" value="' + (rk.mine || "") + '" data-rank="mine" placeholder="我的全省位次（必填）">' +
      '<input class="input" type="number" min="1" inputmode="numeric" value="' + (rk.total || "") + '" data-rank="total" placeholder="全省考生数（选填）">' +
      "</div>" +
      (rk.mine && rk.total && rk.total >= rk.mine
        ? '<p class="note">你大约位于全省前 ' + (rk.mine / rk.total * 100).toFixed(1) + "%。</p>"
        : rk.mine && rk.total && rk.total < rk.mine
          ? '<p class="note">考生总数应不小于你的位次，请检查两个数字。</p>'
          : '<p class="note">位次查本省考试院的「一分一段表」。</p>'));

    var targets = S.decision.candidates.filter(function (c) { return c.pastRank > 0; });
    if (!rk.mine) {
      html += empty("先填写你的位次，再给方向池里的目标补上「往年最低位次」，这里会给出冲稳保参考。");
    } else if (!targets.length) {
      html += empty("方向池里还没有目标填写「往年最低位次」。在方案卡片或添加方向时补上即可。");
    } else {
      html += card("<h3>对照参考</h3>" + targets.map(function (c) {
        var r = c.pastRank / rk.mine;
        var sug, warn = "";
        if (r >= 1.2) sug = "safe";
        else if (r >= 0.95) sug = "steady";
        else if (r >= 0.8) sug = "rush";
        else { sug = "rush"; warn = "，差距较大请谨慎"; }
        var t = tierInfo(sug);
        var diff = Math.round((r - 1) * 100);
        return '<div class="rank-row"><div class="rank-main"><b>' + esc(c.school) + (c.major ? " · " + esc(c.major) : "") + "</b>" +
          '<small class="item-meta">往年位次 ' + c.pastRank + "：" +
          (diff >= 0 ? "比你靠后 " + diff + "%" : "比你靠前 " + (-diff) + "%") + esc(warn) + "</small></div>" +
          '<span class="chip chip-tier" style="background:' + t.color + '">' + t.name + "</span>" +
          (c.tier === sug ? "" : '<button class="chip chip-pick" style="--tc:' + t.color + '" data-act="cand-tier" data-id="' + c.id + '" data-tier="' + sug + '">采纳</button>') +
          "</div>";
      }).join(""));
    }

    html += card('<h3>怎么用</h3><ol class="qlist">' + DATA.rank.tips.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ol>" +
      '<p class="note">' + esc(DATA.rank.disclaimer) + "</p>");
    return html;
  }

  function viewPool() {
    var cands = S.decision.candidates;
    var html = card("<h3>方向池 · 决策平衡单</h3><p>" + esc(DATA.decision.intro) + "</p>" +
      '<button class="btn btn-cta btn-block" data-act="sheet-open" data-sheet="cand">' + ICONS.plus + " 添加一个方向</button>" +
      '<p class="note">出分前先把「隐约感兴趣」的方向囤进来，出分后再打分。</p>');

    var wRows = DATA.decision.dims.map(function (d) {
      return sliderRow(d.name, 'data-w="' + d.key + '"', S.decision.weights[d.key], 1, 5, d.hint);
    }).join("");
    html += card('<div class="acc' + accCls("weights") + '" data-aid="weights"><button class="acc-head" data-act="acc">你看重什么 · 维度权重（1–5） ' + ICONS.down + "</button>" +
      '<div class="acc-body">' + wRows + "</div></div>");

    if (cands.length >= 2) {
      var ranked = cands.slice().sort(function (a, b) { return candidateScore(b) - candidateScore(a); });
      html += card("<h3>综合排序</h3>" + ranked.map(function (c, i) {
        var pct = candidateScore(c);
        var t = tierInfo(c.tier);
        return '<div class="rank-row"><span class="rank-num">' + (i + 1) + "</span>" +
          '<div class="rank-main"><b>' + esc(c.school) + (c.major ? " · " + esc(c.major) : "") + "</b>" +
          progressBar(pct) + "</div>" +
          '<span class="chip chip-tier" style="background:' + t.color + '">' + t.name + "</span>" +
          '<span class="rank-pct">' + pct + "</span></div>";
      }).join("") + '<p class="note">分数只是把权衡「摆上桌面」的工具，最终请结合位次与老师意见。</p>');
    }

    if (cands.length) {
      html += cands.map(function (c) {
        var tierChips = DATA.decision.tiers.map(function (t) {
          return '<button class="chip chip-pick' + (c.tier === t.key ? " on" : "") + '" style="--tc:' + t.color + '" data-act="cand-tier" data-id="' + c.id + '" data-tier="' + t.key + '">' + t.name + "</button>";
        }).join("");
        var dims = DATA.decision.dims.map(function (d) {
          return sliderRow(d.name, 'data-cid="' + c.id + '" data-dim="' + d.key + '"', Number(c.scores[d.key]) || 0, 0, 10, d.hint);
        }).join("");
        return card('<div class="item-head"><div><b>' + esc(c.school) + "</b>" +
          '<p class="item-meta">' + (c.major ? esc(c.major) : "未填专业") + (c.city ? " · " + esc(c.city) : "") + "</p></div>" +
          '<div class="cand-side"><span class="cand-total" id="cand-total-' + c.id + '">' + candidateScore(c) + "</span>" +
          '<button class="icon-btn" data-act="cand-del" data-id="' + c.id + '" aria-label="删除">' + ICONS.trash + "</button></div></div>" +
          '<div class="chips">' + tierChips + "</div>" + dims +
          '<input class="input" type="number" min="1" inputmode="numeric" value="' + (c.pastRank || "") + '" data-cid="' + c.id + '" data-field="pastRank" placeholder="往年最低位次（选填，供位次定位用）">' +
          '<textarea class="input" rows="2" data-cid="' + c.id + '" data-field="note" placeholder="备注 / SWOT：优势、劣势、机会、风险（选填）">' + esc(c.note || "") + "</textarea>", "item-card");
      }).join("");
    } else {
      html += empty("方向池还是空的。把隐约感兴趣的院校 / 专业先捞进来。");
    }
    return html;
  }

  function viewTier() {
    var html = "";
    var groups = ["rush", "steady", "safe"];
    var unset = S.decision.candidates.filter(function (c) { return !c.tier || c.tier === "unset"; });
    html += card("<h3>冲稳保梯度</h3><p>把候选方案按录取概率分为三档，形成有梯度的志愿表。</p>" +
      '<div class="tier-sum">' + groups.map(function (g) {
        var t = tierInfo(g);
        var n = S.decision.candidates.filter(function (c) { return c.tier === g; }).length;
        return '<span class="tier-pill" style="background:' + t.color + '">' + t.name + " " + n + "</span>";
      }).join("") + (unset.length ? '<span class="tier-pill" style="background:' + tierInfo("unset").color + '">未定 ' + unset.length + "</span>" : "") + "</div>" +
      '<p class="note">在「方向池」的方案卡片里点 冲 / 稳 / 保 即可归档。</p>');

    groups.forEach(function (g) {
      var t = tierInfo(g);
      var list = S.decision.candidates.filter(function (c) { return c.tier === g; });
      html += card('<div class="tier-head"><span class="chip chip-tier" style="background:' + t.color + '">' + t.name + "</span><small>" + esc(t.hint) + "</small></div>" +
        (list.length ? list.map(function (c) {
          return '<div class="rank-row"><div class="rank-main"><b>' + esc(c.school) + (c.major ? " · " + esc(c.major) : "") + "</b></div>" +
            '<span class="rank-pct">' + candidateScore(c) + "</span></div>";
        }).join("") : empty("暂无方案")));
    });

    html += card('<h3>填报提醒</h3><ol class="qlist">' + DATA.decision.tierTips.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ol>" +
      '<p class="item-note">' + esc(DATA.decision.tradeoff) + "</p>" +
      '<button class="btn btn-ghost btn-block" data-act="export-print">导出打印版志愿表（可存 PDF）</button>' +
      '<a class="btn btn-block" href="https://gaokao.chsi.com.cn/zyck/" target="_blank" rel="noopener">打开教育部「阳光志愿」系统 ' + ICONS.ext + "</a>");
    return html;
  }

  /* ---------------- 视图：选科参考 ---------------- */
  function viewSubjects() {
    var sel = S.subjects;
    var chipsHtml = DATA.subjects.list.map(function (s) {
      var on = sel.indexOf(s) >= 0;
      return '<button class="chip chip-pick' + (on ? " on" : "") + '" style="--tc:#1450A3" data-act="subj-toggle" data-v="' + s + '">' + s + "</button>";
    }).join("");
    var html = card("<h3>选科组合参考</h3><p>" + esc(DATA.subjects.intro) + "</p>" +
      '<p class="lbl">选出 3 科（' + sel.length + "/3）</p>" +
      '<div class="chips">' + chipsHtml + "</div>");

    if (sel.length === 3) {
      var hasP = sel.indexOf("物理") >= 0, hasC = sel.indexOf("化学") >= 0, hasB = sel.indexOf("生物") >= 0;
      var v;
      if (hasP && hasC) v = DATA.subjects.verdicts.pc;
      else if (hasP) v = DATA.subjects.verdicts.p;
      else if (hasC) v = DATA.subjects.verdicts.c;
      else if (!hasB) v = DATA.subjects.verdicts.lib;
      else v = DATA.subjects.verdicts.other;
      html += card('<span class="nh-tag">' + sel.join(" + ") + "</span><h2>" + esc(v.title) + "</h2><p>" + esc(v.desc) + "</p>" +
        '<p class="lbl">大致适配方向</p><div class="chips">' +
        v.dirs.map(function (d) { return '<span class="chip">' + esc(d) + "</span>"; }).join("") + "</div>", "next-hero");
    } else {
      html += empty("选满 3 科后给出参考结论。");
    }

    html += card('<p class="note">' + esc(DATA.subjects.disclaimer) + "</p>" +
      '<a class="btn btn-block" href="https://gaokao.chsi.com.cn/zyck/" target="_blank" rel="noopener">在「阳光志愿」查询选科要求 ' + ICONS.ext + "</a>");
    return html;
  }

  /* ---------------- 视图：更多 ---------------- */
  function viewMore(sub) {
    if (sub === "parents") return viewParents();
    if (sub === "knowledge") return viewKnowledge();
    if (sub === "subjects") return viewSubjects();
    if (sub === "data") return viewData();
    if (sub === "about") return viewAbout();

    var items = [
      { to: "#/more/parents", name: "家长专区", desc: "自主支持，而非包办" },
      { to: "#/more/knowledge", name: "知识库", desc: "22 张理论卡片，按需取用" },
      { to: "#/more/subjects", name: "选科参考", desc: "给学弟学妹：3 科怎么选" },
      { to: "#/more/data", name: "数据管理", desc: "导出 / 导入 / 清空本机数据" },
      { to: "#/more/about", name: "关于与声明", desc: "版本 · 依据 · 局限" }
    ];

    var html = "";
    if (deferredPrompt) {
      html += card('<h3>安装到主屏幕</h3><p>像原生 App 一样离线使用，数据保存在本机。</p>' +
        '<button class="btn btn-cta btn-block" data-act="install">安装应用</button>', "install-card");
    }
    html += card(items.map(function (it) {
      return '<a class="navrow" href="' + it.to + '"><div><b>' + it.name + "</b><small>" + it.desc + "</small></div>" + ICONS.chev + "</a>";
    }).join("") +
      '<button class="navrow" data-act="sheet-open" data-sheet="fb"><span><b>意见反馈</b><small>问题、建议都欢迎——反馈会进入迭代循环</small></span>' + ICONS.chev + "</button>");

    html += card('<div class="id-row"><span class="lbl-inline">身份</span>' +
      '<button class="chip chip-pick' + (!isParent() ? " on" : "") + '" style="--tc:#1450A3" data-act="set-persona" data-v="student">考生</button>' +
      '<button class="chip chip-pick' + (isParent() ? " on" : "") + '" style="--tc:#1450A3" data-act="set-persona" data-v="parent">家长</button></div>' +
      '<div class="id-row"><span class="lbl-inline">阶段</span>' +
      DATA.onboarding.phases.map(function (p) {
        return '<button class="chip chip-pick' + (S.profile.phase === p.key ? " on" : "") + '" style="--tc:#1450A3" data-act="set-phase" data-v="' + p.key + '">' + p.name + "</button>";
      }).join("") + "</div>");
    return html;
  }

  function viewParents() {
    var p = DATA.parent;
    var html = card("<h3>为什么是「自主支持」</h3><p>" + esc(p.intro) + "</p>");
    html += card("<h3>家长的四个角色</h3>" + '<div class="roles">' + p.roles.map(function (r) {
      return '<div class="role"><b>' + r.name + "</b><small>" + r.desc + "</small></div>";
    }).join("") + "</div>");
    html += card("<h3>少做这些 → 多做这些</h3>" + p.compare.map(function (row) {
      return '<div class="cmp"><p class="cmp-bad">✕ ' + esc(row.bad) + '</p><p class="cmp-good">✓ ' + esc(row.good) + "</p></div>";
    }).join(""));
    html += p.sentences.map(function (s) {
      return '<blockquote class="quote quote-card">“' + esc(s.text) + '”<cite>' + esc(s.by) + "</cite></blockquote>";
    }).join("");
    html += card("<h3>四个提醒</h3>" + p.warnings.map(function (w, i) {
      return '<div class="acc' + accCls("pw-" + i, i === 0) + '" data-aid="pw-' + i + '"><button class="acc-head" data-act="acc">' + esc(w.title) + " " + ICONS.down + "</button>" +
        '<div class="acc-body"><p>' + esc(w.desc) + "</p></div></div>";
    }).join(""));
    html += card("<h3>日常观察法</h3><p>" + esc(p.observe) + "</p>" +
      '<button class="btn btn-ghost btn-block" data-act="sheet-open" data-sheet="flow">记一条心流线索</button>');
    return html;
  }

  function viewKnowledge() {
    return DATA.knowledge.map(function (g) {
      return '<h2 class="group-title">' + esc(g.group) + "</h2>" + g.items.map(function (it) {
        return card('<div class="acc"><button class="acc-head" data-act="acc"><span class="k-title">' + esc(it.title) +
          '</span><span class="k-core">' + esc(it.core) + "</span> " + ICONS.down + "</button>" +
          '<div class="acc-body"><p>' + esc(it.detail) + "</p>" +
          '<p class="k-tip">行动启示 · ' + esc(it.tip) + "</p></div></div>", "k-card");
      }).join("");
    }).join("");
  }

  function viewData() {
    return card("<h3>导出 / 互传备份</h3><p>把全部数据存为 JSON 文件。换设备、家长⇄考生两台手机互传，都靠它。</p>" +
      '<button class="btn btn-block" data-act="export">导出数据（' + Store.sizeKb() + ' KB）</button>' +
      '<button class="btn btn-ghost btn-block" data-act="share-backup">分享备份给另一台设备</button>' +
      '<p class="note">互传流程：本机「分享备份」→ 通过微信 / AirDrop 等发给对方 → 对方在「导入备份」中选择该文件。</p>') +
      card("<h3>导入备份</h3><p>选择之前导出的 JSON 文件，将覆盖当前数据。</p>" +
        '<input type="file" id="import-file" accept="application/json,.json" hidden>' +
        '<button class="btn btn-ghost btn-block" data-act="import">选择文件导入</button>') +
      card("<h3>清空数据</h3><p>删除本机上的全部记录，不可恢复。</p>" +
        '<button class="btn btn-danger btn-block" data-act="wipe">清空全部数据</button>') +
      card('<p class="note">隐私说明：你的全部数据仅保存在本机浏览器（localStorage），本应用没有服务器、不收集任何信息。</p>');
  }

  function viewAbout() {
    return card("<h3>" + DATA.app.name + " · v" + DATA.app.version + "</h3>" +
      "<p>高中毕业生升学与人生航向规划系统。" + esc(DATA.app.tagline) + "</p>" +
      '<p class="note">方法论依据：《发现天赋、找到方向》深度研究报告（仓库 docs/source-report.md）；交互与视觉设计逻辑见 docs/design.md。</p>') +
      card("<h3>安装为 App</h3><p>本应用是 PWA：支持离线使用、可安装到主屏幕。</p>" +
        (deferredPrompt ? '<button class="btn btn-cta btn-block" data-act="install">安装应用</button>' : "") +
        '<p class="note">iPhone / iPad：Safari 打开 → 分享 → 添加到主屏幕。安卓 / 桌面 Chrome、Edge：地址栏「安装」图标。</p>') +
      card('<h3>重要声明</h3><ol class="qlist">' + DATA.caveats.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ol>");
  }

  /* ---------------- 顶栏 / 标签栏 / 渲染 ---------------- */
  var TITLES = { compass: "探索 · 我是谁", chart: "决策 · 去哪里", more: "更多" };
  var COMPASS_SUBS = { quiz: "兴趣测评", flow: "心流与成就", odyssey: "奥德赛计划", interview: "人物访谈" };
  var MORE_SUBS = { parents: "家长专区", knowledge: "知识库", subjects: "选科参考", data: "数据管理", about: "关于与声明" };

  function renderTopbar(r) {
    var el = $("#topbar");
    if (r.page === "now") {
      el.innerHTML = '<div class="topbar-in"><h1 class="brand">' + DATA.app.name + '</h1><span class="brand-sub">' + DATA.app.title + "</span></div>";
      return;
    }
    var title = TITLES[r.page] || "";
    var back = "";
    if (r.page === "compass" && COMPASS_SUBS[r.sub]) {
      title = COMPASS_SUBS[r.sub];
      back = '<a class="back-btn" href="#/compass" aria-label="返回探索">' + ICONS.back + "</a>";
    } else if (r.page === "more" && MORE_SUBS[r.sub]) {
      title = MORE_SUBS[r.sub];
      back = '<a class="back-btn" href="#/more" aria-label="返回更多">' + ICONS.back + "</a>";
    }
    el.innerHTML = '<div class="topbar-in">' + back + '<h1 class="page-title">' + title + "</h1></div>";
  }

  function renderTabbar(r) {
    $("#tabbar").innerHTML = NAV.map(function (n) {
      var active = n.id === r.page;
      return '<a class="tab' + (active ? " active" : "") + '" href="#/' + n.id + '"' +
        (active ? ' aria-current="page"' : "") + ">" + n.icon + "<span>" + n.name + "</span></a>";
    }).join("");
  }

  var lastHash = "";
  function render() {
    var r = route();
    renderTopbar(r);
    renderTabbar(r);
    var v = $("#view");
    try {
      if (r.page === "compass") {
        if (r.sub === "quiz") v.innerHTML = viewQuiz();
        else if (r.sub === "flow") v.innerHTML = viewFlowPage();
        else if (r.sub === "odyssey") v.innerHTML = viewOdysseyPage();
        else if (r.sub === "interview") v.innerHTML = viewInterviewPage();
        else v.innerHTML = viewCompass();
      }
      else if (r.page === "chart") v.innerHTML = viewChart(r.sub);
      else if (r.page === "more") v.innerHTML = viewMore(r.sub);
      else v.innerHTML = viewNow();
    } catch (err) {
      // 渲染兜底：本地数据异常时给用户自救通道，而不是白屏
      console.error("render failed:", err);
      v.innerHTML = card("<h3>页面渲染出错</h3><p>本地数据可能已损坏。建议先导出备份，再清空数据恢复。</p>" +
        '<a class="btn btn-block" href="#/more/data">前往数据管理</a>' +
        '<p class="note">' + esc(String(err && err.message || err)) + "</p>");
    }
    // 折叠面板的可访问性状态（aria-expanded）
    $all(".acc", v).forEach(function (a) {
      var h = a.querySelector(".acc-head");
      if (h) h.setAttribute("aria-expanded", a.classList.contains("open") ? "true" : "false");
    });
    renderOnboarding();
    if (location.hash !== lastHash) {
      closeSheet();                      // 路由切换时收起浮层（含浏览器返回键）
      v.classList.remove("no-anim");     // 只有路由级导航播放入场动画
      window.scrollTo(0, 0);
      lastHash = location.hash;
    }
  }
  function rerenderKeep() {
    var y = window.scrollY;
    // 记住当前焦点控件（滑块按方向键时 change 会触发重渲染，焦点必须找回来）
    var ae = document.activeElement, sel = null;
    if (ae && ae.dataset) {
      if (ae.dataset.w) sel = '[data-w="' + ae.dataset.w + '"]';
      else if (ae.dataset.cid && ae.dataset.dim) sel = '[data-cid="' + ae.dataset.cid + '"][data-dim="' + ae.dataset.dim + '"]';
      else if (ae.dataset.od && ae.dataset.gauge) sel = '[data-od="' + ae.dataset.od + '"][data-gauge="' + ae.dataset.gauge + '"]';
      else if (ae.dataset.check) sel = '[data-check="' + ae.dataset.check + '"]';
    }
    $("#view").classList.add("no-anim"); // 原地刷新不重播入场动画
    render();
    window.scrollTo(0, y);
    if (sel) {
      var el = $(sel);
      if (el) el.focus({ preventScroll: true });
    }
  }

  /* ---------------- 事件：点击 ---------------- */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-act]");
    if (!btn) return;
    var act = btn.dataset.act;

    if (act === "noop") return;

    if (act === "acc") {
      var acc = btn.closest(".acc");
      if (acc) {
        var nowOpen = acc.classList.toggle("open");
        var aid = acc.getAttribute("data-aid");
        if (aid) openAcc[aid] = nowOpen;
        btn.setAttribute("aria-expanded", nowOpen ? "true" : "false");
      }
      return;
    }

    /* ---- 开场定向 ---- */
    if (act === "ob-persona") { ob.persona = btn.dataset.v; ob.step = 1; renderOnboarding(); return; }
    if (act === "ob-phase") { ob.phase = btn.dataset.v; ob.step = 2; renderOnboarding(); return; }
    if (act === "ob-back") { ob.step = Math.max(0, ob.step - 1); renderOnboarding(); return; }
    if (act === "ob-start") {
      S.profile.persona = ob.persona;
      S.profile.phase = ob.phase;
      S.profile.onboarded = true;
      saveNow();
      renderOnboarding();
      render();
      toast("起点已校准，欢迎登船");
      return;
    }

    /* ---- 身份 / 阶段 ---- */
    if (act === "set-phase") {
      if (S.profile.phase !== btn.dataset.v) {
        var st = null;
        DATA.stages.forEach(function (s) { if (s.key === btn.dataset.v) st = s; });
        if (!st) return;
        // 时间线节点是「状态切换」而非页面跳转，需确认以防误触
        if (btn.classList.contains("tl-node") &&
            !confirm("切换到「" + st.name + " · " + st.sub + "」阶段？\n「此刻」的推荐和清单会随之改变。")) return;
        S.profile.phase = btn.dataset.v;
        saveNow(); rerenderKeep();
        toast("已切换到「" + st.name + "」阶段");
      }
      return;
    }
    if (act === "set-persona") {
      if (S.profile.persona !== btn.dataset.v) {
        S.profile.persona = btn.dataset.v;
        saveNow(); rerenderKeep();
        toast(btn.dataset.v === "parent" ? "已切换为家长视角" : "已切换为考生视角");
      }
      return;
    }

    /* ---- 选科参考 ---- */
    if (act === "subj-toggle") {
      var sv = btn.dataset.v;
      var si = S.subjects.indexOf(sv);
      if (si >= 0) S.subjects.splice(si, 1);
      else if (S.subjects.length >= 3) { toast("最多选 3 科，先取消一科"); return; }
      else S.subjects.push(sv);
      saveNow(); rerenderKeep();
      return;
    }

    /* ---- 意见反馈 ---- */
    if (act === "fb-github" || act === "fb-copy") {
      var fbTxt = $("#fb-text").value.trim();
      if (!fbTxt) { toast("先写两句反馈吧"); return; }
      var fbCat = $("#fb-cat").value;
      var fbEnv = "v" + DATA.app.version + " · " + String(navigator.userAgent || "").slice(0, 60);
      if (act === "fb-github") {
        // 走 issue 模板：模板自带 feedback 标签对任何账号生效
        //（URL 的 labels 参数只对有仓库权限的用户生效，普通用户会静默丢标签）
        var fbUrl = DATA.app.repo + "/issues/new?template=feedback.yml" +
          "&title=" + encodeURIComponent("【" + fbCat + "】" + fbTxt.slice(0, 30)) +
          "&type=" + encodeURIComponent(fbCat) +
          "&desc=" + encodeURIComponent(fbTxt) +
          "&env=" + encodeURIComponent(fbEnv);
        var fa = document.createElement("a");
        fa.href = fbUrl;
        fa.target = "_blank";
        fa.rel = "noopener";
        document.body.appendChild(fa);
        fa.click();
        fa.remove();
        closeSheet();
        toast("已打开 GitHub，提交后即进入迭代循环");
      } else {
        var fbBody = "【类型】" + fbCat + "\n【描述】\n" + fbTxt +
          "\n\n【环境】" + fbEnv + "\n\n—— 来自应用内反馈";
        copyText(fbBody, function (ok) {
          if (ok) { toast("已复制，去粘贴给维护者吧"); closeSheet(); }
          else toast("复制失败，请长按选择文字手动复制");
        });
      }
      return;
    }

    /* ---- 分享 / 导出 / 更新 ---- */
    if (act === "riasec-share") { shareResult(); return; }
    if (act === "export-print") { exportPrint(); return; }
    if (act === "share-backup") {
      var bblob = new Blob([Store.exportJson(S)], { type: "application/json" });
      var bname = "pathfinder-backup-" + fmtDate(Date.now()) + ".json";
      try {
        var bfile = new File([bblob], bname, { type: "application/json" });
        if (navigator.canShare && navigator.canShare({ files: [bfile] })) {
          navigator.share({ files: [bfile], title: "PathFinder 数据备份" }).catch(function () { /* 用户取消 */ });
          return;
        }
      } catch (e) { /* 回退到下载 */ }
      downloadBlob(bblob, bname);
      toast("当前环境不支持直接分享，已改为下载文件");
      return;
    }
    if (act === "reload-app") { saveNow(); location.reload(); return; }
    if (act === "update-dismiss") {
      var ub = $("#update-bar");
      if (ub) ub.remove();
      return;
    }

    /* ---- 浮层 ---- */
    if (act === "sheet-open") { openSheet(btn.dataset.sheet, btn); return; }
    if (act === "sheet-close") { closeSheet(); return; }

    /* ---- 测评 ---- */
    if (act === "riasec-start" || act === "riasec-retake") {
      if (answeredCount() > 0 &&
          !confirm("重新开始会清空当前已作答的 " + answeredCount() + " 题，确定吗？")) return;
      S.riasec.answers = {};
      S.riasec.idx = 0;
      S.riasec.inProgress = true;
      saveNow(); render();
      return;
    }
    if (act === "riasec-resume") {
      S.riasec.inProgress = true;
      saveNow(); render();
      return;
    }
    if (act === "riasec-answer") {
      var i = S.riasec.idx;
      S.riasec.answers[i] = Number(btn.dataset.v);
      if (i + 1 >= DATA.riasec.questions.length) {
        finishRiasec();
      } else {
        S.riasec.idx = i + 1;
        saveSoon();
      }
      render();
      return;
    }
    if (act === "riasec-prev") {
      S.riasec.idx = Math.max(0, S.riasec.idx - 1);
      saveSoon();
      render();
      return;
    }
    if (act === "riasec-quit") {
      S.riasec.inProgress = false;
      saveNow(); render();
      toast("进度已保存，随时可以继续");
      return;
    }

    /* ---- 心流 / 成就 ---- */
    if (act === "flow-add") {
      var activity = $("#flow-activity").value.trim();
      if (!activity) { toast("请先填写活动名称"); return; }
      var signals = $all(".flow-sig").filter(function (c) { return c.checked; }).map(function (c) { return Number(c.value); });
      S.flows.unshift({
        id: Store.uid(), activity: activity,
        when: $("#flow-when").value.trim(),
        signals: signals,
        note: $("#flow-note").value.trim(),
        created: Date.now()
      });
      saveNow(); closeSheet(); rerenderKeep(); toast("已保存到「探索」");
      return;
    }
    if (act === "flow-del") {
      if (!confirm("删除这条心流记录？")) return;
      S.flows = S.flows.filter(function (f) { return f.id !== btn.dataset.id; });
      saveNow(); rerenderKeep();
      return;
    }
    if (act === "ach-add") {
      var ev = $("#ach-event").value.trim();
      if (!ev) { toast("请先填写成就事件"); return; }
      S.achievements.unshift({
        id: Store.uid(), event: ev,
        role: $("#ach-role").value.trim(),
        pattern: $("#ach-pattern").value.trim(),
        created: Date.now()
      });
      saveNow(); closeSheet(); rerenderKeep(); toast("已保存到「探索」");
      return;
    }
    if (act === "ach-del") {
      if (!confirm("删除这条成就事件？")) return;
      S.achievements = S.achievements.filter(function (a) { return a.id !== btn.dataset.id; });
      saveNow(); rerenderKeep();
      return;
    }

    /* ---- 访谈 ---- */
    if (act === "iv-add") {
      var person = $("#iv-person").value.trim();
      if (!person) { toast("请先填写对方称呼"); return; }
      S.interviews.unshift({
        id: Store.uid(), person: person,
        occupation: $("#iv-occ").value.trim(),
        relation: $("#iv-rel").value.trim(),
        status: $("#iv-status").value,
        answers: {}, gain: "",
        created: Date.now()
      });
      saveNow(); closeSheet(); rerenderKeep(); toast("已添加访谈对象");
      return;
    }
    if (act === "iv-del") {
      if (!confirm("删除这条访谈记录？")) return;
      S.interviews = S.interviews.filter(function (x) { return x.id !== btn.dataset.id; });
      delete openAcc["iv-" + btn.dataset.id];
      saveNow(); rerenderKeep();
      return;
    }
    if (act === "iv-status") {
      var iv = null;
      S.interviews.forEach(function (x) { if (x.id === btn.dataset.id) iv = x; });
      if (!iv) return;
      var keys = DATA.interview.statuses.map(function (s) { return s.key; });
      iv.status = keys[(keys.indexOf(iv.status) + 1) % keys.length];
      saveNow(); rerenderKeep();
      return;
    }

    /* ---- 方向池 ---- */
    if (act === "cand-add") {
      var school = $("#cand-school").value.trim();
      if (!school) { toast("请先填写院校名称"); return; }
      S.decision.candidates.unshift({
        id: Store.uid(), school: school,
        major: $("#cand-major").value.trim(),
        city: $("#cand-city").value.trim(),
        tier: $("#cand-tier").value,
        pastRank: Math.max(0, Math.floor(Number($("#cand-rank").value) || 0)),
        scores: { interest: 5, ability: 5, values: 5, career: 5, score: 5, city: 5 },
        note: "", created: Date.now()
      });
      saveNow(); closeSheet(); rerenderKeep(); toast("已放进方向池");
      return;
    }
    if (act === "cand-del") {
      if (!confirm("删除这个候选方案？")) return;
      S.decision.candidates = S.decision.candidates.filter(function (c) { return c.id !== btn.dataset.id; });
      saveNow(); rerenderKeep();
      return;
    }
    if (act === "cand-tier") {
      S.decision.candidates.forEach(function (c) {
        if (c.id === btn.dataset.id) c.tier = btn.dataset.tier;
      });
      saveNow(); rerenderKeep();
      return;
    }

    /* ---- 数据 / 安装 ---- */
    if (act === "export") {
      var blob = new Blob([Store.exportJson(S)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "pathfinder-backup-" + fmtDate(Date.now()) + ".json";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast("已生成备份文件");
      return;
    }
    if (act === "import") {
      var fi = $("#import-file");
      if (fi) fi.click();
      return;
    }
    if (act === "wipe") {
      if (!confirm("确定要清空全部数据吗？此操作不可恢复。")) return;
      if (!confirm("再次确认：所有测评、记录与方案都会被删除。")) return;
      Store.wipe();
      location.reload();
      return;
    }
    if (act === "install") {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () { deferredPrompt = null; rerenderKeep(); });
      return;
    }
  });

  /* ---------------- 事件：change ---------------- */
  document.addEventListener("change", function (e) {
    var t = e.target;

    if (t.dataset && t.dataset.check) {
      S.checklist[t.dataset.check] = t.checked;
      if (!t.checked) delete S.checklist[t.dataset.check];
      saveNow(); rerenderKeep();
      return;
    }

    if (t.id === "import-file" && t.files && t.files[0]) {
      if (!confirm("导入将覆盖当前全部数据，确定继续？")) { t.value = ""; return; }
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = Store.importJson(String(reader.result));
          Store.save(data);
          toast("导入成功，正在刷新…");
          setTimeout(function () { location.reload(); }, 600);
        } catch (err) {
          alert("导入失败：" + err.message);
        }
      };
      reader.readAsText(t.files[0]);
      return;
    }

    if (t.dataset && (t.dataset.w || t.dataset.rank ||
        (t.dataset.cid && (t.dataset.dim || t.dataset.field === "pastRank")))) {
      saveNow(); rerenderKeep();
      return;
    }
    if (t.dataset && (t.dataset.od || t.dataset.iid)) {
      saveNow();
      return;
    }
  });

  /* ---------------- 事件：input ---------------- */
  document.addEventListener("input", function (e) {
    var t = e.target;
    var d = t.dataset || {};

    if (t.type === "range" && t.nextElementSibling && t.nextElementSibling.tagName === "OUTPUT") {
      t.nextElementSibling.textContent = t.value;
    }

    if (d.w) {
      S.decision.weights[d.w] = Number(t.value);
      saveSoon();
      return;
    }
    if (d.cid && d.dim) {
      S.decision.candidates.forEach(function (c) {
        if (c.id === d.cid) {
          c.scores[d.dim] = Number(t.value);
          var badge = $("#cand-total-" + c.id);
          if (badge) badge.textContent = candidateScore(c);
        }
      });
      saveSoon();
      return;
    }
    if (d.cid && d.field === "note") {
      S.decision.candidates.forEach(function (c) { if (c.id === d.cid) c.note = t.value; });
      saveSoon();
      return;
    }
    if (d.cid && d.field === "pastRank") {
      S.decision.candidates.forEach(function (c) {
        if (c.id === d.cid) c.pastRank = Math.max(0, Math.floor(Number(t.value) || 0));
      });
      saveSoon();
      return;
    }
    if (d.rank) {
      S.decision.rank[d.rank] = Math.max(0, Math.floor(Number(t.value) || 0));
      saveSoon();
      return;
    }
    if (d.od) {
      var od = S.odyssey[d.od];
      if (!od) return;
      if (d.gauge) od.gauges[d.gauge] = Number(t.value);
      else if (d.y !== undefined) od.years[Number(d.y)] = t.value;
      else if (d.field === "title") od.title = t.value;
      else if (d.field === "questions") od.questions = t.value;
      saveSoon();
      return;
    }
    if (d.iid) {
      S.interviews.forEach(function (iv) {
        if (iv.id !== d.iid) return;
        if (d.q !== undefined) iv.answers[Number(d.q)] = t.value;
        else if (d.field === "gain") iv.gain = t.value;
      });
      saveSoon();
      return;
    }
  });

  /* ---------------- 事件：键盘（Esc 关闭浮层 + Tab 焦点圈定） ---------------- */
  document.addEventListener("keydown", function (e) {
    var sheet = $("#modal-root .sheet");
    if (!sheet) return;
    if (e.key === "Escape") { closeSheet(); return; }
    if (e.key === "Tab") {
      var f = $all("button, [href], input, select, textarea", sheet).filter(function (el) { return !el.disabled; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (!sheet.contains(document.activeElement)) { e.preventDefault(); first.focus(); return; }
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------------- PWA 安装提示 ---------------- */
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (route().page === "more") rerenderKeep();
  });
  window.addEventListener("appinstalled", function () {
    deferredPrompt = null;
    toast("已安装到主屏幕");
    if (route().page === "more") rerenderKeep();
  });

  /* ---------------- 新版本提示 ---------------- */
  window.addEventListener("pf-sw-updated", function () {
    if ($("#update-bar")) return;
    var bar = document.createElement("div");
    bar.id = "update-bar";
    bar.className = "update-bar";
    bar.setAttribute("role", "status");
    bar.innerHTML = "<span>应用已更新到新版本</span>" +
      '<button class="btn btn-sm" data-act="reload-app">立即刷新</button>' +
      '<button class="ub-x" data-act="update-dismiss" aria-label="暂不刷新">' + ICONS.close + "</button>";
    document.body.appendChild(bar);
  });

  /* ---------------- 离开页面前冲刷防抖中的保存 ---------------- */
  window.addEventListener("pagehide", saveNow);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") saveNow();
  });

  /* ---------------- 多标签页同步 ---------------- */
  window.addEventListener("storage", function (e) {
    if (e.key === "pathfinder.v1") {
      S = Store.load();
      rerenderKeep();
    }
  });

  /* ---------------- 启动 ---------------- */
  window.addEventListener("hashchange", render);
  if (!location.hash) location.replace("#/now");
  render();

})();
