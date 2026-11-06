/* 天気・風・波・水温の取得（オンライン時のみ）
 * データ元: Open-Meteo（天気・風）／Open-Meteo Marine（波・海面水温）
 *  - 波と水温は広域の海況モデルの値です。湾内や港の奥では取れない・実際と違うことがあります。
 *  - 取れなかった項目は「データなし」とし、推定値は入れません。
 *  - 最後に取得した値は端末に保存し、電波がないときはそれを表示します。
 */
(function (root) {
  'use strict';
  var FC = 'https://api.open-meteo.com/v1/forecast';
  var MR = 'https://marine-api.open-meteo.com/v1/marine';
  var HOUR = 3600000, MAX_AGE = 30 * 60000;

  function qs(o) { return Object.keys(o).map(function (k) { return k + '=' + encodeURIComponent(o[k]); }).join('&'); }
  function getJSON(url, ms) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 12000);
    return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }, function (e) { clearTimeout(timer); throw e; });
  }
  // Open-Meteo の hourly を { t:[ms…], キー:[…] } に変換。全部nullなら empty
  function pack(j, keys) {
    var h = j && j.hourly; if (!h || !h.time) return { status: 'empty' };
    var out = { status: 'ok', t: h.time.map(function (s) { return Date.parse(s + ':00+09:00'); }) }, any = false;
    keys.forEach(function (k) {
      out[k] = (h[k] || []).map(function (v) { return v == null ? null : v; });
      if (out[k].some(function (v) { return v != null; })) any = true;
    });
    if (!any) out.status = 'empty';
    return out;
  }
  function part(url, keys) {
    return getJSON(url).then(function (j) { return pack(j, keys); }, function () { return { status: 'error' }; });
  }

  function key(spot) { return 'tsuri.wx2.' + spot.id; }
  function cached(spot) {
    try { var s = localStorage.getItem(key(spot)); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function isFresh(d) { return d && Date.now() - d.at < MAX_AGE; }

  var FCK = ['temperature_2m', 'precipitation', 'weather_code', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'pressure_msl'];
  /* 気象庁モデルの値を優先し、欠けている項目・時刻だけ標準モデルで補う（風は気象庁モデルが取れた分だけ jma と記録） */
  function mergeFc(r) {
    var j = r[0], g = r[1];
    if (j.status !== 'ok') return g;
    if (g.status !== 'ok') { j.model = 'jma'; return j; }
    var idx = {}; g.t.forEach(function (t, i) { idx[t] = i; });
    var out = { status: 'ok', t: j.t, model: 'jma' };
    FCK.forEach(function (k) {
      out[k] = j.t.map(function (t, i) {
        var v = j[k] && j[k][i];
        if (v != null) return v;
        var gi = idx[t]; return gi != null && g[k] ? g[k][gi] : null;
      });
    });
    return out;
  }

  function fetchAll(spot) {
    var base = { latitude: spot.lat, longitude: spot.lon, timezone: 'Asia/Tokyo', past_days: 1, forecast_days: 7 };
    var fcH = 'temperature_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl';
    var fcUrl = FC + '?' + qs(Object.assign({ hourly: fcH, wind_speed_unit: 'ms' }, base));                       // 標準（世界モデルの合成）
    var jmaUrl = FC + '?' + qs(Object.assign({ hourly: fcH, wind_speed_unit: 'ms', models: 'jma_seamless' }, base)); // 気象庁モデル（日本付近は約5km。精度が高い）
    var wvUrl = MR + '?' + qs(Object.assign({ hourly: 'wave_height,wave_direction,wave_period' }, base));
    var sstUrl = MR + '?' + qs(Object.assign({ hourly: 'sea_surface_temperature' }, base));   // 別リクエスト: 片方が失敗しても他方は使える
    return Promise.all([
      Promise.all([part(jmaUrl, FCK), part(fcUrl, FCK)]).then(mergeFc),
      part(wvUrl, ['wave_height', 'wave_direction', 'wave_period']),
      part(sstUrl, ['sea_surface_temperature'])
    ]).then(function (r) {
      var d = { at: Date.now(), fc: r[0], wave: r[1], sst: r[2] };
      if (r[0].status === 'error' && r[1].status === 'error' && r[2].status === 'error') { var e = new Error('offline'); e.offline = true; throw e; }
      try { localStorage.setItem(key(spot), JSON.stringify(d)); } catch (e2) {}
      return d;
    });
  }

  /* 時刻 ms の値を1時間値から線形補間。無ければ undefined */
  function lerp(s, k, ms, nearest) {
    if (!s || s.status !== 'ok' || !s[k]) return undefined;
    var f = (ms - s.t[0]) / HOUR, i = Math.floor(f);
    if (f < -0.01 || i > s.t.length - 1) return undefined;
    var a = s[k][Math.max(0, i)], b = s[k][Math.min(s.t.length - 1, i + 1)];
    if (nearest) { var v = f - i < 0.5 ? a : b; return v == null ? (a == null ? b : a) : v; }
    if (a == null && b == null) return undefined;
    if (a == null) return b; if (b == null) return a;
    return a + (b - a) * (f - i);
  }
  function at(d, ms) {
    if (!d) return null;
    return {
      temp: lerp(d.fc, 'temperature_2m', ms), precip: lerp(d.fc, 'precipitation', ms), code: lerp(d.fc, 'weather_code', ms, true),
      wind: lerp(d.fc, 'wind_speed_10m', ms), dir: lerp(d.fc, 'wind_direction_10m', ms, true), gust: lerp(d.fc, 'wind_gusts_10m', ms),
      pres: lerp(d.fc, 'pressure_msl', ms),
      wave: lerp(d.wave, 'wave_height', ms), wperiod: lerp(d.wave, 'wave_period', ms), sst: lerp(d.sst, 'sea_surface_temperature', ms)
    };
  }

  var DIRS = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
  function dirName(deg) { return deg == null ? '' : DIRS[Math.round(((deg % 360) + 360) % 360 / 45) % 8]; }
  function codeInfo(c) {
    if (c == null) return { t: '—', i: '' };
    if (c === 0) return { t: '快晴', i: '☀' }; if (c <= 2) return { t: '晴れ', i: '🌤' }; if (c === 3) return { t: 'くもり', i: '☁' };
    if (c === 45 || c === 48) return { t: '霧', i: '🌫' };
    if (c >= 51 && c <= 57) return { t: '霧雨', i: '🌦' };
    if ((c >= 61 && c <= 67)) return { t: '雨', i: '🌧' };
    if (c >= 80 && c <= 82) return { t: 'にわか雨', i: '🌦' };
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return { t: '雪', i: '❄' };
    if (c >= 95) return { t: '雷雨', i: '⛈' };
    return { t: '—', i: '' };
  }

  var api = { cached: cached, isFresh: isFresh, fetchAll: fetchAll, at: at, dirName: dirName, codeInfo: codeInfo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Weather = api;
})(typeof window !== 'undefined' ? window : this);
