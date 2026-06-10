/* ============================================================
 * 航向 PathFinder · 本地存储（localStorage）
 * 所有数据只保存在本机，可导出 / 导入 JSON 备份。
 * ============================================================ */
"use strict";

var Store = (function () {
  var KEY = "pathfinder.v1";

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
      profile: {
        persona: "student",          // student | parent
        phase: "before",             // before | scored | after
        onboarded: false
      },
      checklist: {},                 // { itemId: true }
      riasec: {
        answers: {},                 // { questionIndex: 0|1|2 }
        idx: 0,
        inProgress: false,
        history: []                  // [{ date, scores: {R..C}, code }]
      },
      flows: [],                     // [{ id, activity, when, signals[], note, created }]
      achievements: [],              // [{ id, event, role, pattern, created }]
      odyssey: { a: blankOdyssey(), b: blankOdyssey(), c: blankOdyssey() },
      interviews: [],                // [{ id, person, occupation, relation, date, status, answers{}, gain, created }]
      decision: {
        weights: { interest: 3, ability: 3, values: 3, career: 3, score: 3, city: 3 },
        candidates: []               // [{ id, school, major, city, tier, scores{}, note, created }]
      },
      ui: {}
    };
  }

  // 浅层补全缺失字段（导入旧版本数据时保持健壮）
  function merge(base, saved) {
    if (!saved || typeof saved !== "object") return base;
    Object.keys(base).forEach(function (k) {
      var b = base[k], s = saved[k];
      if (s === undefined || s === null) return;
      if (Array.isArray(b)) {
        if (Array.isArray(s)) base[k] = s;
      } else if (typeof b === "object" && b !== null) {
        base[k] = merge(b, s);
      } else {
        base[k] = s;
      }
    });
    // 保留 defaults 中没有但数据里有的键（向前兼容）
    Object.keys(saved).forEach(function (k) {
      if (base[k] === undefined) base[k] = saved[k];
    });
    return base;
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      return merge(defaults(), JSON.parse(raw));
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
    return merge(defaults(), data);
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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
    sizeKb: sizeKb,
    blankOdyssey: blankOdyssey
  };
})();
