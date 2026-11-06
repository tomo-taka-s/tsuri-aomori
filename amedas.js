/* アメダス（気象庁の実測）：釣り場にいちばん近い観測点の「いまの風・気温」を取る。
   取れなかったとき（接続不可・ブロック等）は何も出さない。観測点は気象庁の一覧から距離で選ぶ。 */
(function (root) {
  'use strict';
  var BASE = 'https://www.jma.go.jp/bosai/amedas/';
  var TBL_KEY = 'tsuri.amtbl', TBL_AGE = 30 * 86400000, FRESH = 5 * 60000;
  var D16 = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'];
  var memo = null;

  function getJSON(url, ms) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, timer = ctl ? setTimeout(function () { ctl.abort(); }, ms || 10000) : null;
    return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) {
      if (timer) clearTimeout(timer); if (!r.ok) throw new Error('http ' + r.status); return r;
    }, function (e) { if (timer) clearTimeout(timer); throw e; });
  }
  function km(lat1, lon1, lat2, lon2) {
    var r = Math.PI / 180, dx = (lon2 - lon1) * r * Math.cos((lat1 + lat2) / 2 * r), dy = (lat2 - lat1) * r;
    return Math.sqrt(dx * dx + dy * dy) * 6371;
  }
  function val(a) { return a && a[0] != null && (a[1] == null || a[1] === 0) ? a[0] : null; }   // [値, 品質] → 正常値のみ

  /* 純粋関数: 観測点一覧 + 全国の最新値 → 釣り場に近い風が取れる観測点 */
  function pick(table, data, lat, lon) {
    var best = null;
    Object.keys(data).forEach(function (id) {
      var st = table[id], o = data[id]; if (!st || !o || val(o.wind) == null) return;
      var la = st.lat[0] + st.lat[1] / 60, lo = st.lon[0] + st.lon[1] / 60, d = km(lat, lon, la, lo);
      if (!best || d < best.km) best = { id: id, name: st.kjName, km: d, alt: st.alt };
    });
    if (!best) return null;
    var o = data[best.id], di = val(o.windDirection);
    best.wind = val(o.wind); best.temp = val(o.temp);
    best.dir = di == null || di === 0 ? null : D16[Math.round(di) % 16];
    best.calm = di === 0;
    return best;
  }

  function table() {
    try { var s = JSON.parse(localStorage.getItem(TBL_KEY) || 'null'); if (s && Date.now() - s.at < TBL_AGE) return Promise.resolve(s.d); } catch (e) {}
    return getJSON(BASE + 'const/amedastable.json').then(function (r) { return r.json(); }).then(function (d) {
      try { localStorage.setItem(TBL_KEY, JSON.stringify({ at: Date.now(), d: d })); } catch (e) {}
      return d;
    });
  }
  function latest() {
    if (memo && Date.now() - memo.at < FRESH) return Promise.resolve(memo);
    return getJSON(BASE + 'data/latest_time.txt').then(function (r) { return r.text(); }).then(function (txt) {
      var m = /(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(txt.trim()); if (!m) throw new Error('time');
      var stamp = m[1] + m[2] + m[3] + m[4] + m[5] + '00', t = Date.parse(m[0] + ':00+09:00');
      return getJSON(BASE + 'data/map/' + stamp + '.json', 15000).then(function (r) { return r.json(); }).then(function (data) {
        memo = { at: Date.now(), t: t, data: data }; return memo;
      });
    });
  }
  /* 釣り場の「いまの実測」。失敗は reject */
  function nearest(spot) {
    return Promise.all([table(), latest()]).then(function (r) {
      var p = pick(r[0], r[1].data, spot.lat, spot.lon); if (!p) throw new Error('none');
      p.t = r[1].t; return p;
    });
  }

  var api = { nearest: nearest, pick: pick, km: km };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Amedas = api;
})(typeof window !== 'undefined' ? window : this);
