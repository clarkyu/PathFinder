/* ============================================================
 * 航向 PathFinder · 本地存储（localStorage）
 * 所有数据只保存在本机，可导出 / 导入 JSON 备份。
 * 载入与导入都会经过 sanitize()：枚举白名单、数值钳位、
 * 非法 id 重新生成——保证损坏/恶意备份既不能注入也不能让应用崩溃。
 * ============================================================ */
"use strict";

var Store = (function () {
  var KEY = "pathfinder.v1";

  var PERSONAS = ["student", "parent"];
  var PHASES = ["before", "scored", "after"];
  var TIERS = ["rush", "steady", "safe", "unset"];
  var IV_STATUSES = ["plan", "booked", "done"];
  var DIMS = ["interest", "ability", "values", "career", "score", "city"];
  var GAUGES = ["res", "like", "conf", "coh"];
  var HEX = ["R", "I", "A", "S", "E", "C"];
  var QUESTION_COUNT = 48;

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function blankOdyssey() {
    return {
      title: "",
      years: ["", "", "", "", ""],
      gauges: { res: 50, like: 50, conf: 50, coh: 50 },
      questions: ""
    };
  }

  function defaults() {
    return {
      version: 1,
      createdAt: Date.now(),
      profile: { persona: "student", phase: "before", onboarded: false },
      checklist: {},
      riasec: { answers: {}, idx: 0, inProgress: false, history: [] },
      flows: [],
      achievements: [],
      odyssey: { a: blankOdyssey(), b: blankOdyssey(), c: blankOdyssey() },
      interviews: [],
      decision: {
        weights: { interest: 3, ability: 3, values: 3, career: 3, score: 3, city: 3 },
        candidates: []
      }
    };
  }

  /* ---------- 数据消毒原语 ---------- */
  function pick(v, list, def) { return list.indexOf(v) >= 0 ? v : def; }
  function num(v, min, max, def) {
    v = Number(v);
    if (!isFinite(v)) v = def;
    return Math.min(max, Math.max(min, v));
  }
  function str(v, max) { return typeof v === "string" ? v.slice(0, max) : ""; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function safeId(v) {
    return (typeof v === "string" && /^[a-z0-9]{6,24}$/i.test(v)) ? v : uid();
  }
  function deriveCode(scores) {
    return HEX.slice().sort(function (a, b) {
      return scores[b] - scores[a] || HEX.indexOf(a) - HEX.indexOf(b);
    }).slice(0, 3).join("");
  }

  /* ---------- 全量消毒 ---------- */
  function sanitize(s) {
    s.profile = s.profile || {};
    s.profile.persona = pick(s.profile.persona, PERSONAS, "student");
    s.profile.phase = pick(s.profile.phase, PHASES, "before");
    s.profile.onboarded = !!s.profile.onboarded;

    var cl = {};
    if (s.checklist && typeof s.checklist === "object") {
      Object.keys(s.checklist).forEach(function (k) {
        if (/^p[1-3]-\d$/.test(k) && s.checklist[k]) cl[k] = true;
      });
    }
    s.checklist = cl;

    var r = s.riasec || {};
    var answers = {};
    if (r.answers && typeof r.answers === "object") {
      Object.keys(r.answers).forEach(function (k) {
        var i = Number(k), v = Number(r.answers[k]);
        if (i >= 0 && i < QUESTION_COUNT && (v === 0 || v === 1 || v === 2)) answers[i] = v;
      });
    }
    s.riasec = {
      answers: answers,
      idx: Math.floor(num(r.idx, 0, QUESTION_COUNT - 1, 0)),
      inProgress: !!r.inProgress,
      history: arr(r.history).filter(function (h) {
        return h && h.scores && typeof h.scores === "object";
      }).slice(0, 10).map(function (h) {
        var sc = {};
        HEX.forEach(function (t) { sc[t] = num(h.scores[t], 0, 16, 0); });
        var code = (typeof h.code === "string" && /^[RIASEC]{1,3}$/.test(h.code)) ? h.code : deriveCode(sc);
        return { date: num(h.date, 0, 4102444800000, Date.now()), scores: sc, code: code };
      })
    };

    s.flows = arr(s.flows).map(function (f) {
      f = f || {};
      return {
        id: safeId(f.id),
        activity: str(f.activity, 40),
        when: str(f.when, 30),
        signals: arr(f.signals).map(Number).filter(function (i) { return i >= 0 && i < 5; }),
        note: str(f.note, 500),
        created: num(f.created, 0, 4102444800000, Date.now())
      };
    }).filter(function (f) { return f.activity; });

    s.achievements = arr(s.achievements).map(function (a) {
      a = a || {};
      return {
        id: safeId(a.id),
        event: str(a.event, 60),
        role: str(a.role, 60),
        pattern: str(a.pattern, 60),
        created: num(a.created, 0, 4102444800000, Date.now())
      };
    }).filter(function (a) { return a.event; });

    var od = s.odyssey || {};
    s.odyssey = {};
    ["a", "b", "c"].forEach(function (k) {
      var v = od[k] || {};
      var g = v.gauges || {};
      var gauges = {};
      GAUGES.forEach(function (gk) { gauges[gk] = num(g[gk], 0, 100, 50); });
      var years = arr(v.years).map(function (y) { return str(y, 60); });
      while (years.length < 5) years.push("");
      s.odyssey[k] = {
        title: str(v.title, 12),
        years: years.slice(0, 5),
        gauges: gauges,
        questions: str(v.questions, 1000)
      };
    });

    s.interviews = arr(s.interviews).map(function (iv) {
      iv = iv || {};
      var answers = {};
      if (iv.answers && typeof iv.answers === "object") {
        Object.keys(iv.answers).forEach(function (k) {
          var i = Number(k);
          if (i >= 0 && i < 4) answers[i] = str(iv.answers[k], 2000);
        });
      }
      return {
        id: safeId(iv.id),
        person: str(iv.person, 20),
        occupation: str(iv.occupation, 30),
        relation: str(iv.relation, 20),
        status: pick(iv.status, IV_STATUSES, "plan"),
        answers: answers,
        gain: str(iv.gain, 2000),
        created: num(iv.created, 0, 4102444800000, Date.now())
      };
    }).filter(function (iv) { return iv.person; });

    var d = s.decision || {};
    var weights = {};
    DIMS.forEach(function (k) { weights[k] = num((d.weights || {})[k], 1, 5, 3); });
    s.decision = {
      weights: weights,
      candidates: arr(d.candidates).map(function (c) {
        c = c || {};
        var scores = {};
        DIMS.forEach(function (k) { scores[k] = num((c.scores || {})[k], 0, 10, 5); });
        return {
          id: safeId(c.id),
          school: str(c.school, 30),
          major: str(c.major, 30),
          city: str(c.city, 20),
          tier: pick(c.tier, TIERS, "unset"),
          scores: scores,
          note: str(c.note, 1000),
          created: num(c.created, 0, 4102444800000, Date.now())
        };
      }).filter(function (c) { return c.school; })
    };

    s.version = 1;
    s.createdAt = num(s.createdAt, 0, 4102444800000, Date.now());
    return s;
  }

  // 浅层补全缺失字段（导入旧版本数据时保持健壮）
  function merge(base, saved) {
    if (!saved || typeof saved !== "object") return base;
    Object.keys(base).forEach(function (k) {
      var b = base[k], sv = saved[k];
      if (sv === undefined || sv === null) return;
      if (Array.isArray(b)) {
        if (Array.isArray(sv)) base[k] = sv;
      } else if (typeof b === "object" && b !== null) {
        base[k] = merge(b, sv);
      } else {
        base[k] = sv;
      }
    });
    return base;
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      return sanitize(merge(defaults(), JSON.parse(raw)));
    } catch (e) {
      console.warn("Store.load failed, using defaults:", e);
      return defaults();
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.warn("Store.save failed:", e);
      return false;
    }
  }

  function wipe() {
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }

  function exportJson(state) {
    return JSON.stringify({ app: "pathfinder", exportedAt: new Date().toISOString(), data: state }, null, 2);
  }

  function importJson(text) {
    var parsed = JSON.parse(text); // 让调用方捕获异常
    var data = parsed && parsed.app === "pathfinder" ? parsed.data : parsed;
    if (!data || typeof data !== "object" || !("riasec" in data || "decision" in data)) {
      throw new Error("不是有效的 PathFinder 备份文件");
    }
    return sanitize(merge(defaults(), data));
  }

  function sizeKb() {
    try {
      var raw = localStorage.getItem(KEY) || "";
      return Math.round((raw.length * 2) / 102.4) / 10; // UTF-16 估算
    } catch (e) { return 0; }
  }

  return {
    load: load,
    save: save,
    wipe: wipe,
    exportJson: exportJson,
    importJson: importJson,
    uid: uid,
    sizeKb: sizeKb
  };
})();
