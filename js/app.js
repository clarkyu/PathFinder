/* ============================================================
 * 航向 PathFinder · 应用主逻辑
 * 零依赖原生 JS：哈希路由 + 视图渲染 + 事件委托
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
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { Store.save(S); }, 400);
  }
  function saveNow() { clearTimeout(saveTimer); Store.save(S); }

  /* ---------------- 状态 ---------------- */
  var S = Store.load();
  var deferredPrompt = null;

  /* ---------------- 图标（内联 SVG） ---------------- */
  function svg(paths, extra) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' +
      (extra || "") + ">" + paths + "</svg>";
  }
  var ICONS = {
    home: svg('<path d="M3 11.2 12 4l9 7.2"/><path d="M5.5 9.8V20h13V9.8"/>'),
    assess: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.6" fill="currentColor"/>'),
    explore: svg('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13.4 13.4 8.5 15.5l2.1-4.9z"/>'),
    decide: svg('<path d="M12 3v18"/><path d="M8 21h8"/><path d="M4 7h16"/><path d="M6.5 7 4 12.5a2.6 2.6 0 0 0 5 0L6.5 7z"/><path d="M17.5 7 15 12.5a2.6 2.6 0 0 0 5 0L17.5 7z"/>'),
    more: svg('<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>'),
    back: svg('<path d="M15 18l-6-6 6-6"/>'),
    chev: svg('<path d="M9 6l6 6-6 6"/>'),
    down: svg('<path d="M6 9l6 6 6-6"/>'),
    plus: svg('<path d="M12 5v14"/><path d="M5 12h14"/>'),
    trash: svg('<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6.5 7l1 13h9l1-13"/><path d="M10 11v6"/><path d="M14 11v6"/>'),
    ext: svg('<path d="M14 5h5v5"/><path d="M19 5l-8 8"/><path d="M19 14v5H5V5h5"/>')
  };

  var NAV = [
    { id: "home", name: "首页", icon: ICONS.home },
    { id: "assess", name: "测评", icon: ICONS.assess },
    { id: "explore", name: "探索", icon: ICONS.explore },
    { id: "decide", name: "决策", icon: ICONS.decide },
    { id: "more", name: "更多", icon: ICONS.more }
  ];

  /* ---------------- 路由 ---------------- */
  function route() {
    var h = (location.hash || "#/home").replace(/^#\/?/, "");
    var parts = h.split("/");
    return { page: parts[0] || "home", sub: parts[1] || "" };
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
      return '<polygon points="' + poly(R * k) + '" fill="none" stroke="#D7DFEA" stroke-width="1"/>';
    }).join("");
    var axes = order.map(function (_, i) {
      var p = pt(i, R);
      return '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '" stroke="#E3E9F2" stroke-width="1"/>';
    }).join("");
    var labels = order.map(function (t, i) {
      var p = pt(i, R + 21);
      var info = DATA.riasec.types[t];
      return '<text x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="600" fill="' + info.color + '">' +
        t + " " + info.name + "</text>";
    }).join("");
    var dataPts = order.map(function (t, i) {
      var r = (scores[t] / max) * R;
      return pt(i, r);
    });
    var dataPoly = dataPts.map(function (p) { return p.map(function (n) { return n.toFixed(1); }).join(","); }).join(" ");
    var dots = dataPts.map(function (p, i) {
      return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="' + DATA.riasec.types[order[i]].color + '"/>';
    }).join("");
    return '<svg class="radar" viewBox="0 0 260 248" role="img" aria-label="霍兰德六型兴趣雷达图">' +
      grid + axes +
      '<polygon points="' + dataPoly + '" fill="rgba(20,80,163,0.18)" stroke="#1450A3" stroke-width="2" stroke-linejoin="round"/>' +
      dots + labels + "</svg>";
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

  /* ---------------- 通用 UI 片段 ---------------- */
  function card(inner, cls) { return '<section class="card ' + (cls || "") + '">' + inner + "</section>"; }
  function empty(text) { return '<div class="empty">' + esc(text) + "</div>"; }
  function seg(tabs, active, base) {
    return '<div class="seg">' + tabs.map(function (t) {
      return '<a class="seg-btn' + (t.key === active ? " active" : "") + '" href="#/' + base + "/" + t.key + '">' + t.name + "</a>";
    }).join("") + "</div>";
  }
  function progressBar(pct, cls) {
    return '<div class="bar ' + (cls || "") + '"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>';
  }
  function sliderRow(label, attrs, value, min, max, hint) {
    return '<div class="slider-row"><div class="slider-label">' + esc(label) +
      (hint ? '<small>' + esc(hint) + "</small>" : "") + "</div>" +
      '<input type="range" min="' + min + '" max="' + max + '" step="1" value="' + value + '" ' + attrs + ">" +
      "<output>" + value + "</output></div>";
  }

  /* ---------------- 视图：首页 ---------------- */
  function allChecklistItems() {
    var arr = [];
    DATA.phases.forEach(function (p) { p.items.forEach(function (it) { arr.push(it); }); });
    return arr;
  }
  function viewHome() {
    var total = allChecklistItems().length;
    var done = allChecklistItems().filter(function (it) { return S.checklist[it.id]; }).length;
    var hist = S.riasec.history;
    var ivDone = S.interviews.filter(function (i) { return i.status === "done"; }).length;

    var cta;
    if (S.riasec.inProgress || answeredCount() > 0) {
      cta = { label: "继续霍兰德测评（" + answeredCount() + "/" + DATA.riasec.questions.length + "）", to: "#/assess" };
    } else if (hist.length) {
      cta = { label: "查看我的兴趣画像 · " + hist[0].code, to: "#/assess" };
    } else {
      cta = { label: "从 6 分钟霍兰德测评开始", to: "#/assess" };
    }

    var hero = '<section class="hero">' +
      '<h1>' + DATA.app.name + "</h1>" +
      '<p class="hero-sub">' + DATA.app.tagline + "</p>" +
      '<div class="hero-progress"><span>行动进度 ' + done + " / " + total + "</span>" + progressBar(done / total * 100, "bar-light") + "</div>" +
      '<a class="btn btn-hero" href="' + cta.to + '">' + cta.label + "</a>" +
      "</section>";

    var kpis = '<section class="kpis">' +
      '<a class="kpi" href="#/assess"><b>' + (hist.length ? hist[0].code : "—") + "</b><span>兴趣画像</span></a>" +
      '<a class="kpi" href="#/explore/flow"><b>' + S.flows.length + "</b><span>心流线索</span></a>" +
      '<a class="kpi" href="#/explore/interview"><b>' + ivDone + "/" + S.interviews.length + "</b><span>人物访谈</span></a>" +
      '<a class="kpi" href="#/decide"><b>' + S.decision.candidates.length + "</b><span>候选方案</span></a>" +
      "</section>";

    var phases = DATA.phases.map(function (p) {
      var pd = p.items.filter(function (it) { return S.checklist[it.id]; }).length;
      var rows = p.items.map(function (it) {
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
      return card('<div class="phase-head"><div><h3>' + esc(p.name) + '</h3><p class="phase-meta">' + esc(p.period) + " · " + esc(p.goal) + "</p></div>" +
        '<span class="phase-count">' + pd + "/" + p.items.length + "</span></div>" +
        progressBar(pd / p.items.length * 100) + '<div class="checklist">' + rows + "</div>");
    }).join("");

    var th = card("<h3>三个关键信号 · 何时调整策略</h3>" + DATA.thresholds.map(function (t) {
      return '<div class="th-row"><p class="th-when">' + esc(t.when) + '</p><p class="th-then">' + esc(t.then) + "</p></div>";
    }).join(""));

    var quote = '<blockquote class="quote">“' + DATA.app.quote + '”<cite>—— ' + DATA.app.quoteBy + "</cite></blockquote>";

    return hero + kpis + phases + th + quote;
  }

  /* ---------------- 视图：测评 ---------------- */
  function viewToolsSection() {
    var cards = DATA.tools.map(function (t) {
      var head = '<div class="tool-head"><b>' + esc(t.name) + '</b><span class="badge badge-' + t.grade + '">' + esc(t.badge) + "</span></div>";
      var body = "<p>" + esc(t.desc) + "</p>";
      var link = t.url ? '<a class="tool-link" href="' + t.url + '" target="_blank" rel="noopener">前往 ' + ICONS.ext + "</a>" : "";
      return '<div class="tool">' + head + body + link + "</div>";
    }).join("");
    return card("<h3>更多权威免费测评</h3>" + cards +
      '<div class="acc"><button class="acc-head" data-act="acc">测评的科学性怎么看 ' + ICONS.down + "</button>" +
      '<div class="acc-body"><p>' + esc(DATA.toolsNote) + "</p></div></div>");
  }

  function viewAssess() {
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
      html += card("<h3>霍兰德兴趣探索（进行中）</h3><p>已完成 " + n + " / " + qs.length + " 题，进度已保存。</p>" +
        '<div class="btn-row"><button class="btn" data-act="riasec-resume">继续测评</button>' +
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
            return '<p class="hist-row">' + fmtDate(x.date) + " · " + x.code + "</p>";
          }).join("")
        : "";
      html += card('<div class="result-head"><p class="lbl">我的霍兰德代码 · ' + fmtDate(h.date) + "</p>" +
        '<div class="code-row">' + codeHtml + "</div>" +
        "<p>" + distNote + "</p></div>" +
        radarSvg(h.scores) +
        '<div class="tbars">' + bars + "</div>" +
        '<p class="note">' + esc(DATA.riasec.note) + "</p>", "result-card");
      html += card("<h3>前三型解读</h3>" + typeCards +
        '<div class="btn-row"><a class="btn" href="#/decide">把感兴趣的专业加入决策 →</a>' +
        '<button class="btn btn-ghost" data-act="riasec-retake">重新测评</button></div>' + histList);
    } else {
      html += card("<h3>霍兰德兴趣探索</h3><p>" + esc(DATA.riasec.intro) + "</p>" +
        '<p class="note">' + qs.length + " 道题 · 约 6 分钟 · 进度自动保存</p>" +
        '<button class="btn btn-block" data-act="riasec-start">开始测评</button>');
    }

    html += viewToolsSection();
    return html;
  }

  /* ---------------- 视图：探索 ---------------- */
  function viewExplore(sub) {
    var tabs = [{ key: "flow", name: "心流线索" }, { key: "odyssey", name: "奥德赛计划" }, { key: "interview", name: "人物访谈" }];
    var body = sub === "odyssey" ? viewOdyssey() : sub === "interview" ? viewInterview() : viewFlow();
    return seg(tabs, sub || "flow", "explore") + body;
  }

  function viewFlow() {
    var html = card("<h3>心流时刻清单</h3><p>" + esc(DATA.flowIntro) + "</p>");

    var strong = S.flows.filter(function (f) { return (f.signals || []).length >= 3; });
    if (strong.length) {
      html += card('<h3>天赋线索小结</h3><p>这些活动出现了 3 个以上信号，值得认真对待：</p><div class="chips">' +
        strong.map(function (f) { return '<span class="chip chip-hot">' + esc(f.activity) + "</span>"; }).join("") + "</div>", "hint-card");
    }

    var sigBoxes = DATA.flowSignals.map(function (s, i) {
      return '<label class="sig"><input type="checkbox" class="flow-sig" value="' + i + '"><span>' + s + "</span></label>";
    }).join("");
    html += card("<h3>记录一个心流时刻</h3>" +
      '<input class="input" id="flow-activity" maxlength="40" placeholder="活动名称，比如：拼装机甲模型 / 写剧本 / 调试代码">' +
      '<input class="input" id="flow-when" maxlength="30" placeholder="大概什么时候？比如：高二下学期（选填）">' +
      '<p class="lbl">出现了哪些信号？</p><div class="sigs">' + sigBoxes + "</div>" +
      '<textarea class="input" id="flow-note" rows="2" placeholder="补充细节（选填）"></textarea>' +
      '<button class="btn btn-block" data-act="flow-add">' + ICONS.plus + " 添加记录</button>");

    if (S.flows.length) {
      html += S.flows.map(function (f) {
        var chips = (f.signals || []).map(function (i) { return '<span class="chip chip-soft">' + DATA.flowSignals[i] + "</span>"; }).join("");
        return card('<div class="item-head"><b>' + esc(f.activity) + "</b>" +
          '<button class="icon-btn" data-act="flow-del" data-id="' + f.id + '" aria-label="删除">' + ICONS.trash + "</button></div>" +
          (f.when ? '<p class="item-meta">' + esc(f.when) + "</p>" : "") +
          (chips ? '<div class="chips">' + chips + "</div>" : "") +
          (f.note ? '<p class="item-note">' + esc(f.note) + "</p>" : ""), "item-card");
      }).join("");
    } else {
      html += empty("还没有记录。回想过去三年：做什么时你会忘记时间？");
    }

    html += card("<h3>成就事件分析</h3><p>" + esc(DATA.achieveIntro) + "</p>" +
      '<input class="input" id="ach-event" maxlength="60" placeholder="一件最有成就感的事，比如：带队拿了机器人比赛二等奖">' +
      '<input class="input" id="ach-role" maxlength="60" placeholder="你具体做了什么？">' +
      '<input class="input" id="ach-pattern" maxlength="60" placeholder="最让你兴奋的点是什么？（动机模式）">' +
      '<button class="btn btn-block btn-ghost" data-act="ach-add">' + ICONS.plus + " 添加成就事件</button>" +
      (S.achievements.length ? S.achievements.map(function (a) {
        return '<div class="ach"><div class="item-head"><b>' + esc(a.event) + "</b>" +
          '<button class="icon-btn" data-act="ach-del" data-id="' + a.id + '" aria-label="删除">' + ICONS.trash + "</button></div>" +
          (a.role ? '<p class="item-meta">我做了：' + esc(a.role) + "</p>" : "") +
          (a.pattern ? '<p class="item-note">动机模式：' + esc(a.pattern) + "</p>" : "") + "</div>";
      }).join("") : ""));

    return html;
  }

  function viewOdyssey() {
    var html = card("<h3>奥德赛计划 · 三个五年</h3><p>" + esc(DATA.odyssey.intro) + '</p><p class="note">内容自动保存在本机。</p>');
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

  function viewInterview() {
    var html = card("<h3>生涯人物访谈</h3><p>" + esc(DATA.interview.intro) + "</p>" +
      '<p class="lbl">四个推荐问题</p><ol class="qlist">' +
      DATA.interview.questions.map(function (q) { return "<li>" + q + "</li>"; }).join("") + "</ol>");

    var statusOpts = DATA.interview.statuses.map(function (s) {
      return '<option value="' + s.key + '">' + s.name + "</option>";
    }).join("");
    html += card("<h3>添加访谈对象</h3>" +
      '<input class="input" id="iv-person" maxlength="20" placeholder="对方称呼，比如：李叔叔 / 王学长">' +
      '<input class="input" id="iv-occ" maxlength="30" placeholder="职业 / 行业，比如：三甲医院骨科医生">' +
      '<div class="row2">' +
      '<input class="input" id="iv-rel" maxlength="20" placeholder="关系（选填）">' +
      '<select class="input" id="iv-status">' + statusOpts + "</select></div>" +
      '<button class="btn btn-block" data-act="iv-add">' + ICONS.plus + " 添加</button>");

    if (S.interviews.length) {
      html += S.interviews.map(function (iv) {
        var st = null;
        DATA.interview.statuses.forEach(function (s) { if (s.key === iv.status) st = s; });
        st = st || DATA.interview.statuses[0];
        var qa = DATA.interview.questions.map(function (q, qi) {
          return '<p class="lbl">' + q + "</p>" +
            '<textarea class="input" rows="2" data-iid="' + iv.id + '" data-q="' + qi + '" placeholder="对方的回答…">' + esc(iv.answers[qi] || "") + "</textarea>";
        }).join("");
        return '<section class="card item-card acc">' +
          '<div class="item-head">' +
          '<button class="acc-head iv-head" data-act="acc"><b>' + esc(iv.person) + "</b>" +
          (iv.occupation ? '<span class="item-meta">' + esc(iv.occupation) + "</span>" : "") + " " + ICONS.down + "</button>" +
          '<button class="chip chip-status st-' + st.key + '" data-act="iv-status" data-id="' + iv.id + '">' + st.name + "</button></div>" +
          (iv.relation ? '<p class="item-meta">' + esc(iv.relation) + "</p>" : "") +
          '<div class="acc-body">' + qa +
          '<p class="lbl">我的收获</p>' +
          '<textarea class="input" rows="2" data-iid="' + iv.id + '" data-field="gain" placeholder="听完之后，你对这条路的想象有什么变化？">' + esc(iv.gain || "") + "</textarea>" +
          '<button class="btn btn-ghost btn-sm btn-danger-text" data-act="iv-del" data-id="' + iv.id + '">' + ICONS.trash + " 删除这条访谈</button>" +
          "</div></section>";
      }).join("");
    } else {
      html += empty("还没有访谈对象。从亲友、校友里找 3–5 位目标行业的人开始吧。");
    }
    return html;
  }

  /* ---------------- 视图：决策 ---------------- */
  function viewDecide(sub) {
    var tabs = [{ key: "sheet", name: "决策平衡单" }, { key: "tier", name: "冲稳保梯度" }];
    var body = sub === "tier" ? viewTier() : viewSheet();
    return seg(tabs, sub || "sheet", "decide") + body;
  }

  function viewSheet() {
    var html = card("<h3>生涯决策平衡单</h3><p>" + esc(DATA.decision.intro) + "</p>");

    var wRows = DATA.decision.dims.map(function (d) {
      return sliderRow(d.name, 'data-w="' + d.key + '"', S.decision.weights[d.key], 1, 5, d.hint);
    }).join("");
    html += card('<div class="acc"><button class="acc-head" data-act="acc">维度权重（1–5，按你看重的程度调整） ' + ICONS.down + "</button>" +
      '<div class="acc-body">' + wRows + "</div></div>");

    var tierOpts = DATA.decision.tiers.map(function (t) {
      return '<option value="' + t.key + '"' + (t.key === "unset" ? " selected" : "") + ">" + t.name + "</option>";
    }).join("");
    html += card("<h3>添加候选方案</h3>" +
      '<input class="input" id="cand-school" maxlength="30" placeholder="院校名称（必填）">' +
      '<input class="input" id="cand-major" maxlength="30" placeholder="专业 / 专业组（建议填写）">' +
      '<div class="row2"><input class="input" id="cand-city" maxlength="20" placeholder="城市（选填）">' +
      '<select class="input" id="cand-tier">' + tierOpts + "</select></div>" +
      '<button class="btn btn-block" data-act="cand-add">' + ICONS.plus + " 添加方案</button>" +
      '<p class="note">出分前可以先把“隐约感兴趣的 5–8 个专业方向”记进来，出分后再打分。</p>');

    var cands = S.decision.candidates;
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
      }).join("") + '<p class="note">分数只是把权衡“摆上桌面”的工具，最终请结合位次与老师意见。</p>');
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
          '<textarea class="input" rows="2" data-cid="' + c.id + '" data-field="note" placeholder="备注 / SWOT：优势、劣势、机会、风险（选填）">' + esc(c.note || "") + "</textarea>", "item-card");
      }).join("");
    } else {
      html += empty("还没有候选方案。先把隐约感兴趣的方向加进来。");
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
      }).join("") + (unset.length ? '<span class="tier-pill" style="background:#94A3B8">未定 ' + unset.length + "</span>" : "") + "</div>");

    groups.forEach(function (g) {
      var t = tierInfo(g);
      var list = S.decision.candidates.filter(function (c) { return c.tier === g; });
      html += card('<div class="tier-head"><span class="chip chip-tier" style="background:' + t.color + '">' + t.name + "</span><small>" + esc(t.hint) + "</small></div>" +
        (list.length ? list.map(function (c) {
          return '<div class="rank-row"><div class="rank-main"><b>' + esc(c.school) + (c.major ? " · " + esc(c.major) : "") + "</b></div>" +
            '<span class="rank-pct">' + candidateScore(c) + "</span></div>";
        }).join("") : empty("暂无方案，在“决策平衡单”里给方案归档。")));
    });

    html += card('<h3>填报提醒</h3><ol class="qlist">' + DATA.decision.tierTips.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ol>" +
      '<p class="item-note">' + esc(DATA.decision.tradeoff) + "</p>" +
      '<a class="btn btn-block" href="https://gaokao.chsi.com.cn/zyck/" target="_blank" rel="noopener">打开教育部“阳光志愿”系统 ' + ICONS.ext + "</a>");
    return html;
  }

  /* ---------------- 视图：更多 ---------------- */
  function viewMore(sub) {
    if (sub === "parents") return viewParents();
    if (sub === "knowledge") return viewKnowledge();
    if (sub === "data") return viewData();
    if (sub === "about") return viewAbout();

    var items = [
      { to: "#/more/parents", name: "家长专区", desc: "自主支持，而非包办" },
      { to: "#/more/knowledge", name: "知识库", desc: "20+ 个理论卡片，按需取用" },
      { to: "#/more/data", name: "数据管理", desc: "导出 / 导入 / 清空本机数据" },
      { to: "#/more/about", name: "关于与声明", desc: "版本 · 依据 · 局限" }
    ];
    var html = "";
    if (deferredPrompt) {
      html += card('<h3>安装到主屏幕</h3><p>像原生 App 一样离线使用，数据保存在本机。</p>' +
        '<button class="btn btn-block" data-act="install">安装应用</button>', "install-card");
    }
    html += card(items.map(function (it) {
      return '<a class="navrow" href="' + it.to + '"><div><b>' + it.name + "</b><small>" + it.desc + "</small></div>" + ICONS.chev + "</a>";
    }).join(""));
    return html;
  }

  function viewParents() {
    var p = DATA.parent;
    var html = card("<h3>为什么是“自主支持”</h3><p>" + esc(p.intro) + "</p>");
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
      return '<div class="acc' + (i === 0 ? " open" : "") + '"><button class="acc-head" data-act="acc">' + esc(w.title) + " " + ICONS.down + "</button>" +
        '<div class="acc-body"><p>' + esc(w.desc) + "</p></div></div>";
    }).join(""));
    html += card("<h3>日常观察法</h3><p>" + esc(p.observe) + "</p>" +
      '<a class="btn btn-ghost btn-block" href="#/explore/flow">去记录心流线索 →</a>');
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
    return card("<h3>导出备份</h3><p>把全部数据下载为 JSON 文件，换设备或重装浏览器前请先备份。</p>" +
      '<button class="btn btn-block" data-act="export">导出数据（' + Store.sizeKb() + ' KB）</button>') +
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
      '<p class="note">方法论依据：《发现天赋、找到方向》深度研究报告（见仓库 docs/source-report.md），涵盖 Gagné 天赋发展模型、霍兰德 RIASEC、生涯适应力、自我决定理论、奥德赛计划与生涯决策平衡单等。</p>') +
      card("<h3>安装为 App</h3><p>本应用是 PWA：支持离线使用、可安装到主屏幕。</p>" +
        (deferredPrompt ? '<button class="btn btn-block" data-act="install">安装应用</button>' : "") +
        '<p class="note">iPhone / iPad：Safari 打开 → 分享 → 添加到主屏幕。安卓 / 桌面 Chrome、Edge：地址栏“安装”图标。</p>') +
      card('<h3>重要声明</h3><ol class="qlist">' + DATA.caveats.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ol>");
  }

  /* ---------------- 顶栏 / 标签栏 / 渲染 ---------------- */
  var TITLES = {
    assess: "自我探索测评",
    explore: "探索工具箱",
    decide: "志愿决策",
    more: "更多"
  };
  var MORE_TITLES = { parents: "家长专区", knowledge: "知识库", data: "数据管理", about: "关于与声明" };

  function renderTopbar(r) {
    var el = $("#topbar");
    if (r.page === "home") {
      el.innerHTML = '<div class="topbar-in"><span class="brand">' + DATA.app.name + '</span><span class="brand-sub">' + DATA.app.title + "</span></div>";
      return;
    }
    var title = TITLES[r.page] || "";
    var back = "";
    if (r.page === "more" && r.sub && MORE_TITLES[r.sub]) {
      title = MORE_TITLES[r.sub];
      back = '<a class="back-btn" href="#/more" aria-label="返回">' + ICONS.back + "</a>";
    }
    el.innerHTML = '<div class="topbar-in">' + back + '<span class="page-title">' + title + "</span></div>";
  }

  function renderTabbar(r) {
    $("#tabbar").innerHTML = NAV.map(function (n) {
      return '<a class="tab' + (n.id === r.page ? " active" : "") + '" href="#/' + n.id + '">' + n.icon + "<span>" + n.name + "</span></a>";
    }).join("");
  }

  var lastHash = "";
  function render() {
    var r = route();
    renderTopbar(r);
    renderTabbar(r);
    var v = $("#view");
    if (r.page === "assess") v.innerHTML = viewAssess();
    else if (r.page === "explore") v.innerHTML = viewExplore(r.sub);
    else if (r.page === "decide") v.innerHTML = viewDecide(r.sub);
    else if (r.page === "more") v.innerHTML = viewMore(r.sub);
    else v.innerHTML = viewHome();
    if (location.hash !== lastHash) {
      window.scrollTo(0, 0);
      lastHash = location.hash;
    }
  }
  function rerenderKeep() {
    var y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }

  /* ---------------- 事件：点击 ---------------- */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-act]");
    if (!btn) return;
    var act = btn.dataset.act;

    if (act === "acc") {
      var acc = btn.closest(".acc");
      if (acc) acc.classList.toggle("open");
      return;
    }

    if (act === "riasec-start" || act === "riasec-retake") {
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
      render();
      return;
    }
    if (act === "riasec-quit") {
      S.riasec.inProgress = false;
      saveNow(); render();
      toast("进度已保存，随时可以继续");
      return;
    }

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
      saveNow(); rerenderKeep(); toast("已记录一条心流线索");
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
      saveNow(); rerenderKeep(); toast("已添加成就事件");
      return;
    }
    if (act === "ach-del") {
      if (!confirm("删除这条成就事件？")) return;
      S.achievements = S.achievements.filter(function (a) { return a.id !== btn.dataset.id; });
      saveNow(); rerenderKeep();
      return;
    }

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
      saveNow(); rerenderKeep(); toast("已添加访谈对象");
      return;
    }
    if (act === "iv-del") {
      if (!confirm("删除这条访谈记录？")) return;
      S.interviews = S.interviews.filter(function (x) { return x.id !== btn.dataset.id; });
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

    if (act === "cand-add") {
      var school = $("#cand-school").value.trim();
      if (!school) { toast("请先填写院校名称"); return; }
      S.decision.candidates.unshift({
        id: Store.uid(), school: school,
        major: $("#cand-major").value.trim(),
        city: $("#cand-city").value.trim(),
        tier: $("#cand-tier").value,
        scores: { interest: 5, ability: 5, values: 5, career: 5, score: 5, city: 5 },
        note: "", created: Date.now()
      });
      saveNow(); rerenderKeep(); toast("已添加候选方案");
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

  /* ---------------- 事件：change（勾选 / 导入 / 滑块定稿） ---------------- */
  document.addEventListener("change", function (e) {
    var t = e.target;

    if (t.dataset && t.dataset.check) {
      S.checklist[t.dataset.check] = t.checked;
      if (!t.checked) delete S.checklist[t.dataset.check];
      saveNow(); rerenderKeep();
      return;
    }

    if (t.id === "import-file" && t.files && t.files[0]) {
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

    // 权重 / 方案维度滑块松手后：保存并刷新排序
    if (t.dataset && (t.dataset.w || (t.dataset.cid && t.dataset.dim))) {
      saveNow(); rerenderKeep();
      return;
    }
    if (t.dataset && t.dataset.od) {
      saveNow();
      return;
    }
    if (t.dataset && t.dataset.iid) {
      saveNow();
      return;
    }
  });

  /* ---------------- 事件：input（实时写入状态） ---------------- */
  document.addEventListener("input", function (e) {
    var t = e.target;
    var d = t.dataset || {};

    // 滑块的数值即时回显
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

  /* ---------------- 启动 ---------------- */
  window.addEventListener("hashchange", render);
  if (!location.hash) location.replace("#/home");
  render();

})();
