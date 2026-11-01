/* 潮汐・天文計算エンジン（オフラインで動作）
 * 潮位 = 平均水面 + Σ f·H·cos(V + u − κ)   主要4分潮 M2 S2 K1 O1
 * H(振幅)・κ(遅角, 東経135度基準) は気象庁「潮位表掲載地点一覧表(2024年)」の値
 */
(function (root) {
  'use strict';
  var RAD = Math.PI / 180;
  function norm(a) { a = a % 360; return a < 0 ? a + 360 : a; }
  function wrap180(a) { a = norm(a); return a > 180 ? a - 360 : a; }

  /* ---------- 気象庁の調和定数 ---------- */
  // msl: 潮位表基準面から見た平均水面の高さ(cm)
  var STATIONS = {
    OMA:   { name: '大間',       msl: 46, c: { M2: [20.23, 106.65], S2: [9.41, 144.31],  K1: [9.73, 157.08],  O1: [7.20, 141.60] } },
    SHI:   { name: '下北',       msl: 80, c: { M2: [28.60, 103.36], S2: [13.27, 142.29], K1: [19.77, 156.26], O1: [15.10, 138.93] } },
    OMI:   { name: '大湊',       msl: 41, c: { M2: [19.79, 105.63], S2: [9.17, 143.42],  K1: [5.74, 161.14],  O1: [3.87, 148.53] } },
    AOM:   { name: '青森',       msl: 37, c: { M2: [18.47, 102.66], S2: [8.52, 139.90],  K1: [5.53, 155.37],  O1: [3.68, 142.37] } },
    ASA:   { name: '浅虫',       msl: 37, c: { M2: [18.34, 102.94], S2: [8.48, 139.95],  K1: [5.45, 156.46],  O1: [3.64, 143.25] } },
    TAP:   { name: '竜飛',       msl: 33, c: { M2: [12.98, 113.15], S2: [6.05, 149.66],  K1: [6.09, 191.07],  O1: [4.97, 177.86] } },
    OGW:   { name: 'むつ小川原', msl: 85, c: { M2: [30.23, 103.82], S2: [13.92, 142.23], K1: [22.38, 164.75], O1: [18.17, 148.90] } },
    HAC:   { name: '八戸港',     msl: 85, c: { M2: [30.49, 104.34], S2: [14.08, 142.72], K1: [22.27, 162.95], O1: [17.74, 147.40] } }
  };

  /* ---------- 天文引数 ---------- */
  function jdOf(ms) { return ms / 86400000 + 2440587.5; }
  function astro(ms) {
    var d = jdOf(ms) - 2451545.0;
    return {
      d: d,
      s: norm(218.3164477 + 13.17639648 * d),
      h: norm(280.4664567 + 0.98564736 * d),
      p: norm(83.3532465 + 0.11140353 * d),
      N: norm(125.0445479 - 0.05295377 * d)
    };
  }
  function nodal(N) {
    var n = N * RAD, S = Math.sin, C = Math.cos;
    return {
      fM2: 1.0004 - 0.0373 * C(n) + 0.0002 * C(2 * n),
      uM2: -2.14 * S(n),
      fK1: 1.0060 + 0.1150 * C(n) - 0.0088 * C(2 * n) + 0.0006 * C(3 * n),
      uK1: -8.86 * S(n) + 0.68 * S(2 * n) - 0.07 * S(3 * n),
      fO1: 1.0089 + 0.1871 * C(n) - 0.0147 * C(2 * n) + 0.0014 * C(3 * n),
      uO1: 10.80 * S(n) - 1.34 * S(2 * n) + 0.19 * S(3 * n)
    };
  }

  /* 潮位(cm, 潮位表基準面から)。spot: {st:'HAC', k:振幅倍率, dt:時刻補正(分)} */
  function tideHeight(spot, ms) {
    var st = STATIONS[spot.st];
    var t = ms - (spot.dt || 0) * 60000;
    var a = astro(t), nd = nodal(a.N);
    var jstHour = (((t + 9 * 3600000) / 3600000) % 24 + 24) % 24;
    var T = 15 * (jstHour - 12);
    var c = st.c;
    var sum =
      nd.fM2 * c.M2[0] * Math.cos((2 * T - 2 * a.s + 2 * a.h + nd.uM2 - c.M2[1]) * RAD) +
      1.0 * c.S2[0] * Math.cos((2 * T - c.S2[1]) * RAD) +
      nd.fK1 * c.K1[0] * Math.cos((T + a.h - 90 + nd.uK1 - c.K1[1]) * RAD) +
      nd.fO1 * c.O1[0] * Math.cos((T - 2 * a.s + a.h + 90 + nd.uO1 - c.O1[1]) * RAD);
    return st.msl + (spot.k == null ? 1 : spot.k) * sum;
  }

  /* ---------- 月齢・潮回り ---------- */
  function elongation(ms) {
    var a = astro(ms), r = RAD;
    var M = norm(357.5291092 + 0.98560028 * a.d);      // 太陽平均近点角
    var Mm = norm(a.s - a.p);                          // 月平均近点角
    var D = norm(a.s - a.h);                           // 平均離角
    var lm = a.s + 6.289 * Math.sin(Mm * r) + 1.274 * Math.sin((2 * D - Mm) * r) +
             0.658 * Math.sin(2 * D * r) - 0.186 * Math.sin(M * r) +
             0.214 * Math.sin(2 * Mm * r) - 0.114 * Math.sin(2 * a.s * r - 2 * a.N * r);
    var ls = a.h + 1.915 * Math.sin(M * r) + 0.020 * Math.sin(2 * M * r);
    return norm(lm - ls);
  }
  function moonAge(ms) {                               // 直前の新月からの経過日数
    var t = ms - (elongation(ms) / 12.19075) * 86400000;
    for (var i = 0; i < 4; i++) t -= (wrap180(elongation(t)) / 12.19075) * 86400000;
    return (ms - t) / 86400000;
  }
  var TYPE_BY_DAY = ['大潮','大潮','大潮','中潮','中潮','中潮','小潮','小潮','小潮','長潮','若潮',
                     '中潮','中潮','中潮','大潮','大潮','大潮','中潮','中潮','中潮','小潮','小潮',
                     '小潮','長潮','若潮','中潮','中潮','中潮','中潮','大潮'];
  var TYPE_FACTOR = { '大潮': 1.0, '中潮': 0.85, '小潮': 0.62, '長潮': 0.55, '若潮': 0.68 };
  function tideType(dayMidnightJst) {                  // 暦と同じく当日正午(JST)の月齢で判定
    var age = moonAge(dayMidnightJst + 12 * 3600000);
    var idx = Math.min(29, Math.floor(age));
    return { age: age, type: TYPE_BY_DAY[idx], factor: TYPE_FACTOR[TYPE_BY_DAY[idx]] };
  }

  /* ---------- 日の出・日の入り（NOAA式）---------- */
  function sunTimes(dayMidnightJst, lat, lon) {
    var noonUt = dayMidnightJst + 12 * 3600000 - 9 * 3600000;
    var jd = jdOf(noonUt), T = (jd - 2451545.0) / 36525;
    var L0 = norm(280.46646 + T * (36000.76983 + T * 0.0003032));
    var M = norm(357.52911 + T * (35999.05029 - 0.0001537 * T)), Mr = M * RAD;
    var e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
    var C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
            Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) + Math.sin(3 * Mr) * 0.000289;
    var lam = (L0 + C - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * T) * RAD)) * RAD;
    var eps = (23.439291 - 0.0130042 * T + 0.00256 * Math.cos((125.04 - 1934.136 * T) * RAD)) * RAD;
    var decl = Math.asin(Math.sin(eps) * Math.sin(lam));
    var y = Math.pow(Math.tan(eps / 2), 2), l0 = L0 * RAD;
    var eqt = 4 / RAD * (y * Math.sin(2 * l0) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * l0) -
              0.5 * y * y * Math.sin(4 * l0) - 1.25 * e * e * Math.sin(2 * Mr));   // 分
    var ha = Math.acos(Math.cos(90.833 * RAD) / (Math.cos(lat * RAD) * Math.cos(decl)) - Math.tan(lat * RAD) * Math.tan(decl)) / RAD;
    var solarNoonMin = 720 - 4 * lon - eqt + 540;                                  // JST の分
    return { rise: dayMidnightJst + (solarNoonMin - 4 * ha) * 60000,
             set:  dayMidnightJst + (solarNoonMin + 4 * ha) * 60000 };
  }

  /* ---------- 1日の潮位系列・満干潮 ---------- */
  var STEP = 10 * 60000;
  function series(spot, startMs, endMs) {
    var out = [];
    for (var t = startMs; t <= endMs; t += STEP) out.push({ t: t, h: tideHeight(spot, t) });
    return out;
  }
  function extremes(spot, startMs, endMs) {            // 満潮・干潮の時刻と潮位(放物線補間)
    var pad = 3 * 3600000, s = series(spot, startMs - pad, endMs + pad), res = [];
    for (var i = 1; i < s.length - 1; i++) {
      var a = s[i - 1].h, b = s[i].h, c = s[i + 1].h;
      var isHi = b > a && b >= c, isLo = b < a && b <= c;
      if (!isHi && !isLo) continue;
      var den = a - 2 * b + c, off = den === 0 ? 0 : 0.5 * (a - c) / den;
      var t = s[i].t + off * STEP, h = b - 0.25 * (a - c) * off;
      if (t >= startMs && t < endMs) res.push({ t: t, h: h, type: isHi ? 'high' : 'low' });
    }
    return res;
  }
  /* 上げ○分・下げ○分 */
  function stageAt(spot, ms) {
    var ex = extremes(spot, ms - 8 * 3600000, ms + 8 * 3600000), prev = null, next = null;
    for (var i = 0; i < ex.length; i++) { if (ex[i].t <= ms) prev = ex[i]; else { next = ex[i]; break; } }
    if (!prev || !next) return null;
    var ratio = (tideHeight(spot, ms) - prev.h) / (next.h - prev.h);
    ratio = Math.max(0, Math.min(1, ratio));
    return { rising: prev.type === 'low', ratio: ratio, bun: Math.round(ratio * 10) };
  }

  /* ---------- 釣れやすさの目安(0〜1) ---------- */
  function gauss(x, mu, sd) { var z = (x - mu) / sd; return Math.exp(-0.5 * z * z); }
  function fishScoreSlots(spot, dayMidnightJst, lat, lon) {
    var st = STATIONS[spot.st], k = spot.k == null ? 1 : spot.k;
    var maxSlope = (st.c.M2[0] + st.c.S2[0]) * k * 2 * Math.PI / 12.42;      // cm/時間の基準
    var tt = tideType(dayMidnightJst), sun = sunTimes(dayMidnightJst, lat, lon);
    var ex = extremes(spot, dayMidnightJst - 6 * 3600000, dayMidnightJst + 30 * 3600000);
    var slots = [];
    for (var m = 0; m < 24 * 60; m += 30) {
      var t = dayMidnightJst + (m + 15) * 60000;                              // 30分枠の中央
      var slope = Math.abs(tideHeight(spot, t + 900000) - tideHeight(spot, t - 900000)) * 2; // cm/時間
      var flow = Math.min(1, slope / (0.85 * maxSlope));
      var prev = null, next = null;
      for (var i = 0; i < ex.length; i++) { if (ex[i].t <= t) prev = ex[i]; else { next = ex[i]; break; } }
      var stageBonus = 0.5, rising = null, bun = null;
      if (prev && next) {
        var r = Math.max(0, Math.min(1, (tideHeight(spot, t) - prev.h) / (next.h - prev.h)));
        rising = prev.type === 'low'; bun = Math.round(r * 10);
        stageBonus = rising ? gauss(r, 0.3, 0.2) : gauss(r, 0.7, 0.2);       // 上げ3分・下げ7分
      }
      var turn = 0;                                                            // 満干潮の前後1時間は時合いになりやすい
      for (var j = 0; j < ex.length; j++) turn = Math.max(turn, gauss((t - ex[j].t) / 60000, 0, 40));
      var tide = 0.5 * flow + 0.3 * stageBonus + 0.2 * turn;
      var mama = Math.max(gauss((t - sun.rise) / 60000, 15, 55), gauss((t - sun.set) / 60000, -15, 55));
      var raw = (0.62 * tide + 0.38 * mama) * (0.62 + 0.38 * tt.factor) / 0.82;   // 大潮=1.0 … 長潮≒0.83（÷0.82は★の分布を整える係数）
      var score = Math.max(0, Math.min(1, raw));
      var dark = t < sun.rise ? (sun.rise - t) / 3600000 : t > sun.set ? (t - sun.set) / 3600000 : 0;
      slots.push({ t: t, min: m, score: score, stars: score > 0.8 ? 5 : score > 0.65 ? 4 : score > 0.5 ? 3 : score > 0.35 ? 2 : 1,
                   rising: rising, bun: bun, mazume: mama > 0.5,
                   // 魚種別スコア(species.js)で使う部品（すべて0〜1）
                   flow: flow, stageBonus: stageBonus, turn: turn, mama: mama, night: Math.max(0, Math.min(1, dark)) });
    }
    return { slots: slots, sun: sun, tt: tt };
  }

  var api = { STATIONS: STATIONS, tideHeight: tideHeight, moonAge: moonAge, tideType: tideType, sunTimes: sunTimes,
              series: series, extremes: extremes, stageAt: stageAt, fishScoreSlots: fishScoreSlots };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Tide = api;
})(typeof window !== 'undefined' ? window : this);
