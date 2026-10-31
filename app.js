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
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var state = { spot: SPOTS[0], day: todayMid(), sp: 'all', wx: null, wxNote: 'none', loading: false };
  try {
    var saved = localStorage.getItem('tsuri.spot'); SPOTS.forEach(function (s) { if (s.id === saved) state.spot = s; });
    var sp0 = localStorage.getItem('tsuri.sp'); if (sp0 && (sp0 === 'all' || Species.LIST.some(function (s) { return s.id === sp0; }))) state.sp = sp0;
  } catch (e) {}

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
  $('today').onclick = function () { state.day = todayMid(); render(); };

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
    if (w.wind != null) out.push('風' + Weather.dirName(w.dir) + ' ' + w.wind.toFixed(1) + 'm/s');
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
      html += '<div class="best-item"><div class="best-time">' + hm(a) + '〜' + hm(b) + '</div><div><div class="best-star">' + stars(w.maxStars) + '</div><div class="best-why">' + esc(why.join('・')) + '</div></div></div>';
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
             '<span class="rank-star">' + stars(Species.stars(r.ds)) + '</span><span class="rank-sub">' + esc(sub.join('・')) + '</span></button>';
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
      g += '<line x1="' + nx + '" x2="' + nx + '" y1="' + T + '" y2="' + (by + 14) + '" stroke="#e5484d" stroke-width="1.6"/><circle cx="' + nx + '" cy="' + Y(Tide.tideHeight(state.spot, now)) + '" r="4" fill="#e5484d"/>';
    }
    $('chartWrap').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="潮位グラフ">' + g + '</svg>';
  }

  /* ---------- 描画: 時系列 ---------- */
  function renderTimeline(d) {
    var sl = d.sc.slots, sun = d.fs.sun, out = '', now = Date.now();
    for (var h = 0; h < 24; h++) {
      var a = sl[2 * h], b = sl[2 * h + 1], avg = (a.score + b.score) / 2, n = Species.stars(avg), top = a.score >= b.score ? a : b;
      var t0 = state.day + h * 3600000, t1 = t0 + 3600000, tags = [];
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
      out += '<li class="tl' + (now >= t0 && now < t1 ? ' now' : '') + '"><span class="h">' + pad(h) + ':00</span>' +
             '<span class="bar"><i style="width:' + Math.max(6, Math.round(avg * 100)) + '%;background:' + col + '"></i></span>' +
             '<span class="st">' + stars(n) + '</span><span class="meta">' + tags.join('') + '</span></li>';
    }
    $('timeline').innerHTML = out;
  }

  /* ---------- 描画: 7日間 ---------- */
  function renderWeek() {
    var base = todayMid(), html = '';
    for (var i = 0; i < 7; i++) {
      var day = base + i * DAY, fs = Tide.fishScoreSlots(state.spot, day, state.spot.lat, state.spot.lon);
      var sc = Species.score(state.spot, fs, state.wx, state.sp, day, Weather), p = parts(day);
      html += '<button class="wd' + (day === state.day ? ' sel' : '') + '" data-day="' + day + '"><div class="d ' + (p.w === 0 ? 'sun' : p.w === 6 ? 'sat' : '') + '">' + p.m + '/' + p.d + '(' + WD[p.w] + ')</div>' +
              '<div class="t' + (fs.tt.type === '大潮' ? ' oo' : '') + '">' + fs.tt.type + '</div><div class="s">' + stars(Species.stars(Species.dayScore(sc))) + '</div>' +
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
    var d = compute(state.spot, state.day, state.sp), p = parts(state.day);
    var diff = Math.round((state.day - todayMid()) / DAY), rel = diff === 0 ? '今日' : diff > 0 ? diff + '日後' : (-diff) + '日前';
    $('dateLabel').innerHTML = p.y + '年' + mdw(state.day) + '<small>' + rel + '</small>';
    renderWeek(); renderChips(); renderSpInfo(d); renderWarn(d); renderSummary(d); renderWx(); renderBest(d); renderRank(d); renderChart(d); renderTimeline(d); accNote();
  }
  loadWx();
  setInterval(function () { if (state.day === todayMid() && !document.hidden) render(); }, 60000);

  /* ---------- インストール ---------- */
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e; $('installBtn').hidden = false; $('install').open = true;
  });
  $('installBtn').onclick = function () { if (deferred) { deferred.prompt(); deferred = null; $('installBtn').hidden = true; } };
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(function () {});
})();
