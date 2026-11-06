(function () {
  'use strict';
  var JST = 9 * 3600000, DAY = 86400000;
  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  var $ = function (id) { return document.getElementById(id); };

  function todayMid() { return Math.floor((Date.now() + JST) / DAY) * DAY - JST; }
  function parts(ms) { var d = new Date(ms + JST); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), w: d.getUTCDay(), H: d.getUTCHours(), M: d.getUTCMinutes() }; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hm(ms) { var p = parts(Math.round(ms / 60000) * 60000); return pad(p.H) + ':' + pad(p.M); }
  function mdw(ms) { var p = parts(ms); return p.m + '月' + p.d + '日(' + WD[p.w] + ')'; }
  function mdhm(ms) { var p = parts(ms); return p.m + '/' + p.d + ' ' + pad(p.H) + ':' + pad(p.M); }
  function stars(n) { return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n); }
  // 釣れやすさ指数(0〜1)を％表示。釣れる確率ではなく、条件の良さの目安。★は 81%〜=★5 / 66〜80=★4 / 51〜65=★3 / 36〜50=★2 / 〜35=★1
  function pct(v) { return Math.round(Math.max(0, Math.min(1, v)) * 100) + '%'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var state = { spot: SPOTS[0], day: todayMid(), sp: 'all', wx: null, wxNote: 'none', loading: false, mshift: 0 };
  try {
    var saved = localStorage.getItem('tsuri.spot'); SPOTS.forEach(function (s) { if (s.id === saved) state.spot = s; });
    var sp0 = localStorage.getItem('tsuri.sp'); if (sp0 && (sp0 === 'all' || Species.LIST.some(function (s) { return s.id === sp0; }))) state.sp = sp0;
  } catch (e) {}

  state.tf = 'all';
  try { var tf0 = localStorage.getItem('tsuri.tf'); if (tf0 === 'good' || tf0 === 'day') state.tf = tf0; } catch (e) {}

  /* ---------- 潮時・潮位の微調整（釣り場ごとに保存） ---------- */
  state.adj = {};
  try { var a0 = localStorage.getItem('tsuri.adj'); if (a0) state.adj = JSON.parse(a0) || {}; } catch (e) { state.adj = {}; }
  function getAdj() { var a = state.adj[state.spot.id] || {}; return { dt: a.dt || 0, dz: a.dz || 0 }; }
  function ts() {                                                  // 補正を反映した釣り場（潮の計算に使う）
    var a = getAdj(); if (!a.dt && !a.dz) return state.spot;
    return Object.assign({}, state.spot, { dt: a.dt, dz: a.dz });
  }
  function bumpAdj(kind, v) {
    var a = getAdj();
    if (kind === 'reset') a = { dt: 0, dz: 0 };
    else { var lim = kind === 'dt' ? 180 : 60; a[kind] = Math.max(-lim, Math.min(lim, a[kind] + v)); }
    if (!a.dt && !a.dz) delete state.adj[state.spot.id]; else state.adj[state.spot.id] = a;
    try { localStorage.setItem('tsuri.adj', JSON.stringify(state.adj)); } catch (e) {}
    render();
  }
  function sgn(n, u) { return (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n) + u; }
  function renderAdj() {
    var a = getAdj();
    function row(label, kind, steps, u) {
      return '<div class="adj-row"><span class="adj-l">' + label + '</span>' + steps.map(function (v) {
        return '<button data-k="' + kind + '" data-v="' + v + '">' + sgn(v, u) + '</button>'; }).join('') + '</div>';
    }
    $('adjBox').innerHTML = row('潮の時刻（＋で遅く）', 'dt', [-10, -5, 5, 10], '分') + row('潮位（＋で高く）', 'dz', [-10, -5, 5, 10], 'cm') +
      '<div class="adj-cur">いまの補正：時刻 ' + sgn(a.dt, '分') + '／潮位 ' + sgn(a.dz, 'cm') + '　<button data-k="reset" data-v="0" class="adj-reset">リセット</button></div>';
  }
  $('adjBox').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button[data-k]') : null;
    if (b) bumpAdj(b.getAttribute('data-k'), +b.getAttribute('data-v'));
  });

  /* ---------- いまの潮（リアルタイム） ---------- */
  function renderNow() {
    var el = $('nowBox'), now = Date.now(), sp = ts();
    if (state.day !== todayMid()) { el.innerHTML = '<div class="now-off">「今日」を表示すると、いまの潮位が出ます。</div>'; return; }
    var h = Tide.tideHeight(sp, now), st = Tide.stageAt(sp, now), ex = Tide.extremes(sp, now, now + 30 * 3600000), nx = ex.length ? ex[0] : null;
    var html = '<div class="now-main"><span class="now-t">' + hm(now) + ' 現在</span><span class="now-h">' + Math.round(h) + '<small>cm</small></span>';
    if (st) html += '<span class="now-s ' + (st.rising ? 'up' : 'down') + '">' + (st.rising ? '上げ潮' : '下げ潮') + '（' + stageLabel(st.rising, st.bun) + '）</span>';
    html += '</div>';
    if (nx) {
      var rem = Math.max(0, Math.round((nx.t - now) / 60000));
      html += '<div class="now-next">次の' + (nx.type === 'high' ? '満潮' : '干潮') + '　' + hm(nx.t) + '（あと' + (rem >= 60 ? Math.floor(rem / 60) + '時間' : '') + (rem % 60) + '分）　' + Math.round(nx.h) + 'cm</div>';
    }
    var w = state.wx ? Weather.at(state.wx, now) : null;
    if (w && w.pres != null) {
      var dz = Math.round(1013 - w.pres);
      html += '<div class="now-p">気圧 ' + Math.round(w.pres) + 'hPa：' + (Math.abs(dz) < 3 ? '潮位への影響はほぼなし' : '予測より約' + Math.abs(dz) + 'cm' + (dz > 0 ? '高め' : '低め') + 'になる目安（グラフには含めていません）') + '</div>';
    }
    var a = getAdj();
    if (a.dt || a.dz) html += '<div class="now-adj">微調整中：時刻 ' + sgn(a.dt, '分') + '／潮位 ' + sgn(a.dz, 'cm') + '</div>';
    el.innerHTML = html;
  }

  /* ---------- 地点・日付の操作 ---------- */
  (function buildSelect() {
    var sel = $('spot'), groups = {}, order = [];
    SPOTS.forEach(function (s) { if (!groups[s.area]) { groups[s.area] = []; order.push(s.area); } groups[s.area].push(s); });
    sel.innerHTML = order.map(function (a) {
      return '<optgroup label="' + esc(a) + '">' + groups[a].map(function (s) {
        return '<option value="' + s.id + '"' + (s.id === state.spot.id ? ' selected' : '') + '>' + esc(s.name) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
    sel.addEventListener('change', function () {
      SPOTS.forEach(function (s) { if (s.id === sel.value) state.spot = s; });
      try { localStorage.setItem('tsuri.spot', state.spot.id); } catch (e) {}
      loadWx();
    });
  })();
  function shift(n) { state.day += n * DAY; render(); }
  $('prev').onclick = function () { shift(-1); };
  $('next').onclick = function () { shift(1); };
  $('today').onclick = function () { state.day = todayMid(); state.mshift = 0; render(); };
  $('mPrev').onclick = function () { if (state.mshift > 0) { state.mshift--; renderMonth(); } };
  $('mNext').onclick = function () { if (state.mshift < 11) { state.mshift++; renderMonth(); } };

  /* ---------- 天気データの読み込み（オンライン時） ---------- */
  function loadWx() {
    var spot = state.spot, c = Weather.cached(spot);
    state.wx = c; state.wxNote = c ? 'cached' : 'none'; state.loading = false;
    if (Weather.isFresh(c)) { state.wxNote = 'fresh'; render(); return; }
    state.loading = true; render();
    Weather.fetchAll(spot).then(function (d) {
      if (state.spot !== spot) return;
      state.wx = d; state.wxNote = 'fresh'; state.loading = false; render();
    }, function () {
      if (state.spot !== spot) return;
      state.loading = false; state.wxNote = c ? 'stale' : 'offline'; render();
    });
  }
  window.addEventListener('online', loadWx);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !Weather.isFresh(state.wx)) loadWx();
  });

  /* ---------- ラベル ---------- */
  function stageLabel(rising, bun) {
    if (rising == null) return '';
    if (rising) return bun <= 0 ? '干潮' : bun >= 10 ? '満潮' : '上げ' + bun + '分';
    return bun <= 0 ? '満潮' : bun >= 10 ? '干潮' : '下げ' + bun + '分';
  }
  function mazumeLabel(t, sun) {
    var m = 60000;
    if (t >= sun.rise - 75 * m && t <= sun.rise + 105 * m) return '朝マズメ';
    if (t >= sun.set - 105 * m && t <= sun.set + 75 * m) return '夕マズメ';
    return '';
  }
  function wxText(w) {
    if (!w) return '';
    var out = [], ci = Weather.codeInfo(w.code);
    if (w.code != null) out.push(ci.i + ci.t);
    if (w.temp != null) out.push(Math.round(w.temp) + '℃');
    if (w.wind != null) out.push('風' + Weather.dirName(w.dir) + ' ' + w.wind.toFixed(1) + 'm/s' + (w.gust != null && w.gust - w.wind >= 2 ? '（瞬間' + w.gust.toFixed(0) + '）' : ''));
    if (w.wave != null) out.push('波' + w.wave.toFixed(1) + 'm');
    if (w.precip != null && w.precip >= 0.1) out.push('雨' + w.precip.toFixed(1) + 'mm');
    return out.join('　');
  }

  /* ---------- 計算 ---------- */
  function compute(spot, day, spId) {
    var fs = Tide.fishScoreSlots(spot, day, spot.lat, spot.lon);
    return { fs: fs, sc: Species.score(spot, fs, state.wx, spId, day, Weather), ex: Tide.extremes(spot, day, day + DAY), ser: Tide.series(spot, day, day + DAY) };
  }
  function bestWindows(slots) {
    var max = 0;
    slots.forEach(function (s) { if (s.score > max) max = s.score; });
    var thr = Math.min(0.62, max * 0.86), wins = [], cur = null;
    slots.forEach(function (s, i) {
      if (s.score >= thr && s.score > 0.1) { if (!cur) { cur = { a: i, b: i }; wins.push(cur); } else cur.b = i; } else cur = null;
    });
    wins.forEach(function (w) {
      var sum = 0, peak = w.a;
      for (var i = w.a; i <= w.b; i++) { sum += slots[i].score; if (slots[i].score > slots[peak].score) peak = i; }
      w.mean = sum / (w.b - w.a + 1); w.peak = peak; w.maxStars = slots[peak].stars;
    });
    var rank = function (w) { return w.mean * Math.min(1.4, 0.7 + 0.15 * (w.b - w.a + 1)); };
    wins.sort(function (x, y) { return rank(y) - rank(x); });
    return wins.slice(0, 3).sort(function (x, y) { return x.a - y.a; });
  }

  /* ---------- 描画: 魚種チップ・情報 ---------- */
  function renderChips() {
    var all = [Species.GENERIC].concat(Species.LIST);
    $('chips').innerHTML = all.map(function (s) {
      return '<button class="cbtn' + (s.id === state.sp ? ' sel' : '') + '" data-sp="' + s.id + '" role="tab" aria-selected="' + (s.id === state.sp) + '">' + esc(s.name) + '</button>';
    }).join('');
    Array.prototype.forEach.call($('chips').querySelectorAll('.cbtn'), function (b) {
      b.onclick = function () { setSpecies(b.getAttribute('data-sp')); };
    });
  }
  function setSpecies(id) {
    state.sp = id; try { localStorage.setItem('tsuri.sp', id); } catch (e) {}
    render();
    var sel = document.querySelector('.cbtn.sel'); if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  function renderSpInfo(d) {
    var sc = d.sc, sp = sc.sp;
    if (sp.id === 'all') { $('spInfo').innerHTML = '魚種を決めず、<b>潮の動きと朝夕マズメ</b>で見ています。上のボタンで狙う魚を選ぶと、その魚の時期・水温・時間帯の好みで見直します。'; return; }
    var cls = sc.season >= 0.8 ? 'good' : sc.season >= 0.5 ? 'mid' : 'bad';
    var h = '<b>' + esc(sp.full) + '</b><br><span class="pill ' + cls + '">' + sc.seasonLabel + '</span>';
    if (sc.waterT != null) h += '<span class="pill ' + (sc.tempLabel === '適水温' ? 'good' : 'mid') + '">' + sc.tempLabel + '（' + sc.waterT.toFixed(1) + '℃）</span>';
    else h += '<span class="pill">水温データなし</span>';
    if (sc.habit < 0.5) h += '<span class="pill mid">この釣り場の地形は不向き</span>';
    if (sc.season < 0.25) h += '<br>いまの時期は釣りにくい魚です（★は低めに出ます）。';
    $('spInfo').innerHTML = h;
  }

  /* ---------- 描画: 月のベスト3 ---------- */
  var monthCache = {};
  function monthDays(shift) {
    var p = parts(todayMid()), y = p.y, m = p.m + shift;
    while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; }
    var first = Date.UTC(y, m - 1, 1) - JST, next = Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1) - JST;
    return { y: y, m: m, first: first, n: Math.round((next - first) / DAY) };
  }
  function renderMonth() {
    var mo = monthDays(state.mshift), today = todayMid();
    $('monthTitle').textContent = mo.m + '月のベスト3（' + state.spot.name + '・' + Species.byId(state.sp).name + '）';
    var key = [state.spot.id, state.sp, mo.y, mo.m, today, state.wx ? state.wx.at : 0, getAdj().dt, getAdj().dz].join('|'), rows = monthCache[key];
    if (!rows) {
      rows = [];
      for (var i = 0; i < mo.n; i++) {
        var day = mo.first + i * DAY;
        if (day < today) continue;                                   // 過ぎた日は対象外
        var fs = Tide.fishScoreSlots(ts(), day, state.spot.lat, state.spot.lon);
        var base = Species.score(state.spot, fs, null, state.sp, day, Weather);          // 潮・時期・時間帯だけ（全日同じ条件で比べる）
        var wxs = state.wx ? Species.score(state.spot, fs, state.wx, state.sp, day, Weather) : null;
        var inFc = !!(wxs && wxs.hasWx);                              // 予報のある日だけ天気を見る
        var wins = bestWindows(base.slots).sort(function (x, y) { return y.mean - x.mean; });
        rows.push({ day: day, tt: fs.tt, ds: Species.dayScore(base), base: base, stormy: inFc && wxs.warn === 2, windy: inFc && wxs.warn === 1,
                    inFc: inFc, win: wins.length ? hm(base.slots[wins[0].a].t - 15 * 60000) + '〜' + hm(base.slots[wins[0].b].t + 15 * 60000) : '' });
      }
      monthCache = {}; monthCache[key] = rows;
    }
    var cand = rows.filter(function (r) { return !r.stormy; }).sort(function (x, y) { return y.ds - x.ds; }).slice(0, 3);
    var skipped = rows.filter(function (r) { return r.stormy; }).length;
    if (!cand.length) { $('monthBest').innerHTML = '<p class="empty">' + (rows.length ? '候補になる日がありません。' : 'この月は過ぎています。') + '</p>'; $('monthNote').textContent = ''; return; }
    $('monthBest').innerHTML = cand.map(function (r, i) {
      var p = parts(r.day), sub = [r.base.seasonLabel].filter(Boolean);
      if (r.win) sub.push('ベスト ' + r.win);
      if (r.windy) sub.push('風波やや強い予報');
      return '<button class="mrow" data-day="' + r.day + '"><span class="mrank r' + (i + 1) + '">' + (i + 1) + '</span>' +
             '<span class="mmain"><span class="mdate">' + p.m + '/' + p.d + '(' + WD[p.w] + ')　<span class="mtype' + (r.tt.type === '大潮' ? ' oo' : '') + '">' + r.tt.type + '</span></span>' +
             '<span class="msub">' + esc(sub.join('・')) + '</span></span><span class="rank-star"><b class="pct">' + pct(r.ds) + '</b><br>' + stars(Species.stars(r.ds)) + '</span></button>';
    }).join('');
    Array.prototype.forEach.call($('monthBest').querySelectorAll('.mrow'), function (b) {
      b.onclick = function () { state.day = +b.getAttribute('data-day'); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    });
    $('monthNote').textContent = '日ごとの比較は「潮・月齢・時期・時間帯」で行っています。天気・波は予報のある約7日先までしか見られないため、荒天の予報が出た日だけ候補から外します' +
      (skipped ? '（今回は' + skipped + '日除外）' : '') + '。先の日を選んだら、近づいたら天気を確認してください。' + (mo.n && rows.length < mo.n ? '過ぎた日は含めていません。' : '');
  }

  /* ---------- 描画: 警告 ---------- */
  function renderWarn(d) {
    var sc = d.sc, el = $('warn');
    if (!sc.warn) { el.innerHTML = ''; return; }
    var bits = [];
    if (sc.maxWind >= 7) bits.push('最大風速 ' + sc.maxWind.toFixed(0) + 'm/s');
    if (sc.maxWave != null && sc.maxWave >= 1.5) bits.push('波 ' + sc.maxWave.toFixed(1) + 'm前後');
    var thunder = sc.slots.some(function (s) { return s.w && s.w.code != null && s.w.code >= 95; });
    if (thunder) bits.push('雷');
    el.innerHTML = sc.warn === 2
      ? '<div class="warnbox danger">⚠ 荒天注意：' + esc(bits.join('・')) + '。この日の釣行は避けてください。（該当する時間帯は★1にしています）</div>'
      : '<div class="warnbox caution">風や波がやや強めの時間があります（' + esc(bits.join('・')) + '）。足場の悪い場所は避け、ライフジャケットを着用してください。</div>';
  }

  /* ---------- 描画: 潮の概要 ---------- */
  function renderSummary(d) {
    var tt = d.fs.tt, sun = d.fs.sun, spot = state.spot;
    var h = '<div class="sum-head"><span class="sum-type' + (tt.type === '大潮' ? ' oo' : '') + '">' + tt.type + '</span>' +
            '<span class="sum-age">月齢 ' + tt.age.toFixed(1) + '　' + esc(spot.name) + '</span></div><div class="sum-grid">';
    h += '<div class="chip"><b>日の出</b><span>' + hm(sun.rise) + '</span></div>';
    h += '<div class="chip"><b>日の入り</b><span>' + hm(sun.set) + '</span></div>';
    d.ex.forEach(function (e) {
      h += '<div class="chip ' + (e.type === 'high' ? 'hi' : 'lo') + '"><b>' + (e.type === 'high' ? '満潮' : '干潮') + '</b><span>' + hm(e.t) + '　' + Math.round(e.h) + 'cm</span></div>';
    });
    $('summary').innerHTML = h + '</div>';
  }

  /* ---------- 描画: 天気 ---------- */
  function renderWx() {
    var day = state.day, any = false, tmin = null, tmax = null, rain = 0, wmax = null, wdir = null, hmax = null, code12;
    if (state.wx) for (var h = 0; h < 24; h++) {
      var w = Weather.at(state.wx, day + h * 3600000 + 1800000);
      if (!w) continue;
      if (w.temp != null) { any = true; tmin = tmin == null ? w.temp : Math.min(tmin, w.temp); tmax = tmax == null ? w.temp : Math.max(tmax, w.temp); }
      if (w.precip != null) rain += w.precip;
      if (w.wind != null && (wmax == null || w.wind > wmax)) { wmax = w.wind; wdir = w.dir; }
      if (w.wave != null && (hmax == null || w.wave > hmax)) hmax = w.wave;
      if (h === 12) code12 = w.code;
    }
    var noon = state.wx ? Weather.at(state.wx, day + 12 * 3600000) : null, sst = noon ? noon.sst : undefined;
    var html;
    if (!any && wmax == null) {
      html = '<p class="empty">' + (state.loading ? '取得中…' : 'この日の天気データはありません。' + (state.wx ? '（予報は約7日先までです）' : '')) + '</p>';
    } else {
      var ci = Weather.codeInfo(code12);
      html = '<div class="wx-head"><span class="wx-ico">' + ci.i + '</span><span class="wx-t">' + ci.t + '</span></div><div class="wx-grid">' +
        '<div class="chip"><b>気温</b><span>' + (tmin == null ? '—' : Math.round(tmin) + '〜' + Math.round(tmax) + '<small>℃</small>') + '</span></div>' +
        '<div class="chip"><b>降水量（1日）</b><span>' + rain.toFixed(1) + '<small>mm</small></span></div>' +
        '<div class="chip"><b>最大風速</b><span>' + (wmax == null ? '—' : Weather.dirName(wdir) + ' ' + wmax.toFixed(1) + '<small>m/s</small>') + '</span></div>' +
        '<div class="chip"><b>最大波高（沖）</b><span>' + (hmax == null ? 'データなし' : hmax.toFixed(1) + '<small>m</small>') + '</span></div>' +
        '<div class="chip"><b>水温</b><span>' + (sst == null ? 'データなし' : sst.toFixed(1) + '<small>℃</small>') + '</span></div>' +
        '</div>';
    }
    $('wx').innerHTML = html;
    var st = '';
    if (state.loading) st = '天気・波・水温を取得中…';
    else if (state.wxNote === 'fresh') st = '更新 ' + mdhm(state.wx.at);
    else if (state.wxNote === 'stale' || state.wxNote === 'cached') st = 'オフライン：最後に取得した値（' + mdhm(state.wx.at) + '）を表示しています';
    else st = '天気・波・水温を取得できませんでした。潮の計算だけで表示しています（電波のあるところで開くと取得します）';
    var miss = [];
    if (state.wx && state.wx.wave && state.wx.wave.status !== 'ok') miss.push('波');
    if (state.wx && state.wx.sst && state.wx.sst.status !== 'ok') miss.push('水温');
    if (state.wx && state.wx.fc && state.wx.fc.status !== 'ok') miss.push('天気・風');
    if (state.wx && state.wx.fc && state.wx.fc.status === 'ok') st += state.wx.fc.model === 'jma' ? '（風・天気：気象庁モデル）' : '（風・天気：標準モデル）';
    $('wxStat').innerHTML = esc(st) + (miss.length ? '<span class="miss">この釣り場では「' + miss.join('・') + '」のデータが取れませんでした（湾内などでは起こります）。その分は判定に入れていません。</span>' : '');
  }

  /* ---------- 描画: おすすめ ---------- */
  function renderBest(d) {
    var slots = d.sc.slots, wins = bestWindows(slots), sun = d.fs.sun, html = '';
    if (d.sc.warn === 2 && !wins.length) { $('best').innerHTML = '<p class="empty">荒天のため、おすすめの時間帯はありません。</p>'; return; }
    if (!wins.length) { $('best').innerHTML = '<p class="empty">目立った時合いはありません。</p>'; return; }
    wins.forEach(function (w) {
      var s = slots[w.peak], a = slots[w.a].t - 15 * 60000, b = slots[w.b].t + 15 * 60000, why = [];
      var mz = mazumeLabel(s.t, sun); if (mz) why.push(mz);
      if (s.night >= 0.7) why.push('夜');
      var sl = stageLabel(s.rising, s.bun); if (sl) why.push('ピーク付近は' + sl);
      if (s.warn === 1) why.push('風波に注意');
      html += '<div class="best-item"><div class="best-time">' + hm(a) + '〜' + hm(b) + '</div><div><div class="best-star"><b class="pct">' + pct(s.score) + '</b> ' + stars(w.maxStars) + '</div><div class="best-why">' + esc(why.join('・')) + '</div></div></div>';
    });
    $('best').innerHTML = html;
  }

  /* ---------- 描画: 魚種別の見通し ---------- */
  function renderRank(d) {
    $('rankTitle').textContent = mdw(state.day) + 'の魚種別の見通し（' + state.spot.name + '）';
    var rows = Species.LIST.map(function (sp) {
      var sc = Species.score(state.spot, d.fs, state.wx, sp.id, state.day, Weather), ds = Species.dayScore(sc), w = bestWindows(sc.slots), best = '';
      if (w.length) {
        var top = w.slice().sort(function (x, y) { return y.mean - x.mean; })[0];
        best = hm(sc.slots[top.a].t - 15 * 60000) + '〜' + hm(sc.slots[top.b].t + 15 * 60000);
      }
      return { sp: sp, sc: sc, ds: ds, best: best };
    }).sort(function (x, y) { return y.ds - x.ds; });
    $('rank').innerHTML = rows.map(function (r) {
      var sub = [r.sc.seasonLabel];
      if (r.sc.waterT != null) sub.push(r.sc.tempLabel); else sub.push('水温不明');
      if (r.sc.habit < 0.5) sub.push('地形は不向き');
      if (r.best && r.sc.warn < 2) sub.push('ベスト ' + r.best);
      if (r.sc.warn === 2) sub.push('荒天注意');
      return '<button class="rank-item' + (r.sp.id === state.sp ? ' sel' : '') + '" data-sp="' + r.sp.id + '"><span class="rank-name">' + esc(r.sp.name) + '</span>' +
             '<span class="rank-star"><b class="pct">' + pct(r.ds) + '</b><br>' + stars(Species.stars(r.ds)) + '</span><span class="rank-sub">' + esc(sub.join('・')) + '</span></button>';
    }).join('');
    Array.prototype.forEach.call($('rank').querySelectorAll('.rank-item'), function (b) { b.onclick = function () { setSpecies(b.getAttribute('data-sp')); window.scrollTo({ top: 0, behavior: 'smooth' }); }; });
  }

  /* ---------- 描画: グラフ ---------- */
  function renderChart(d) {
    var W = 360, H = 236, L = 34, R = 10, T = 24, B = 54, pw = W - L - R, ph = H - T - B;
    var min = Infinity, max = -Infinity;
    d.ser.forEach(function (p) { if (p.h < min) min = p.h; if (p.h > max) max = p.h; });
    var yMin = Math.floor((min - 8) / 20) * 20, yMax = Math.ceil((max + 12) / 20) * 20;
    function X(t) { return L + (t - state.day) / DAY * pw; }
    function Y(h) { return T + (1 - (h - yMin) / (yMax - yMin)) * ph; }
    var sun = d.fs.sun, g = '';
    g += '<rect x="' + L + '" y="' + T + '" width="' + Math.max(0, X(sun.rise) - L) + '" height="' + ph + '" fill="#0b2f45" opacity=".10"/>';
    g += '<rect x="' + X(sun.set) + '" y="' + T + '" width="' + Math.max(0, L + pw - X(sun.set)) + '" height="' + ph + '" fill="#0b2f45" opacity=".10"/>';
    for (var v = yMin; v <= yMax; v += 20) {
      g += '<line x1="' + L + '" x2="' + (L + pw) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="var(--line)" stroke-width="1"/>' +
           '<text x="' + (L - 5) + '" y="' + (Y(v) + 4) + '" text-anchor="end" font-size="10" fill="var(--muted)">' + v + '</text>';
    }
    for (var hh = 0; hh <= 24; hh += 3) {
      var x = L + hh / 24 * pw;
      g += '<line x1="' + x + '" x2="' + x + '" y1="' + T + '" y2="' + (T + ph) + '" stroke="var(--line)" stroke-width="1" opacity=".6"/>' +
           '<text x="' + x + '" y="' + (T + ph + 14) + '" text-anchor="middle" font-size="10" fill="var(--muted)">' + hh + '</text>';
    }
    g += '<text x="' + (L - 5) + '" y="' + (T - 9) + '" text-anchor="end" font-size="9" fill="var(--muted)">cm</text>';
    var path = d.ser.map(function (p, i) { return (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p.h).toFixed(1); }).join(' ');
    g += '<defs><linearGradient id="fillg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--sea)" stop-opacity=".45"/><stop offset="1" stop-color="var(--sea)" stop-opacity=".04"/></linearGradient></defs>';
    g += '<path d="' + path + ' L' + (L + pw) + ' ' + (T + ph) + ' L' + L + ' ' + (T + ph) + ' Z" fill="url(#fillg)"/>';
    g += '<path d="' + path + '" fill="none" stroke="var(--sea)" stroke-width="2.4" stroke-linejoin="round"/>';
    [[sun.rise, '日の出'], [sun.set, '日の入']].forEach(function (a) {
      var x = X(a[0]);
      g += '<line x1="' + x + '" x2="' + x + '" y1="' + T + '" y2="' + (T + ph) + '" stroke="var(--star)" stroke-width="1.4" stroke-dasharray="3 3"/>' +
           '<text x="' + x + '" y="' + (T - 9) + '" text-anchor="middle" font-size="9.5" fill="var(--star)">' + a[1] + ' ' + hm(a[0]) + '</text>';
    });
    d.ex.forEach(function (e) {
      var x = X(e.t), y = Y(e.h), hi = e.type === 'high', ty = hi ? y - 8 : y + 16;
      g += '<circle cx="' + x + '" cy="' + y + '" r="3.6" fill="var(--card)" stroke="' + (hi ? 'var(--hi)' : 'var(--sea)') + '" stroke-width="2"/>' +
           '<text x="' + Math.min(L + pw - 16, Math.max(L + 16, x)) + '" y="' + ty + '" text-anchor="middle" font-size="10" font-weight="700" fill="var(--ink)">' + hm(e.t) + '</text>';
    });
    var by = T + ph + 22;
    d.sc.slots.forEach(function (s) {
      var x0 = X(s.t - 15 * 60000), cls = s.warn === 2 ? '#e5484d' : s.stars >= 4 ? 'var(--hi)' : s.stars === 3 ? 'var(--mid)' : 'var(--lo)';
      g += '<rect x="' + x0.toFixed(1) + '" y="' + by + '" width="' + (pw / 48 + .4).toFixed(1) + '" height="14" fill="' + cls + '" opacity="' + (s.warn === 2 ? 0.5 : (0.35 + s.score * 0.65).toFixed(2)) + '"/>';
    });
    g += '<text x="' + (L - 5) + '" y="' + (by + 11) + '" text-anchor="end" font-size="9" fill="var(--muted)">時合い</text>';
    var now = Date.now();
    if (now >= state.day && now < state.day + DAY) {
      var nx = X(now);
      g += '<line x1="' + nx + '" x2="' + nx + '" y1="' + T + '" y2="' + (by + 14) + '" stroke="#e5484d" stroke-width="1.6"/><circle cx="' + nx + '" cy="' + Y(Tide.tideHeight(ts(), now)) + '" r="4" fill="#e5484d"/>';
    }
    $('chartWrap').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="潮位グラフ">' + g + '</svg>';
  }

  /* ---------- 描画: 時系列 ---------- */
  var TF = [['all', 'すべて'], ['good', '★3以上'], ['day', '日中のみ']];
  function renderTfilter() {
    $('tfilter').innerHTML = TF.map(function (f) {
      return '<button data-tf="' + f[0] + '" class="' + (state.tf === f[0] ? 'sel' : '') + '" aria-pressed="' + (state.tf === f[0]) + '">' + f[1] + '</button>';
    }).join('');
  }
  $('tfilter').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button[data-tf]') : null; if (!b) return;
    state.tf = b.getAttribute('data-tf'); try { localStorage.setItem('tsuri.tf', state.tf); } catch (err) {}
    renderTfilter(); renderTimeline(lastD);
  });
  var lastD = null;
  function renderTimeline(d) {
    lastD = d;
    var sl = d.sc.slots, sun = d.fs.sun, out = '', now = Date.now(), shown = 0, bh = {};
    bestWindows(sl).forEach(function (w) { for (var i = w.a; i <= w.b; i++) bh[Math.floor(i / 2)] = 1; });     // ベストの時間帯に入っている時間
    for (var h = 0; h < 24; h++) {
      var a = sl[2 * h], b = sl[2 * h + 1], avg = (a.score + b.score) / 2, n = Species.stars(avg), top = a.score >= b.score ? a : b;
      var t0 = state.day + h * 3600000, t1 = t0 + 3600000, tags = [];
      if (state.tf === 'good' && n < 3) continue;
      if (state.tf === 'day' && (t1 <= sun.rise - 30 * 60000 || t0 >= sun.set + 30 * 60000)) continue;
      shown++;
      if (bh[h]) tags.push('<span class="tag b">ベスト</span>');
      var mz = mazumeLabel(t0 + 1800000, sun); if (mz) tags.push('<span class="tag m">' + mz + '</span>');
      var hasEx = d.ex.some(function (e) { return e.t >= t0 && e.t < t1; });
      var lab = hasEx ? '' : stageLabel(top.rising, top.bun); if (lab) tags.push('<span class="tag t">' + lab + '</span>');
      d.ex.forEach(function (e) { if (e.t >= t0 && e.t < t1) tags.push('<span class="tag e">' + (e.type === 'high' ? '満潮' : '干潮') + ' ' + hm(e.t) + '・' + Math.round(e.h) + 'cm</span>'); });
      if (sun.rise >= t0 && sun.rise < t1) tags.push('<span class="tag m">日の出 ' + hm(sun.rise) + '</span>');
      if (sun.set >= t0 && sun.set < t1) tags.push('<span class="tag m">日の入り ' + hm(sun.set) + '</span>');
      var warn = Math.max(a.warn, b.warn);
      if (warn === 2) tags.push('<span class="tag d">荒天注意</span>'); else if (warn === 1) tags.push('<span class="tag d">風波やや強い</span>');
      var wt = wxText(a.w); if (wt) tags.push('<span class="tag w">' + esc(wt) + '</span>');
      var col = warn === 2 ? '#e5484d' : n >= 4 ? 'var(--hi)' : n === 3 ? 'var(--mid)' : 'var(--lo)';
      out += '<li class="tl' + (now >= t0 && now < t1 ? ' now' : '') + (bh[h] ? ' best' : '') + '"><span class="h">' + pad(h) + ':00</span>' +
             '<span class="bar"><i style="width:' + Math.max(6, Math.round(avg * 100)) + '%;background:' + col + '"></i></span>' +
             '<span class="st"><b class="pct' + (warn === 2 ? ' bad' : '') + '">' + pct(avg) + '</b> ' + stars(n) + '</span><span class="meta">' + tags.join('') + '</span></li>';
    }
    $('timeline').innerHTML = shown ? out : '<li class="empty">この条件に当てはまる時間はありません。</li>';
  }

  /* ---------- 描画: ひと目カード（その日の総合評価） ---------- */
  function renderHero(d) {
    var sc = d.sc, ds = Species.dayScore(sc), n = Species.stars(ds), sp = sc.sp, storm = 0;
    sc.slots.forEach(function (s) { if (s.warn === 2) storm++; });
    var off = storm >= 12;                                             // 半日（6時間）以上が荒天
    var verdict = off ? '荒天のため見送り推奨' : (sp.id !== 'all' && sc.season < 0.25) ? '時期外れ（釣りにくい魚です）' :
                  ['', '厳しい', 'やや厳しい', 'まずまず', '狙い目', '絶好のコンディション'][n];
    var cls = off ? 'bad' : n >= 4 ? 'good' : n === 3 ? 'mid' : 'low';
    var diff = Math.round((state.day - todayMid()) / DAY), rel = diff === 0 ? '今日' : diff > 0 ? diff + '日後' : (-diff) + '日前';
    $('hero').innerHTML = '<div class="hero-top"><div class="hero-pct ' + cls + '">' + pct(ds) + '</div><div class="hero-r">' +
      '<div class="hero-verdict ' + cls + '">' + esc(verdict) + '</div><div class="hero-stars">' + stars(n) + '</div></div></div>' +
      '<div class="hero-sub">' + mdw(state.day) + '（' + rel + '）・' + esc(state.spot.name) + '・' + esc(sp.name) + '　<span class="hero-note">その日いちばん良い3時間の目安</span></div>';
  }

  /* ---------- 描画: 7日間 ---------- */
  function renderWeek() {
    var base = todayMid(), html = '';
    for (var i = 0; i < 7; i++) {
      var day = base + i * DAY, fs = Tide.fishScoreSlots(ts(), day, state.spot.lat, state.spot.lon);
      var sc = Species.score(state.spot, fs, state.wx, state.sp, day, Weather), p = parts(day);
      html += '<button class="wd' + (day === state.day ? ' sel' : '') + '" data-day="' + day + '"><div class="d ' + (p.w === 0 ? 'sun' : p.w === 6 ? 'sat' : '') + '">' + p.m + '/' + p.d + '(' + WD[p.w] + ')</div>' +
              '<div class="t' + (fs.tt.type === '大潮' ? ' oo' : '') + '">' + fs.tt.type + '</div><div class="pc">' + pct(Species.dayScore(sc)) + '</div><div class="s">' + stars(Species.stars(Species.dayScore(sc))) + '</div>' +
              '<div class="w">' + (sc.warn === 2 ? '⚠荒天' : sc.warn === 1 ? '風波注意' : '') + '</div></button>';
    }
    var el = $('week'); el.innerHTML = html;
    Array.prototype.forEach.call(el.querySelectorAll('.wd'), function (b) { b.onclick = function () { state.day = +b.getAttribute('data-day'); render(); }; });
  }

  function accNote() {
    var s = state.spot, st = Tide.STATIONS[s.st].name;
    $('accNote').textContent = s.acc === 'A' ? 'この釣り場は気象庁の「' + st + '」観測点の定数で潮位を計算しています。' :
      s.acc === 'B' ? 'この釣り場は最寄りの気象庁観測点「' + st + '」の定数を使っています。入り江・港の奥などでは、満潮・干潮の時刻が少しずれることがあります。' :
      '県内の日本海側は気象庁の公表する観測点がないため、「' + st + '」の定数を流用した参考値です。時刻や潮位の差が大きい可能性があります。';
  }

  /* ---------- 全体 ---------- */
  function render() {
    var d = compute(ts(), state.day, state.sp), p = parts(state.day);
    var diff = Math.round((state.day - todayMid()) / DAY), rel = diff === 0 ? '今日' : diff > 0 ? diff + '日後' : (-diff) + '日前';
    $('dateLabel').innerHTML = p.y + '年' + mdw(state.day) + '<small>' + rel + '</small>';
    renderWeek(); renderChips(); renderSpInfo(d); renderMonth(); renderHero(d); renderWarn(d); renderSummary(d); renderWx(); renderBest(d); renderRank(d); renderChart(d); renderNow(); renderAdj(); renderTfilter(); renderTimeline(d); accNote();
  }
  loadWx();
  // 今日を見ている間は、潮位グラフの赤線と「いま」の表示を動かし続ける
  setInterval(function () { if (state.day === todayMid() && !document.hidden) render(); }, 30000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) render(); });   // アプリに戻ったらすぐ現在時刻に合わせる

  /* ---------- インストール ---------- */
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e; $('installBtn').hidden = false; $('install').open = true;
  });
  $('installBtn').onclick = function () { if (deferred) { deferred.prompt(); deferred = null; $('installBtn').hidden = true; } };
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    var hadController = !!navigator.serviceWorker.controller;           // 初回インストール時は知らせない
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      document.addEventListener('visibilitychange', function () { if (!document.hidden) reg.update().catch(function () {}); });   // アプリに戻るたびに新しい版を確認
    }).catch(function () {});
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (hadController) $('updBar').hidden = false; });
    $('updBtn').onclick = function () { location.reload(); };
  }
})();
