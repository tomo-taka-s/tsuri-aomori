/* 潮汐・天文計算エンジン（オフラインで動作）
 * 潮位 = 平均水面 + Σ f·H·cos(V + u − κ)   主要4分潮 + 季節変動(Sa,Ssa) + 主な小分潮
 * H(振幅)・κ(遅角, 各地点の経度の現地時基準) は気象庁の公表値（tideHeight 付近のコメント参照）
 */
(function (root) {
  'use strict';
  var RAD = Math.PI / 180;
  function norm(a) { a = a % 360; return a < 0 ? a + 360 : a; }
  function wrap180(a) { a = norm(a); return a > 180 ? a - 360 : a; }

  /* ---------- 気象庁の調和定数 ---------- */
  // 主要4分潮 M2 S2 K1 O1: 気象庁「潮位表掲載地点一覧表(2024年)」の振幅(cm)・遅角(°)
  // ★遅角は各地点の経度(lon)の現地時が基準です（東経135度ではない）。lon は同表の経度。
  // msl: 潮位表基準面から見た平均水面の高さ(cm)
  var STATIONS = {
    OMA: { name: '大間',       lon: 140.9,    msl: 46, c: { M2: [20.23, 106.65], S2: [9.41, 144.31],  K1: [9.73, 157.08],  O1: [7.20, 141.60] } },
    SHI: { name: '下北',       lon: 141.2381, msl: 80, full: true, c: { M2: [28.60, 103.36], S2: [13.27, 142.29], K1: [19.77, 156.26], O1: [15.10, 138.93] } },
    OMI: { name: '大湊',       lon: 141.15,   msl: 41, c: { M2: [19.79, 105.63], S2: [9.17, 143.42],  K1: [5.74, 161.14],  O1: [3.87, 148.53] } },
    AOM: { name: '青森',       lon: 140.7667, msl: 37, c: { M2: [18.47, 102.66], S2: [8.52, 139.90],  K1: [5.53, 155.37],  O1: [3.68, 142.37] } },
    ASA: { name: '浅虫',       lon: 140.8667, msl: 37, c: { M2: [18.34, 102.94], S2: [8.48, 139.95],  K1: [5.45, 156.46],  O1: [3.64, 143.25] } },
    TAP: { name: '竜飛',       lon: 140.3833, msl: 33, c: { M2: [12.98, 113.15], S2: [6.05, 149.66],  K1: [6.09, 191.07],  O1: [4.97, 177.86] } },
    OGW: { name: 'むつ小川原', lon: 141.3833, msl: 85, c: { M2: [30.23, 103.82], S2: [13.92, 142.23], K1: [22.38, 164.75], O1: [18.17, 148.90] } },
    HAC: { name: '八戸港',     lon: 141.55,   msl: 85, c: { M2: [30.49, 104.34], S2: [14.08, 142.72], K1: [22.27, 162.95], O1: [17.74, 147.40] } }
  };
  // 下北の60分潮のうち主なもの（気象庁 harms60, 2024年）[振幅cm, 遅角°]。季節変動(Sa,Ssa)と小分潮を補う。
  // 下北以外の港は、公表されている主要4分潮との比（振幅比・位相差）で同じ関係として補っています（推定）。
  var MINOR = {
    Sa: [8.15, 174.87], Ssa: [2.12, 256.85], Mm: [0.53, 135.36], Mf: [0.91, 166.49],
    '2Q1': [0.38, 123.55], sig1: [0.52, 129.77], Q1: [3.11, 129.65], rho1: [0.54, 133.49], P1: [6.19, 155.88], J1: [1.09, 174.12], OO1: [0.58, 187.99],
    '2N2': [0.27, 102.60], mu2: [0.59, 111.75], N2: [3.68, 84.67], nu2: [0.79, 82.15], L2: [1.02, 121.14], T2: [0.78, 141.81], K2: [3.63, 137.33], M3: [0.57, 106.98]
  };
  var BASE4 = { M2: [28.60, 103.36], S2: [13.27, 142.29], K1: [19.77, 156.26], O1: [15.10, 138.93] };   // 下北の主要4分潮
  var PARENT = { '2Q1': 'O1', sig1: 'O1', Q1: 'O1', rho1: 'O1', P1: 'K1', J1: 'K1', OO1: 'K1',
                 '2N2': 'M2', mu2: 'M2', N2: 'M2', nu2: 'M2', L2: 'M2', T2: 'S2', K2: 'S2', M3: 'M2' };
  // 平衡潮の引数 V（度）。T=現地の平均太陽時角(正午=0)、s=月, h=太陽, p=月近地点, p1=太陽近日点の平均経度
  var VF = {
    Sa: function (T, s, h) { return h; }, Ssa: function (T, s, h) { return 2 * h; },
    Mm: function (T, s, h, p) { return s - p; }, Mf: function (T, s) { return 2 * s; },
    '2Q1': function (T, s, h, p) { return T - 4 * s + h + 2 * p + 90; }, sig1: function (T, s, h) { return T - 4 * s + 3 * h + 90; },
    Q1: function (T, s, h, p) { return T - 3 * s + h + p + 90; }, rho1: function (T, s, h, p) { return T - 3 * s + 3 * h - p + 90; },
    O1: function (T, s, h) { return T - 2 * s + h + 90; }, P1: function (T, s, h) { return T - h + 90; },
    K1: function (T, s, h) { return T + h - 90; }, J1: function (T, s, h, p) { return T + s + h - p - 90; }, OO1: function (T, s, h) { return T + 2 * s + h - 90; },
    '2N2': function (T, s, h, p) { return 2 * T - 4 * s + 2 * h + 2 * p; }, mu2: function (T, s, h) { return 2 * T - 4 * s + 4 * h; },
    N2: function (T, s, h, p) { return 2 * T - 3 * s + 2 * h + p; }, nu2: function (T, s, h, p) { return 2 * T - 3 * s + 4 * h - p; },
    M2: function (T, s, h) { return 2 * T - 2 * s + 2 * h; }, L2: function (T, s, h, p) { return 2 * T - s + 2 * h - p + 180; },
    T2: function (T, s, h, p, p1) { return 2 * T - h + p1; }, S2: function (T) { return 2 * T; }, K2: function (T, s, h) { return 2 * T + 2 * h; },
    M3: function (T, s, h) { return 3 * T - 3 * s + 3 * h; }
  };
  var NODKEY = { Sa: 'one', Ssa: 'one', Mm: 'Mm', Mf: 'Mf', '2Q1': 'O1', sig1: 'O1', Q1: 'O1', rho1: 'O1', O1: 'O1', P1: 'one', K1: 'K1', J1: 'J1', OO1: 'OO1',
                 '2N2': 'M2', mu2: 'M2', N2: 'M2', nu2: 'M2', M2: 'M2', L2: 'M2', T2: 'one', S2: 'one', K2: 'K2', M3: 'M3' };

  /* ---------- 天文引数 ---------- */
  function jdOf(ms) { return ms / 86400000 + 2440587.5; }
  function astro(ms) {
    var d = jdOf(ms) - 2451545.0;
    return {
      d: d,
      s: norm(218.3164477 + 13.17639648 * d),
      h: norm(280.4664567 + 0.98564736 * d),
      p: norm(83.3532465 + 0.11140353 * d),
      N: norm(125.0445479 - 0.05295377 * d),
      p1: 282.94 + 0.0000471 * d
    };
  }
  function nodal(N) {
    var n = N * RAD, S = Math.sin, C = Math.cos;
    var fM2 = 1.0004 - 0.0373 * C(n) + 0.0002 * C(2 * n), uM2 = -2.14 * S(n);
    return {
      one: [1, 0],
      M2: [fM2, uM2], M3: [Math.pow(fM2, 1.5), 1.5 * uM2],
      O1: [1.0089 + 0.1871 * C(n) - 0.0147 * C(2 * n) + 0.0014 * C(3 * n), 10.80 * S(n) - 1.34 * S(2 * n) + 0.19 * S(3 * n)],
      K1: [1.0060 + 0.1150 * C(n) - 0.0088 * C(2 * n) + 0.0006 * C(3 * n), -8.86 * S(n) + 0.68 * S(2 * n) - 0.07 * S(3 * n)],
      J1: [1.1029 + 0.1676 * C(n) - 0.0170 * C(2 * n) + 0.0016 * C(3 * n), -12.94 * S(n) + 1.34 * S(2 * n) - 0.19 * S(3 * n)],
      OO1: [1.1027 + 0.6504 * C(n) + 0.0317 * C(2 * n) - 0.0014 * C(3 * n), -36.68 * S(n) + 4.02 * S(2 * n) - 0.57 * S(3 * n)],
      K2: [1.0241 + 0.2863 * C(n) + 0.0083 * C(2 * n) - 0.0015 * C(3 * n), -17.74 * S(n) + 0.68 * S(2 * n) - 0.04 * S(3 * n)],
      Mf: [1.0429 + 0.4135 * C(n) - 0.0040 * C(2 * n), -23.74 * S(n) + 2.68 * S(2 * n) - 0.38 * S(3 * n)],
      Mm: [1 - 0.1300 * C(n) + 0.0013 * C(2 * n), 0]
    };
  }

  /* 地点ごとの分潮表（初回だけ作って使い回す） */
  var CONSTS = {};
  function consts(code) {
    if (CONSTS[code]) return CONSTS[code];
    var st = STATIONS[code], list = [], k;
    ['M2', 'S2', 'K1', 'O1'].forEach(function (m) { list.push({ A: st.c[m][0], ph: st.c[m][1], v: VF[m], nod: NODKEY[m] }); });
    for (k in MINOR) {
      var A = MINOR[k][0], ph = MINOR[k][1], par = PARENT[k];
      if (!st.full && par) { A = A * st.c[par][0] / BASE4[par][0]; ph = ph + (st.c[par][1] - BASE4[par][1]); }
      list.push({ A: A, ph: ph, v: VF[k], nod: NODKEY[k] });
    }
    return (CONSTS[code] = list);
  }

  /* 潮位(cm, 潮位表基準面から)。spot: {st:'HAC', k:振幅倍率, dt:時刻補正(分), dz:潮位補正(cm)} */
  function tideHeight(spot, ms) {
    var st = STATIONS[spot.st], t = ms - (spot.dt || 0) * 60000;
    var a = astro(t), nd = nodal(a.N);
    var jstHour = (((t + 9 * 3600000) / 3600000) % 24 + 24) % 24;
    var T = 15 * (jstHour - 12) + (st.lon - 135);                 // その港の経度の現地時で見た太陽の時角
    var list = consts(spot.st), sum = 0;
    for (var i = 0; i < list.length; i++) {
      var L = list[i], fu = nd[L.nod];
      sum += fu[0] * L.A * Math.cos((L.v(T, a.s, a.h, a.p, a.p1) + fu[1] - L.ph) * RAD);
    }
    return st.msl + (spot.dz || 0) + (spot.k == null ? 1 : spot.k) * sum;
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
    var ex = extremes(spot, ms - 30 * 3600000, ms + 30 * 3600000), prev = null, next = null;   // 満干潮の間隔が長い日（半日周潮が弱い日）もあるので広めに探す
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
