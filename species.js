/* 魚種別の「狙いやすさ」ルール表と採点
 *
 * ★重要★ ここの数値は一般的な釣りの知識から置いた【初期値】で、青森県内の釣果データで検証したものではありません。
 *   実際の釣果と合わない魚種・時期は、この表を直すだけで反映されます（アプリ本体の修正は不要）。
 *
 * 1枠(30分)の点数 = 時合い(timing) × (0.25 + 0.75×適性) × 天気係数 × 潮回り係数 ÷ 0.82
 *   適性   = 釣り場の地形 × 時期 × 水温
 *   時合い = 潮の流れ・上げ3分/下げ7分・満干潮前後・朝夕マズメ・夜の重み付き平均（w の合計は1）
 */
(function (root) {
  'use strict';
  // season: 1月〜12月の「釣りやすさ」0〜1（月の中旬の値。日付はその間を直線で補間）
  // temp  : 水温℃  opt=適水温の範囲 / min,max=これより外ではほぼ釣れない
  // hab   : 地形ごとの向き不向き 0〜1
  // wind  : 風がこの m/s までは影響なし（超えると減点）
  // wave  : [ちょうどいい波高の下限, 上限] m、max=これ以上は危険寄りで大幅減点
  // rain  : true なら雨はむしろ歓迎（減点なし）
  var LIST = [
    { id: 'sabiki', name: 'サビキ', full: 'アジ・サバ・イワシ（サビキ）',
      season: [0, 0, 0, 0.05, 0.2, 0.45, 0.8, 1, 1, 0.9, 0.5, 0.1],
      temp: { opt: [16, 23], min: 11, max: 27 }, hab: { port: 1, rock: 0.3, sand: 0.2, estuary: 0.3 },
      w: { flow: 0.30, stage: 0.15, turn: 0.10, mama: 0.30, night: 0.15 }, wind: 5, wave: [0, 0.6], waveMax: 1.8 },
    { id: 'hirame', name: 'ヒラメ', full: 'ヒラメ',
      season: [0.1, 0, 0, 0.05, 0.3, 0.6, 0.6, 0.5, 0.7, 1, 0.9, 0.4],
      temp: { opt: [12, 19], min: 6, max: 24 }, hab: { sand: 1, estuary: 0.8, rock: 0.6, port: 0.6 },
      w: { flow: 0.30, stage: 0.15, turn: 0.05, mama: 0.40, night: 0.10 }, wind: 5, wave: [0.4, 1.2], waveMax: 2.5 },
    { id: 'karei', name: 'カレイ', full: 'カレイ（投げ釣り）',
      season: [0.4, 0.4, 0.7, 0.8, 0.5, 0.2, 0.1, 0.1, 0.2, 0.6, 0.9, 0.6],
      temp: { opt: [6, 14], min: 1, max: 20 }, hab: { sand: 1, port: 0.7, estuary: 0.6, rock: 0.3 },
      w: { flow: 0.25, stage: 0.20, turn: 0.15, mama: 0.15, night: 0.25 }, wind: 6, wave: [0, 1.0], waveMax: 2.2 },
    { id: 'nemono', name: '根魚', full: 'ソイ・メバル・アイナメ（根魚）',
      season: [0.7, 0.6, 0.6, 0.8, 0.9, 0.7, 0.5, 0.4, 0.5, 0.8, 1, 0.9],
      temp: { opt: [8, 16], min: 3, max: 22 }, hab: { rock: 1, port: 0.8, estuary: 0.2, sand: 0.1 },
      w: { flow: 0.25, stage: 0.15, turn: 0.10, mama: 0.25, night: 0.25 }, wind: 5, wave: [0.2, 1.2], waveMax: 2.5, rain: true },
    { id: 'kurodai', name: 'クロダイ', full: 'クロダイ',
      season: [0, 0, 0, 0.1, 0.5, 0.8, 0.9, 1, 1, 0.9, 0.5, 0.1],
      temp: { opt: [17, 25], min: 11, max: 29 }, hab: { port: 1, estuary: 0.8, rock: 0.7, sand: 0.2 },
      w: { flow: 0.30, stage: 0.20, turn: 0.10, mama: 0.25, night: 0.15 }, wind: 5, wave: [0, 0.8], waveMax: 2.0 },
    { id: 'ika', name: 'イカ', full: 'イカ（アオリイカ・コウイカ）',
      season: [0, 0, 0, 0.2, 0.4, 0.4, 0.3, 0.3, 0.6, 1, 0.8, 0.2],
      temp: { opt: [15, 21], min: 10, max: 25 }, hab: { port: 0.9, rock: 0.8, sand: 0.1, estuary: 0.1 },
      w: { flow: 0.20, stage: 0.10, turn: 0.20, mama: 0.35, night: 0.15 }, wind: 3.5, wave: [0, 0.5], waveMax: 1.5 },
    { id: 'suzuki', name: 'スズキ', full: 'スズキ（シーバス）',
      season: [0.05, 0.05, 0.1, 0.3, 0.7, 0.8, 0.7, 0.8, 0.9, 1, 0.8, 0.3],
      temp: { opt: [15, 22], min: 8, max: 27 }, hab: { estuary: 1, port: 0.8, sand: 0.6, rock: 0.4 },
      w: { flow: 0.30, stage: 0.15, turn: 0.10, mama: 0.20, night: 0.25 }, wind: 6, wave: [0.3, 1.2], waveMax: 2.3, rain: true }
  ];
  // 「総合」: 魚種を決めずに、潮と朝夕マズメだけで見る
  var GENERIC = { id: 'all', name: '総合', full: '総合（魚種を決めない）',
    season: null, temp: null, hab: null,
    w: { flow: 0.31, stage: 0.186, turn: 0.124, mama: 0.38, night: 0 }, wind: 4.5, wave: [0, 0.8], waveMax: 2.0 };

  function byId(id) { for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i]; return GENERIC; }

  function seasonAt(arr, ms) {                                    // その日の時期係数（月の間は直線補間）
    var d = new Date(ms + 9 * 3600000), m = d.getUTCMonth(), f = m + (d.getUTCDate() - 15) / 30;
    var i = Math.floor(f), t = f - i, a = arr[((i % 12) + 12) % 12], b = arr[(((i + 1) % 12) + 12) % 12];
    return a + (b - a) * t;
  }
  function tempFactor(sp, T) {
    if (!sp.temp || T == null) return 1;
    var o = sp.temp.opt;
    if (T >= o[0] && T <= o[1]) return 1;
    var edge = T < o[0] ? sp.temp.min : sp.temp.max;
    if ((T < o[0] && T <= edge) || (T > o[1] && T >= edge)) return 0.1;
    var span = Math.abs(edge - (T < o[0] ? o[0] : o[1])), dist = Math.abs(T - (T < o[0] ? o[0] : o[1]));
    return 1 - 0.85 * (dist / span);
  }
  function tempLabel(sp, T) {
    if (!sp.temp) return '';
    if (T == null) return '水温不明';
    var o = sp.temp.opt;
    return T < o[0] ? '水温低め' : T > o[1] ? '水温高め' : '適水温';
  }
  function seasonLabel(v) { return v >= 0.8 ? '好期' : v >= 0.5 ? 'ふつう' : v >= 0.25 ? 'シーズン前後' : '時期外れ'; }
  function habitOf(sp, spot) {
    if (!sp.hab) return 1;
    var best = 0.3;
    (spot.hab || []).forEach(function (h) { if ((sp.hab[h] || 0) > best) best = sp.hab[h]; });
    return best;
  }
  function windFactor(eff, ok) { return eff <= ok ? 1 : Math.max(0.05, 1 - (eff - ok) * 0.11); }
  function waveFactor(eff, sp) {
    var lo = sp.wave[0], hi = sp.wave[1];
    if (eff <= hi) return eff < lo ? 0.88 : 1;
    return Math.max(0.05, 1 - (eff - hi) / (sp.waveMax - hi) * 0.8);
  }
  function stars(s) { var r = Math.round(s * 100); return r > 80 ? 5 : r > 65 ? 4 : r > 50 ? 3 : r > 35 ? 2 : 1; }   // 画面の％（四捨五入）と食い違わないように

  /* fs: Tide.fishScoreSlots の結果 / wx: 取得済みの天気データ(無ければ null) */
  function score(spot, fs, wx, spId, day, W) {
    var sp = byId(spId), exp = spot.exp == null ? 1 : spot.exp;
    var noon = W && wx ? W.at(wx, day + 12 * 3600000) : null, waterT = noon ? noon.sst : undefined;
    var season = sp.season ? seasonAt(sp.season, day + 12 * 3600000) : 1;
    var tF = tempFactor(sp, waterT), hab = habitOf(sp, spot);
    var suit = Math.pow(hab, 0.7) * season * tF;
    var out = [], worst = 0, maxWind = 0, maxWave = null, hasWx = false;
    fs.slots.forEach(function (s) {
      var w = W && wx ? W.at(wx, s.t) : null, wf = 1, warn = 0;
      if (w && (w.wind != null || w.wave != null || w.code != null)) {
        hasWx = true;
        var eff = w.wind == null ? null : Math.max(w.wind, (w.gust == null ? 0 : w.gust * 0.7));
        var wave = w.wave == null ? null : w.wave * exp;
        if (eff != null) { wf *= windFactor(eff, sp.wind); if (eff > maxWind) maxWind = eff; if (eff >= 10) warn = 2; else if (eff >= 7) warn = Math.max(warn, 1); }
        if (wave != null) { wf *= waveFactor(wave, sp); if (maxWave == null || wave > maxWave) maxWave = wave; if (wave >= 2.0) warn = 2; else if (wave >= 1.5) warn = Math.max(warn, 1); }
        if (w.precip != null) { var r = w.precip; wf *= sp.rain ? (r > 3 ? 0.9 : 1) : (r <= 0.3 ? 1 : r <= 1 ? 0.95 : r <= 3 ? 0.85 : 0.65); }
        if (w.code != null && w.code >= 95) { warn = 2; wf *= 0.2; }
      }
      var cm = sp.w, timing = cm.flow * s.flow + cm.stage * s.stageBonus + cm.turn * s.turn + cm.mama * s.mama + cm.night * s.night;
      var v = timing * (0.25 + 0.75 * suit) * wf * (0.62 + 0.38 * fs.tt.factor) / 0.82;
      if (warn === 2) v = Math.min(v, 0.3);
      v = Math.max(0, Math.min(1, v));
      if (warn > worst) worst = warn;
      out.push({ t: s.t, min: s.min, score: v, stars: stars(v), warn: warn, rising: s.rising, bun: s.bun, w: w, night: s.night });
    });
    return { sp: sp, slots: out, suit: suit, season: season, seasonLabel: sp.season ? seasonLabel(season) : '',
             tempLabel: tempLabel(sp, waterT), waterT: waterT, habit: hab, warn: worst, maxWind: maxWind, maxWave: maxWave, hasWx: hasWx };
  }
  function dayScore(sc) {                                         // その日のベスト3時間の平均
    var a = sc.slots.map(function (s) { return s.score; }).sort(function (x, y) { return y - x; }).slice(0, 6);
    return a.reduce(function (x, y) { return x + y; }, 0) / a.length;
  }

  var api = { LIST: LIST, GENERIC: GENERIC, byId: byId, score: score, dayScore: dayScore, stars: stars };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Species = api;
})(typeof window !== 'undefined' ? window : this);
